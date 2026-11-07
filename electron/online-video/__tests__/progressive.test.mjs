// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpStatusError, Track, parseRangeHeader, serveTrack } from '../progressive.mjs'

const CHUNK = 1000
const SIZE = 4500

function payload(size = SIZE) {
  const buf = Buffer.alloc(size)
  for (let i = 0; i < size; i++) buf[i] = i % 251
  return buf
}

/** CDN em memória; `gate` segura cada pedido até ser liberado pelo teste. */
function fakeCdn(data, { gate = false } = {}) {
  const calls = []
  const pending = []
  const fetchRange = vi.fn(async (url, start, end) => {
    calls.push({ url, start, end })
    if (gate) await new Promise(resolve => pending.push(resolve))
    return data.subarray(start, end)
  })
  const releaseNext = async () => {
    for (let i = 0; i < 50 && pending.length === 0; i++) await new Promise(r => setTimeout(r, 1))
    pending.shift()?.()
    await new Promise(r => setTimeout(r, 5))
  }
  return { calls, fetchRange, releaseNext }
}

async function readBody(response) {
  return Buffer.from(await new Response(response.body).arrayBuffer())
}

let dir
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'piano-progressive-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('parseRangeHeader', () => {
  it('reads closed, open-ended and suffix ranges', () => {
    expect(parseRangeHeader('bytes=100-199', SIZE)).toEqual({ start: 100, end: 200 })
    expect(parseRangeHeader('bytes=100-', SIZE)).toEqual({ start: 100, end: SIZE })
    expect(parseRangeHeader('bytes=-500', SIZE)).toEqual({ start: SIZE - 500, end: SIZE })
    expect(parseRangeHeader('bytes=4000-99999', SIZE)).toEqual({ start: 4000, end: SIZE })
  })

  it('returns null without a header and "unsatisfiable" past the end', () => {
    expect(parseRangeHeader(null, SIZE)).toBeNull()
    expect(parseRangeHeader('bytes=4500-', SIZE)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=300-200', SIZE)).toBe('unsatisfiable')
    expect(parseRangeHeader('items=1-2', SIZE)).toBe('unsatisfiable')
  })
})

