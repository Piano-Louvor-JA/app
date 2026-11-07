/**
 * Liga a cópia local dos vídeos do YouTube ao resto do app: configurações persistidas no workspace,
 * instalação adiada das ferramentas, verificação diária do yt-dlp e canais IPC do renderer.
 */
import path from 'node:path'
import { CacheStore } from './cache-store.mjs'
import { OnlineVideoManager } from './manager.mjs'
import { DEFAULT_HEIGHT, QUALITY_HEIGHTS } from './resolver.mjs'
import { Tools, UPDATE_INTERVAL_MS } from './tools.mjs'

export const ONLINE_VIDEO_RECORD = 'online-video'
export const CACHE_LIMIT_GB_OPTIONS = [2, 4, 6, 10, 20]
/** Desligado: toca pela página do YouTube e só baixa a cópia quando a página não toca. */
export const DEFAULT_SETTINGS = Object.freeze({ enabled: false, maxHeight: DEFAULT_HEIGHT, limitGb: 6 })
export const DEFERRED_INSTALL_MS = 3 * 60 * 1000
export const PLAY_TIMEOUT_MS = 15_000
export const FALLBACK_TIMEOUT_MS = 60_000
const GB = 1024 ** 3

/**
 * @typedef {{ enabled: boolean, maxHeight: number, limitGb: number }} OnlineVideoSettings
 * @param {unknown} record
 * @returns {OnlineVideoSettings}
 */
export function settingsFromRecord(record) {
  const r = record && typeof record === 'object' ? /** @type {Record<string, unknown>} */ (record) : {}
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_SETTINGS.enabled,
    maxHeight: QUALITY_HEIGHTS.includes(/** @type {number} */ (r.maxHeight)) ? /** @type {number} */ (r.maxHeight) : DEFAULT_SETTINGS.maxHeight,
    limitGb: CACHE_LIMIT_GB_OPTIONS.includes(/** @type {number} */ (r.limitGb)) ? /** @type {number} */ (r.limitGb) : DEFAULT_SETTINGS.limitGb,
  }
}

export class OnlineVideoService {
  /**
   * @param {{ userDataDir: string, readRecord: (name: string) => unknown, writeRecord: (name: string, data: unknown) => unknown,
   *   getLocale?: () => string, windowsStore?: boolean, broadcast?: (channel: string, payload: unknown) => void,
   *   tools?: Tools, cache?: CacheStore, manager?: OnlineVideoManager, log?: (message: string) => void,
   *   playTimeoutMs?: number, fallbackTimeoutMs?: number }} opts
   */
  constructor(opts) {
    this.readRecord = opts.readRecord
    this.writeRecord = opts.writeRecord
    this.broadcast = opts.broadcast ?? (() => {})
    this.log = opts.log ?? (() => {})
    this.hidden = Boolean(opts.windowsStore)
    this.settings = settingsFromRecord(safeRead(opts.readRecord))
    this.tools = opts.tools ?? new Tools({
      binDir: path.join(opts.userDataDir, 'bin'),
      onStatus: (status) => this.broadcast('online-video:tools', status),
    })
    this.cache = opts.cache ?? new CacheStore({
      dir: path.join(opts.userDataDir, 'video-cache'),
      limitBytes: this.settings.limitGb * GB,
    })
    const getLocale = opts.getLocale ?? (() => 'pt-BR')
    this.manager = opts.manager ?? new OnlineVideoManager({
      tools: this.tools,
      cache: this.cache,
      ytdlpCacheDir: path.join(opts.userDataDir, 'bin', 'ytdlp-cache'),
      getSettings: () => ({ maxHeight: this.settings.maxHeight, locale: getLocale() }),
      onChange: (id, status) => this.broadcast('online-video:changed', { id, status }),
    })
    this.timers = []
    this.playTimeoutMs = opts.playTimeoutMs ?? PLAY_TIMEOUT_MS
    this.fallbackTimeoutMs = opts.fallbackTimeoutMs ?? FALLBACK_TIMEOUT_MS
  }

  /** O recurso pode tocar vídeos agora: ligado, com binário para a plataforma e fora da Microsoft Store. */
  get active() {
    return !this.hidden && this.settings.enabled && this.tools.available
  }

  /** Boot: arruma as pastas e agenda a instalação adiada e a verificação diária. */
  async init() {
    if (this.hidden) return
    await this.tools.load()
    await this.tools.cleanup()
    await this.cache.load()
    this.#schedule(() => this.#background(), DEFERRED_INSTALL_MS)
  }

