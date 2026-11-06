/**
 * Orquestra a cópia local dos vídeos do YouTube: ferramentas, descoberta das trilhas, download
 * progressivo, montagem e cache. Primeiro plano é o vídeo que vai tocar agora, sem espera;
 * segundo plano são os antecipados pela liturgia, um por vez. O mesmo vídeo pedido duas vezes
 * usa a mesma sessão.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { mux as muxTracks } from './mux.mjs'
import { Track, serveTrack } from './progressive.mjs'
import { DEFAULT_HEIGHT, OnlineVideoError, isVideoId, resolveTracks } from './resolver.mjs'
import { execTool, minimalEnv } from './tools.mjs'

export const STREAM_URL_BASE = 'local://yt-stream'
export const CACHE_URL_BASE = 'local://yt-cache'
const RESOLVE_TIMEOUT_MS = 120_000
const SUBTITLE_TIMEOUT_MS = 8_000

/**
 * @typedef {{ kind: 'cache', id: string, title: string, duration: number, file: string, src: string, subtitle: string | null }
 *   | { kind: 'stream', id: string, title: string, duration: number, src: string, audioSrc: string | null, subtitle: string | null }} PlaySource
 * @typedef {{ state: 'none'|'queued'|'resolving'|'downloading'|'muxing'|'ready'|'error', progress?: number,
 *   code?: string, message?: string }} VideoStatus
 */