describe('Track', () => {
  it('downloads every chunk into a preallocated file and reports progress', async () => {
    const data = payload()
    const cdn = fakeCdn(data)
    const progress = []
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 2, onProgress: p => progress.push(p) })
    await track.start()
    await track.done
    expect(readFileSync(path.join(dir, 'v')).equals(data)).toBe(true)
    expect(cdn.calls.map(c => [c.start, c.end]).sort((a, b) => a[0] - b[0])).toEqual([[0, 1000], [1000, 2000], [2000, 3000], [3000, 4000], [4000, 4500]])
    expect(progress.at(-1)).toEqual({ downloaded: SIZE, size: SIZE })
    await track.close()
  })

  it('moves the download to the position the player asked for', async () => {
    const cdn = fakeCdn(payload(), { gate: true })
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 1 })
    await track.start()
    await cdn.releaseNext()
    track.jump(3500)
    await cdn.releaseNext()
    await cdn.releaseNext()
    await cdn.releaseNext()
    await cdn.releaseNext()
    await track.done
    expect(cdn.calls.map(c => c.start)).toEqual([0, 1000, 3000, 4000, 2000])
    await track.close()
  })

  it('waits for a byte range and reads it from disk once it arrives', async () => {
    const data = payload()
    const cdn = fakeCdn(data, { gate: true })
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 1 })
    await track.start()
    let ready = false
    const waiting = track.waitFor(1500).then(() => { ready = true })
    await cdn.releaseNext()
    expect(ready).toBe(false)
    await cdn.releaseNext()
    await waiting
    expect((await track.read(1500, 1600)).equals(data.subarray(1500, 1600))).toBe(true)
    await track.cancel()
  })

  it('stops waiting when the player aborts the request', async () => {
    const cdn = fakeCdn(payload(), { gate: true })
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 1 })
    await track.start()
    const controller = new AbortController()
    const waiting = track.waitFor(4000, controller.signal)
    controller.abort()
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    await track.cancel()
  })

  it('retries a failed chunk before giving up', async () => {
    const data = payload(2000)
    let failures = 2
    const fetchRange = vi.fn(async (url, start, end) => {
      if (start === 1000 && failures-- > 0) throw new Error('connect ETIMEDOUT')
      return data.subarray(start, end)
    })
    const track = new Track({ url: 'https://cdn/v', size: 2000, file: path.join(dir, 'v'), fetchRange, chunkSize: CHUNK, connections: 1, retryDelayMs: 0 })
    await track.start()
    await track.done
    expect(fetchRange).toHaveBeenCalledTimes(4)
    await track.close()
  })

  it('fails the track and its waiters after the retries run out', async () => {
    const fetchRange = vi.fn(async () => { throw new Error('connect ETIMEDOUT') })
    const track = new Track({ url: 'https://cdn/v', size: 2000, file: path.join(dir, 'v'), fetchRange, chunkSize: CHUNK, connections: 1, retryDelayMs: 0 })
    const done = track.done.catch(error => error)
    await track.start()
    await expect(track.waitFor(500)).rejects.toMatchObject({ code: 'network' })
    expect((await done).code).toBe('network')
    expect(fetchRange).toHaveBeenCalledTimes(4)
    await track.close()
  })

  it('asks for a fresh link when the CDN answers 403 and resumes with it', async () => {
    const data = payload(2000)
    const fetchRange = vi.fn(async (url, start, end) => {
      if (url === 'https://cdn/old' && start >= 1000) throw new HttpStatusError(403)
      return data.subarray(start, end)
    })
    const refreshUrl = vi.fn(async () => 'https://cdn/new')
    const track = new Track({ url: 'https://cdn/old', size: 2000, file: path.join(dir, 'v'), fetchRange, refreshUrl, chunkSize: CHUNK, connections: 1, retryDelayMs: 0 })
    await track.start()
    await track.done
    expect(refreshUrl).toHaveBeenCalledTimes(1)
    expect(fetchRange.mock.calls.at(-1)[0]).toBe('https://cdn/new')
    expect(readFileSync(path.join(dir, 'v')).equals(data)).toBe(true)
    await track.close()
  })

  it('cancels pending waiters and stops fetching', async () => {
    const cdn = fakeCdn(payload(), { gate: true })
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 1 })
    const done = track.done.catch(error => error)
    await track.start()
    const waiting = track.waitFor(4000).catch(error => error)
    await track.cancel()
    expect((await waiting).code).toBe('cancelled')
    expect((await done).code).toBe('cancelled')
    await cdn.releaseNext()
    expect(cdn.calls).toHaveLength(1)
  })
})

describe('serveTrack', () => {
  it('answers a range that is still downloading with 206 and the exact bytes', async () => {
    const data = payload()
    const cdn = fakeCdn(data)
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 1 })
    await track.start()
    const response = serveTrack(track, 'bytes=3100-4299', { mime: 'video/mp4' })
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe(`bytes 3100-4299/${SIZE}`)
    expect(response.headers.get('Content-Length')).toBe('1200')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect((await readBody(response)).equals(data.subarray(3100, 4300))).toBe(true)
    await track.close()
  })

  it('answers without a range with 200 and the whole track', async () => {
    const data = payload()
    const cdn = fakeCdn(data)
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 2 })
    await track.start()
    const response = serveTrack(track, null, { mime: 'audio/mp4' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe(String(SIZE))
    expect((await readBody(response)).equals(data)).toBe(true)
    await track.close()
  })

  it('answers 416 to a range past the end of the track', async () => {
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: fakeCdn(payload()).fetchRange, chunkSize: CHUNK })
    const response = serveTrack(track, 'bytes=9000-', { mime: 'video/mp4' })
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe(`bytes */${SIZE}`)
  })

  it('stops waiting for bytes when the player aborts the request', async () => {
    const cdn = fakeCdn(payload(), { gate: true })
    const track = new Track({ url: 'https://cdn/v', size: SIZE, file: path.join(dir, 'v'), fetchRange: cdn.fetchRange, chunkSize: CHUNK, connections: 1 })
    await track.start()
    const controller = new AbortController()
    const response = serveTrack(track, 'bytes=4000-', { mime: 'video/mp4', signal: controller.signal })
    const reading = readBody(response).catch(error => error)
    controller.abort()
    expect(await reading).toBeInstanceOf(Error)
    await track.cancel()
  })
})
