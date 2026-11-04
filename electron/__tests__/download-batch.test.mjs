import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDownloadBatch } from '../ipc/download-batch.mjs'

const tempDirs = []

function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'piano-dl-batch-'))
  tempDirs.push(dir)
  return dir
}

function createHarness(fetchImpl, existingQueue) {
  const workdir = makeTempDir()
  const mediaDir = path.join(workdir, 'Media')
  mkdirSync(mediaDir, { recursive: true })
  const queuePath = path.join(workdir, 'download-queue.json')
  if (existingQueue) writeFileSync(queuePath, JSON.stringify(existingQueue))

  const emitted = []
  const sender = new EventEmitter()
  sender.send = (channel, payload) => emitted.push({ channel, payload })

  const defaultFetch = async (url, init = {}) => {
    const range = init.headers && init.headers.range
    const full = Buffer.alloc(100, 65) // 'A' * 100
    if (range) {
      const match = /bytes=(\d+)-/.exec(range)
      const start = match ? Number(match[1]) : 0
      const slice = full.subarray(start)
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
        headers: { get: n => (n === 'content-range' ? `bytes ${start}-${99}/100` : null) },
      }
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength),
      headers: { get: () => null },
    }
  }

  const batch = createDownloadBatch({
    mediaDir,
    queuePath,
    sender,
    fetch: fetchImpl || defaultFetch,
    retries: 3,
  })
  return { batch, workdir, mediaDir, queuePath, emitted }
}

const channelOf = (emitted, channel) => emitted.filter(e => e.channel === channel)
const last = arr => arr[arr.length - 1]

describe('download-batch', () => {
  beforeEach(() => { })
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  it('enfileira 2 itens e processa em série gravando os arquivos', async () => {
    const { batch, mediaDir, emitted } = createHarness()
    batch.enqueue([
      { id: 'a', url: 'http://x/a.mp4', fileName: 'a.mp4' },
      { id: 'b', url: 'http://x/b.mp4', fileName: 'b.mp4' },
    ])
    await batch.waitIdle()

    expect(existsSync(path.join(mediaDir, 'provai-e-vede', 'a.mp4'))).toBe(true)
    expect(existsSync(path.join(mediaDir, 'provai-e-vede', 'b.mp4'))).toBe(true)
    const progress = channelOf(emitted, 'download-progress')
    expect(progress.length).toBeGreaterThan(0)
    const final = last(progress).payload
    expect(final.done).toBe(2)
    expect(final.total).toBe(2)
  }, 15000)

  it('.part existente retoma com Range (não baixa do zero)', async () => {
    const calls = []
    const fetchMock = async (url, init = {}) => {
      calls.push(init.headers && init.headers.range)
      const full = Buffer.alloc(100, 65)
      const range = init.headers && init.headers.range
      if (range) {
        const match = /bytes=(\d+)-/.exec(range)
        const start = Number(match[1])
        const slice = full.subarray(start)
        return {
          ok: true,
          status: 206,
          arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
          headers: { get: n => (n === 'content-range' ? `bytes ${start}-${99}/100` : null) },
        }
      }
      return { ok: true, status: 200, arrayBuffer: async () => full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength), headers: { get: () => null } }
    }

    const h = createHarness(fetchMock)
    const dir = path.join(h.mediaDir, 'provai-e-vede')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'a.mp4.part'), Buffer.alloc(40, 66)) // 'B' * 40

    h.batch.enqueue([{ id: 'a', url: 'http://x/a.mp4', fileName: 'a.mp4' }])
    await h.batch.waitIdle()

    expect(calls[0]).toBe('bytes=40-')
    expect(existsSync(path.join(h.mediaDir, 'provai-e-vede', 'a.mp4'))).toBe(true)
    const finalSize = readFileSync(path.join(h.mediaDir, 'provai-e-vede', 'a.mp4')).length
    expect(finalSize).toBe(100)
  }, 15000)

  it('falha → 3 retries → item failed + evento failed', async () => {
    let attempts = 0
    const fetchMock = async () => {
      attempts += 1
      return { ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } }
    }
    const { batch, emitted } = createHarness(fetchMock)
    batch.enqueue([{ id: 'a', url: 'http://x/a.mp4', fileName: 'a.mp4' }])
    await batch.waitIdle()

    expect(attempts).toBe(3)
    const failed = channelOf(emitted, 'download-item-failed')
    expect(failed.length).toBeGreaterThan(0)
    expect(last(failed).payload.id).toBe('a')
  }, 15000)

  it('conclusão grava rename atômico (.part → arquivo final)', async () => {
    const { batch, mediaDir } = createHarness()
    batch.enqueue([{ id: 'a', url: 'http://x/a.mp4', fileName: 'a.mp4' }])
    await batch.waitIdle()

    const final = path.join(mediaDir, 'provai-e-vede', 'a.mp4')
    expect(existsSync(final)).toBe(true)
    expect(existsSync(`${final}.part`)).toBe(false)
  }, 15000)

  it('persiste fila e rehidrata no boot (itens pendentes retomam)', async () => {
    const queue = {
      version: 1,
      items: [{ id: 'a', url: 'http://x/a.mp4', fileName: 'a.mp4', status: 'pending', attempts: 0 }],
    }
    const h = createHarness(undefined, queue)
    const pending = h.batch.getPending()
    expect(pending.map(i => i.id)).toEqual(['a'])

    h.batch.resume()
    await h.batch.waitIdle()
    expect(existsSync(path.join(h.mediaDir, 'provai-e-vede', 'a.mp4'))).toBe(true)
  }, 15000)

  it('fila corrompida → descarta silencioso e recomeça vazio', () => {
    const workdir = makeTempDir()
    const queuePath = path.join(workdir, 'download-queue.json')
    writeFileSync(queuePath, '{not-json!!')
    const sender = new EventEmitter(); sender.send = () => { }
    const batch = createDownloadBatch({ mediaDir: path.join(workdir, 'Media'), queuePath, sender, fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } }), retries: 1 })
    expect(batch.getPending()).toEqual([])
  }, 15000)

  it('cancel emite evento e para o item em curso', async () => {
    const { batch, emitted } = createHarness()
    batch.enqueue([
      { id: 'a', url: 'http://x/a.mp4', fileName: 'a.mp4' },
      { id: 'b', url: 'http://x/b.mp4', fileName: 'b.mp4' },
    ])
    batch.cancel('b')
    await batch.waitIdle()
    const cancelled = channelOf(emitted, 'download-item-cancelled')
    expect(cancelled.length).toBeGreaterThan(0)
    expect(last(cancelled).payload.id).toBe('b')
  }, 15000)
})