  dispose() {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
  }

  status() {
    return {
      hidden: this.hidden,
      available: this.tools.available,
      settings: { ...this.settings },
      tools: this.tools.status(),
      usage: this.cache.usage(),
    }
  }

  /** @param {Partial<OnlineVideoSettings>} partial */
  async setSettings(partial) {
    const wasEnabled = this.settings.enabled
    this.settings = settingsFromRecord({ ...this.settings, ...(partial && typeof partial === 'object' ? partial : {}) })
    this.writeRecord(ONLINE_VIDEO_RECORD, this.settings)
    await this.cache.setLimit(this.settings.limitGb * GB)
    if (wasEnabled && !this.settings.enabled) await this.manager.cancelAll({ keepPlaying: true })
    if (!wasEnabled && this.settings.enabled) this.#background()
    return this.status()
  }

  /**
   * Fonte local para o vídeo projetado, ou `null` para seguir com a página do YouTube.
   * A projeção nunca espera a instalação das ferramentas nem uma descoberta lenta: nesses casos
   * toca pela página e o download continua em segundo plano para a próxima vez.
   */
  async play(id) {
    if (!this.active) return null
    if (!this.tools.ready) {
      this.tools.ensure().catch(() => {})
      return null
    }
    return this.#playWithin(id, this.playTimeoutMs)
  }

  /**
   * A página do YouTube não tocou: baixa a cópia local mesmo com a chave desligada,
   * esperando a instalação das ferramentas se for a primeira vez.
   */
  async fallback(id) {
    if (this.hidden || !this.tools.available) return null
    await this.tools.ensure()
    return this.#playWithin(id, this.fallbackTimeoutMs)
  }

  async #playWithin(id, ms) {
    let timer
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), ms)
    })
    try {
      const source = await Promise.race([this.manager.play(id), timeout])
      if (!source) await this.manager.release(id)
      return source
    } finally {
      clearTimeout(timer)
    }
  }

  release(id) {
    return this.manager.release(id)
  }

  prefetch(ids) {
    if (this.active && Array.isArray(ids)) this.manager.prefetch(ids)
  }

  cancel(id) {
    return this.manager.cancel(id)
  }

  keep(ids) {
    return this.cache.setKeep(Array.isArray(ids) ? ids : [])
  }

  async clear() {
    await this.cache.clear()
    return this.status()
  }

  videoStatus(ids) {
    const out = {}
    for (const id of Array.isArray(ids) ? ids : []) out[id] = this.manager.status(id)
    return out
  }

  /** "Tentar de novo" das ferramentas. */
  async retryTools() {
    if (!this.hidden && this.tools.available) await this.tools.ensure().catch(() => {})
    return this.status()
  }

  serve(id, kind, rangeHeader, signal) {
    return this.manager.serve(id, kind, rangeHeader, signal)
  }

  async #background() {
    this.dispose()
    if (!this.active) return
    try {
      if (this.tools.ready) await this.tools.checkForUpdate()
      else await this.tools.ensure()
    } catch (error) {
      this.log(`ferramentas: ${error?.message || error}`)
    }
    this.#schedule(() => this.#background(), UPDATE_INTERVAL_MS)
  }

  #schedule(task, ms) {
    const timer = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== timer)
      void task()
    }, ms)
    timer.unref?.()
    this.timers.push(timer)
  }
}

function safeRead(readRecord) {
  try {
    return readRecord(ONLINE_VIDEO_RECORD)
  } catch {
    return null
  }
}

/** @param {{ handle: (channel: string, fn: (...args: any[]) => unknown) => void }} ipcMain @param {OnlineVideoService} service */
export function registerOnlineVideoIpc(ipcMain, service) {
  ipcMain.handle('online-video:status', () => service.status())
  ipcMain.handle('online-video:set-settings', (_event, partial) => service.setSettings(partial))
  ipcMain.handle('online-video:prefetch', (_event, ids) => service.prefetch(ids))
  ipcMain.handle('online-video:cancel', (_event, id) => service.cancel(id))
  ipcMain.handle('online-video:keep', (_event, ids) => service.keep(ids))
  ipcMain.handle('online-video:clear', () => service.clear())
  ipcMain.handle('online-video:video-status', (_event, ids) => service.videoStatus(ids))
  ipcMain.handle('online-video:retry-tools', () => service.retryTools())
}
