/**
 * Download de uma trilha em pedaços, com várias conexões, para um arquivo que já nasce do tamanho final.
 * Uma conexão única ao YouTube fica limitada a cerca de 2 vezes a taxa do vídeo; pedaços de 2 MB
 * chegam a 8–10 MB/s. O player lê do arquivo enquanto ele é preenchido (`serveTrack`).
 */
import { open } from 'node:fs/promises'
import { RangeSet } from './range-set.mjs'
import { OnlineVideoError } from './resolver.mjs'

export const CHUNK_SIZE = 2 * 1024 * 1024
const READ_SLICE = 256 * 1024

export class HttpStatusError extends Error {
  /** @param {number} status */
  constructor(status) {
    super(`HTTP ${status}`)
    this.name = 'HttpStatusError'
    this.status = status
  }
}

/**
 * @param {string} url @param {number} start @param {number} end fim exclusivo
 * @param {AbortSignal} [signal]
 */
export async function fetchRangeHttp(url, start, end, signal) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` }, signal })
  if (res.status !== 206) {
    await res.body?.cancel()
    throw new HttpStatusError(res.status)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length !== end - start) throw new Error(`Trecho incompleto: ${buf.length} de ${end - start} bytes`)
  return buf
}

/**
 * Intervalo semiaberto pedido pelo player; `null` sem cabeçalho, `'unsatisfiable'` fora da trilha.
 * @param {string | null | undefined} header @param {number} size
 */
export function parseRangeHeader(header, size) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'unsatisfiable'
  if (match[1] === '') {
    const suffix = Math.min(Number(match[2]), size)
    return suffix > 0 ? { start: size - suffix, end: size } : 'unsatisfiable'
  }
  const start = Number(match[1])
  const last = match[2] === '' ? size - 1 : Number(match[2])
  if (start >= size || last < start) return 'unsatisfiable'
  return { start, end: Math.min(last + 1, size) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const abortError = () => new DOMException('Pedido cancelado', 'AbortError')

export class Track {
  #url
  #file
  #fetchRange
  #refreshUrl
  #chunkSize
  #connections
  #retries
  #retryDelayMs
  #onProgress
  /** @type {import('node:fs/promises').FileHandle | null} */
  #fh = null
  #inflight = new Set()
  #target = 0
  #waiters = new Set()
  /** @type {'idle'|'running'|'done'|'failed'|'cancelled'} */
  #state = 'idle'
  #refreshing = null
  #controller = new AbortController()
  #resolveDone
  #rejectDone

  /**
   * @param {{ url: string, size: number, file: string,
   *   fetchRange?: (url: string, start: number, end: number, signal: AbortSignal) => Promise<Buffer>,
   *   refreshUrl?: () => Promise<string>, chunkSize?: number, connections?: number,
   *   retries?: number, retryDelayMs?: number,
   *   onProgress?: (p: { downloaded: number, size: number }) => void }} opts
   */
  constructor({ url, size, file, fetchRange = fetchRangeHttp, refreshUrl, chunkSize = CHUNK_SIZE, connections = 3, retries = 3, retryDelayMs = 500, onProgress }) {
    this.#url = url
    this.size = size
    this.#file = file
    this.#fetchRange = fetchRange
    this.#refreshUrl = refreshUrl
    this.#chunkSize = chunkSize
    this.#connections = connections
    this.#retries = retries
    this.#retryDelayMs = retryDelayMs
    this.#onProgress = onProgress
    this.have = new RangeSet()
    /** @type {OnlineVideoError | null} */
    this.error = null
    this.done = new Promise((resolve, reject) => {
      this.#resolveDone = resolve
      this.#rejectDone = reject
    })
    this.done.catch(() => {})
  }

  get state() {
    return this.#state
  }

  get #chunkCount() {
    return Math.ceil(this.size / this.#chunkSize)
  }

  async start() {
    if (this.#state !== 'idle') return
    this.#state = 'running'
    const fh = await open(this.#file, 'w+')
    await fh.truncate(this.size)
    if (this.#state !== 'running') {
      await fh.close()
      return
    }
    this.#fh = fh
    const workers = Math.max(1, Math.min(this.#connections, this.#chunkCount))
    for (let i = 0; i < workers; i++) void this.#worker()
  }

  /** O próximo pedaço a baixar passa a ser o que contém `pos`. */
  jump(pos) {
    this.#target = Math.max(0, Math.min(pos, this.size - 1))
  }

  /** Resolve quando o byte `pos` estiver no disco. */
  waitFor(pos, signal) {
    if (this.have.has(pos, pos + 1)) return Promise.resolve()
    if (this.error) return Promise.reject(this.error)
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.#waiters.delete(waiter)
        reject(abortError())
      }
      const waiter = {
        pos,
        resolve: () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort)
          reject(error)
        },
      }
      if (signal?.aborted) return reject(abortError())
      signal?.addEventListener('abort', onAbort, { once: true })
      this.#waiters.add(waiter)
    })
  }

  /** @param {number} start @param {number} end fim exclusivo */
  async read(start, end) {
    if (!this.#fh) throw new OnlineVideoError('cancelled', 'Trilha fechada')
    const buf = Buffer.alloc(end - start)
    const { bytesRead } = await this.#fh.read(buf, 0, buf.length, start)
    return buf.subarray(0, bytesRead)
  }

  async cancel() {
    if (this.#state === 'running' || this.#state === 'idle') {
      this.#stop('cancelled', new OnlineVideoError('cancelled', 'Download cancelado'))
    }
    await this.#closeFile()
  }

  async close() {
    await this.cancel()
  }

  async #closeFile() {
    const fh = this.#fh
    this.#fh = null
    await fh?.close().catch(() => {})
  }

  #stop(state, error) {
    this.#state = state
    this.error = error
    this.#controller.abort()
    for (const waiter of this.#waiters) waiter.reject(error)
    this.#waiters.clear()
    this.#rejectDone(error)
  }

  #nextChunk() {
    const count = this.#chunkCount
    const from = Math.floor(this.#target / this.#chunkSize)
    const free = (i) => !this.#inflight.has(i) && !this.have.has(i * this.#chunkSize, Math.min((i + 1) * this.#chunkSize, this.size))
    for (let i = from; i < count; i++) if (free(i)) return i
    for (let i = 0; i < from; i++) if (free(i)) return i
    return -1
  }

  async #worker() {
    while (this.#state === 'running') {
      const index = this.#nextChunk()
      if (index === -1) return
      this.#inflight.add(index)
      const start = index * this.#chunkSize
      const end = Math.min(start + this.#chunkSize, this.size)
      try {
        const buf = await this.#fetchWithRetry(start, end)
        if (this.#state !== 'running' || !this.#fh) return
        await this.#fh.write(buf, 0, buf.length, start)
        this.have.add(start, end)
      } catch (error) {
        if (this.#state === 'running') {
          const reason = error instanceof OnlineVideoError ? error : new OnlineVideoError('network', String(error?.message ?? error))
          this.#stop('failed', reason)
        }
        return
      } finally {
        this.#inflight.delete(index)
      }
      this.#notify()
    }
  }

  async #fetchWithRetry(start, end) {
    for (let attempt = 0; ; attempt++) {
      const url = this.#url
      try {
        return await this.#fetchRange(url, start, end, this.#controller.signal)
      } catch (error) {
        if (this.#state !== 'running' || attempt >= this.#retries) throw error
        if (error?.status === 403 && this.#refreshUrl) {
          await this.#refresh(url)
          continue
        }
        if (this.#retryDelayMs > 0) await sleep(this.#retryDelayMs * (attempt + 1))
      }
    }
  }

  /** Um link novo por vez, mesmo com várias conexões recebendo 403 juntas. */
  #refresh(failedUrl) {
    if (this.#url !== failedUrl) return Promise.resolve()
    this.#refreshing ??= Promise.resolve(this.#refreshUrl())
      .then((url) => {
        this.#url = url
      })
      .finally(() => {
        this.#refreshing = null
      })
    return this.#refreshing
  }

  #notify() {
    for (const waiter of this.#waiters) {
      if (this.have.has(waiter.pos, waiter.pos + 1)) {
        this.#waiters.delete(waiter)
        waiter.resolve()
      }
    }
    const downloaded = this.have.total()
    this.#onProgress?.({ downloaded, size: this.size })
    if (downloaded === this.size && this.#state === 'running') {
      this.#state = 'done'
      this.#resolveDone()
    }
  }
}

/**
 * Resposta HTTP de um pedido do player a uma trilha que pode ainda estar baixando.
 * @param {Track} track @param {string | null} rangeHeader
 * @param {{ mime: string, signal?: AbortSignal }} opts
 */
export function serveTrack(track, rangeHeader, { mime, signal }) {
  const size = track.size
  const range = parseRangeHeader(rangeHeader, size)
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const start = range ? range.start : 0
  const end = range ? range.end : size
  const local = new AbortController()
  const onAbort = () => local.abort()
  const cleanup = () => signal?.removeEventListener('abort', onAbort)
  if (signal?.aborted) local.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })

  let pos = start
  const body = new ReadableStream({
    async pull(controller) {
      try {
        if (!track.have.has(pos, pos + 1)) {
          track.jump(pos)
          await track.waitFor(pos, local.signal)
        }
        const stop = Math.min(track.have.contiguousFrom(pos), end, pos + READ_SLICE)
        const chunk = await track.read(pos, stop)
        pos += chunk.length
        controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length))
        if (pos >= end) {
          cleanup()
          controller.close()
        }
      } catch (error) {
        cleanup()
        controller.error(error)
      }
    },
    cancel() {
      local.abort()
      cleanup()
    },
  })

  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(end - start),
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end - 1}/${size}` } : {}),
    },
  })
}