function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(new OnlineVideoError('cancelled', 'Download cancelado'))
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new OnlineVideoError('cancelled', 'Download cancelado'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function normalizeError(error, signal) {
  if (signal?.aborted) return new OnlineVideoError('cancelled', 'Download cancelado')
  if (error instanceof OnlineVideoError) return error
  return new OnlineVideoError('network', error?.message || String(error))
}

async function fetchSubtitle(url, file, signal) {
  const timeout = AbortSignal.timeout(SUBTITLE_TIMEOUT_MS)
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
}

export class OnlineVideoManager {
  /**
   * @param {{ tools: import('./tools.mjs').Tools, cache: import('./cache-store.mjs').CacheStore,
   *   getSettings?: () => { maxHeight?: number, locale?: string }, ytdlpCacheDir?: string,
   *   resolve?: typeof resolveTracks, createTrack?: (opts: any) => Track, mux?: typeof muxTracks,
   *   exec?: typeof execTool, downloadSubtitle?: typeof fetchSubtitle, jsRuntime?: string,
   *   now?: () => number, onChange?: (id: string, status: VideoStatus) => void }} opts
   */
  constructor(opts) {
    this.tools = opts.tools
    this.cache = opts.cache
    this.getSettings = opts.getSettings ?? (() => ({}))
    this.ytdlpCacheDir = opts.ytdlpCacheDir
    this.resolve = opts.resolve ?? resolveTracks
    this.createTrack = opts.createTrack ?? ((trackOpts) => new Track(trackOpts))
    this.mux = opts.mux ?? muxTracks
    this.exec = opts.exec ?? execTool
    this.downloadSubtitle = opts.downloadSubtitle ?? fetchSubtitle
    this.jsRuntime = opts.jsRuntime ?? `node:${process.execPath}`
    this.now = opts.now ?? Date.now
    this.onChange = opts.onChange
    this.sessions = new Map()
    this.failures = new Map()
    this.playing = new Set()
    this.background = null
  }

  get available() {
    return this.tools.available
  }

  /**
   * Fonte para tocar agora: o arquivo do cache ou as trilhas baixando. Rejeita quando não dá
   * para tocar por aqui; quem chama abre a página do YouTube (plano B).
   * @returns {Promise<PlaySource>}
   */
  async play(id) {
    if (!isVideoId(id)) throw new OnlineVideoError('format', 'ID de vídeo inválido')
    this.playing.add(id)
    this.cache.protect(id)
    if (this.cache.has(id)) {
      await this.cache.touch(id)
      return this.#cacheSource(id)
    }
    let session = this.sessions.get(id)
    if (session?.finished) {
      await this.#dispose(session)
      session = undefined
    }
    session ??= this.#create(id)
    this.#promote(session)
    try {
      const info = await session.ready
      return {
        kind: 'stream',
        id,
        title: info.title,
        duration: info.duration,
        src: `${STREAM_URL_BASE}/${id}/video`,
        audioSrc: info.audio ? `${STREAM_URL_BASE}/${id}/audio` : null,
        subtitle: session.subtitleLang ? `${CACHE_URL_BASE}/${id}.vtt` : null,
      }
    } catch (error) {
      await this.release(id)
      throw error
    }
  }

  /** O vídeo saiu da tela: pode ser descartado do cache e a sessão já montada é encerrada. */
  async release(id) {
    this.playing.delete(id)
    this.cache.unprotect(id)
    const session = this.sessions.get(id)
    if (session?.finished) await this.#dispose(session)
  }

  /** Enfileira em segundo plano os vídeos que ainda não estão no cache. */
  prefetch(ids) {
    for (const id of ids) {
      if (!isVideoId(id) || this.cache.has(id) || this.sessions.has(id)) continue
      this.failures.delete(id)
      this.#create(id, { queued: true })
    }
    this.#pump()
  }

  /** Cancela um download antecipado. O vídeo que está tocando não é interrompido. */
  async cancel(id) {
    const session = this.sessions.get(id)
    if (!session || this.playing.has(id)) return
    await this.#abort(session)
  }

  /** Para os downloads; o cache fica. Com `keepPlaying`, o vídeo na tela continua. */
  async cancelAll({ keepPlaying = false } = {}) {
    const sessions = [...this.sessions.values()].filter((session) => !keepPlaying || !this.playing.has(session.id))
    await Promise.all(sessions.map((session) => this.#abort(session)))
  }

  /** @returns {VideoStatus} */
  status(id) {
    const session = this.sessions.get(id)
    if (this.cache.has(id)) return { state: 'ready' }
    if (session && session.state !== 'error') return { state: session.state, progress: session.progress }
    const failure = this.failures.get(id)
    if (failure) return { state: 'error', code: failure.code, message: failure.message }
    return { state: 'none' }
  }

  /** Resposta do `local://yt-stream/<id>/<video|audio>`. */
  serve(id, kind, rangeHeader, signal) {
    const session = this.sessions.get(id)
    const track = session?.tracks?.[kind]
    if (!track) return new Response(null, { status: 404 })
    const ext = session.info[kind].ext === 'webm' ? 'webm' : 'mp4'
    return serveTrack(track, rangeHeader, { mime: `${kind}/${ext}`, signal })
  }

  #cacheSource(id) {
    const entry = this.cache.get(id)
    return {
      kind: 'cache',
      id,
      title: entry.title,
      duration: entry.duration,
      file: this.cache.videoPath(id),
      src: `${CACHE_URL_BASE}/${id}.mp4`,
      subtitle: entry.subtitleLang ? `${CACHE_URL_BASE}/${id}.vtt` : null,
    }
  }

  #create(id, { queued = false } = {}) {
    const session = {
      id,
      state: 'queued',
      progress: 0,
      queued,
      started: false,
      finished: false,
      info: null,
      tracks: null,
      subtitleLang: null,
      abort: new AbortController(),
      dir: this.cache.streamDir(id),
    }
    session.ready = new Promise((resolve, reject) => {
      session.resolveReady = resolve
      session.rejectReady = reject
    })
    session.ready.catch(() => {})
    this.sessions.set(id, session)
    this.#emit(id)
    return session
  }

  #promote(session) {
    session.queued = false
    if (this.background === session) {
      this.background = null
      this.#pump()
    }
    if (!session.started) this.#start(session)
  }

  #pump() {
    if (this.background) return
    const next = [...this.sessions.values()].find((session) => session.queued && !session.started)
    if (!next) return
    this.background = next
    this.#start(next).finally(() => {
      if (this.background === next) this.background = null
      this.#pump()
    })
  }

  #start(session) {
    session.started = true
    session.run = this.#run(session)
    return session.run
  }

  async #run(session) {
    const { id } = session
    const { signal } = session.abort
    try {
      this.#setState(session, 'resolving')
      await this.tools.ensure({ signal })
      const info = await this.#resolveWithRenew(id, signal)
      await delay(info.availableAt - this.now(), signal)
      await mkdir(session.dir, { recursive: true })
      session.info = info
      session.tracks = { video: this.#track(session, 'video'), audio: info.audio ? this.#track(session, 'audio') : null }
      const tracks = Object.values(session.tracks).filter(Boolean)
      await Promise.all([
        ...tracks.map((track) => track.start()),
        info.subtitle ? this.#fetchSubtitle(session, info.subtitle, signal) : null,
      ])
      if (signal.aborted) throw new OnlineVideoError('cancelled', 'Download cancelado')
      this.#setState(session, 'downloading')
      session.resolveReady(info)
      await Promise.all(tracks.map((track) => track.done))

      this.#setState(session, 'muxing')
      const size = await this.mux({
        ffmpeg: this.tools.paths().ffmpeg,
        video: path.join(session.dir, 'video'),
        audio: info.audio ? path.join(session.dir, 'audio') : null,
        output: this.cache.videoPath(id),
        exec: this.exec,
        signal,
      })
      await this.cache.add(id, {
        title: info.title,
        duration: info.duration,
        height: info.height,
        size,
        subtitleLang: session.subtitleLang,
      })
      session.finished = true
      session.state = 'ready'
      if (!this.playing.has(id)) await this.#dispose(session)
      this.#emit(id)
    } catch (raw) {
      const error = normalizeError(raw, signal)
      session.rejectReady(error)
      session.finished = true
      if (error.code !== 'cancelled') this.failures.set(id, error)
      if (!this.playing.has(id) || !session.tracks || error.code === 'cancelled' || session.state !== 'muxing') {
        await this.#dispose(session)
      }
      if (error.code === 'cancelled') await rm(this.cache.subtitlePath(id), { force: true })
      session.state = 'error'
      this.#emit(id)
    }
  }

  async #resolveWithRenew(id, signal) {
    try {
      return await this.#resolveOnce(id, signal)
    } catch (error) {
      if (error?.code !== 'extractor' || signal.aborted) throw error
      if (!(await this.tools.renewAfterExtractorError({ signal }))) throw error
      return this.#resolveOnce(id, signal)
    }
  }

  #resolveOnce(id, signal) {
    const { maxHeight = DEFAULT_HEIGHT, locale } = this.getSettings()
    const run = (args) => this.exec(this.tools.paths().ytdlp, args, {
      timeoutMs: RESOLVE_TIMEOUT_MS,
      env: minimalEnv({ ELECTRON_RUN_AS_NODE: '1' }),
      cwd: this.cache.dir,
      signal,
    })
    return this.resolve({ id, maxHeight, locale, jsRuntime: this.jsRuntime, cacheDir: this.ytdlpCacheDir, run })
  }

  #track(session, kind) {
    const { url, size } = session.info[kind]
    return this.createTrack({
      url,
      size,
      file: path.join(session.dir, kind),
      refreshUrl: async () => {
        const fresh = await this.#resolveOnce(session.id, session.abort.signal)
        if (fresh[kind]?.size !== size) throw new OnlineVideoError('format', 'A trilha mudou ao renovar o link')
        return fresh[kind].url
      },
      onProgress: () => this.#updateProgress(session),
    })
  }

  async #fetchSubtitle(session, subtitle, signal) {
    try {
      await this.downloadSubtitle(subtitle.url, this.cache.subtitlePath(session.id), signal)
      session.subtitleLang = subtitle.lang
    } catch {
      session.subtitleLang = null
    }
  }

  #updateProgress(session) {
    const tracks = Object.values(session.tracks ?? {}).filter(Boolean)
    const total = tracks.reduce((sum, track) => sum + track.size, 0)
    const downloaded = tracks.reduce((sum, track) => sum + track.have.total(), 0)
    session.progress = total > 0 ? downloaded / total : 0
    this.#emit(session.id)
  }

  #setState(session, state) {
    session.state = state
    this.#emit(session.id)
  }

  async #abort(session) {
    session.abort.abort()
    if (!session.started) {
      session.rejectReady(new OnlineVideoError('cancelled', 'Download cancelado'))
      this.sessions.delete(session.id)
      this.#emit(session.id)
      return
    }
    for (const track of Object.values(session.tracks ?? {})) await track?.cancel()
    await session.run
  }

  async #dispose(session) {
    if (this.sessions.get(session.id) === session) this.sessions.delete(session.id)
    for (const track of Object.values(session.tracks ?? {})) await track?.close()
    await rm(session.dir, { recursive: true, force: true })
  }

  #emit(id) {
    this.onChange?.(id, this.status(id))
  }
}
