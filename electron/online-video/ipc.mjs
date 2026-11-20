/**
 * Liga a cópia local dos vídeos do YouTube ao resto do app: configurações persistidas no workspace,
 * instalação adiada das ferramentas, verificação diária do yt-dlp e canais IPC do renderer.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { CacheStore } from './cache-store.mjs'
import { MultiCache, customVideosDir } from './multi-cache.mjs'
import { OnlineVideoManager } from './manager.mjs'
import { DEFAULT_HEIGHT, QUALITY_HEIGHTS } from './resolver.mjs'
import { Tools, UPDATE_INTERVAL_MS } from './tools.mjs'

export const ONLINE_VIDEO_RECORD = 'online-video'
export const CACHE_LIMIT_GB_OPTIONS = [2, 4, 6, 10, 20, 40, 80]
/** Desligado: toca pela página do YouTube e só baixa a cópia quando a página não toca. */
export const DEFAULT_SETTINGS = Object.freeze({ enabled: false, maxHeight: DEFAULT_HEIGHT, limitGb: 6, folder: 'system', customDir: null })
export const DEFERRED_INSTALL_MS = 3 * 60 * 1000
export const PLAY_TIMEOUT_MS = 15_000
export const FALLBACK_TIMEOUT_MS = 60_000
/**
 * Sem limite automático: o operador escolhe a pasta e apaga os vídeos quando quiser.
 * (`limitGb` continua no registro só por compatibilidade com versões antigas.)
 */
export const NO_LIMIT_BYTES = Number.POSITIVE_INFINITY

/**
 * `folder`: pasta que recebe os downloads novos; `customDir`: pasta escolhida pelo operador (os vídeos
 * ficam na subpasta `LouvorJA-PIANO-videos` dela).
 * @typedef {{ enabled: boolean, maxHeight: number, limitGb: number, folder: 'system' | 'custom', customDir: string | null }} OnlineVideoSettings
 * @param {unknown} record
 * @returns {OnlineVideoSettings}
 */
export function settingsFromRecord(record) {
  const r = record && typeof record === 'object' ? /** @type {Record<string, unknown>} */ (record) : {}
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_SETTINGS.enabled,
    maxHeight: QUALITY_HEIGHTS.includes(/** @type {number} */ (r.maxHeight)) ? /** @type {number} */ (r.maxHeight) : DEFAULT_SETTINGS.maxHeight,
    limitGb: CACHE_LIMIT_GB_OPTIONS.includes(/** @type {number} */ (r.limitGb)) ? /** @type {number} */ (r.limitGb) : DEFAULT_SETTINGS.limitGb,
    ...folderFromRecord(r),
  }
}

/** @param {Record<string, unknown>} r */
function folderFromRecord(r) {
  const customDir = typeof r.customDir === 'string' && r.customDir.trim() && path.isAbsolute(r.customDir.trim()) ? r.customDir.trim() : null
  /** @type {'system' | 'custom'} */
  const folder = r.folder === 'custom' && customDir ? 'custom' : 'system'
  return { folder, customDir }
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
    /** Abre a pasta no gerenciador de arquivos (shell.openPath): '' = ok, texto = erro. */
    this.openPath = opts.openPath ?? null
    this.settings = settingsFromRecord(safeRead(opts.readRecord))
    this.tools = opts.tools ?? new Tools({
      binDir: path.join(opts.userDataDir, 'bin'),
      onStatus: (status) => this.broadcast('online-video:tools', status),
    })
    /** Abre o seletor de pasta do sistema; `null` = cancelado. */
    this.chooseDirectory = opts.chooseDirectory ?? null
    this.cache = opts.cache ?? new MultiCache({
      system: new CacheStore({ dir: path.join(opts.userDataDir, 'video-cache'), limitBytes: NO_LIMIT_BYTES }),
      custom: this.settings.customDir ? this.#customStore(this.settings.customDir) : null,
      active: this.settings.folder,
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
    /** Trocas de pasta em fila: várias janelas pedindo ao mesmo tempo não criam dois leitores da mesma pasta. */
    this.folderQueue = Promise.resolve()
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
      cacheDir: this.cache.dir,
      folders: typeof this.cache.folders === 'function' ? this.cache.folders() : null,
    }
  }

  #customStore(chosen) {
    return new CacheStore({ dir: customVideosDir(chosen), limitBytes: NO_LIMIT_BYTES })
  }

  /** Arquivo pedido como `<id>.mp4|vtt` pelo protocolo; no disco ele tem o título no nome. */
  cacheFile(name) {
    return typeof this.cache.fileFor === 'function' ? this.cache.fileFor(name) : path.join(this.cache.dir, name)
  }

  /** "Escolher pasta": abre o seletor e passa a baixar nela. */
  async chooseCustomFolder() {
    if (!this.chooseDirectory) return this.status()
    const chosen = await this.chooseDirectory()
    if (typeof chosen !== 'string' || !chosen) return this.status()
    return this.setSettings({ customDir: chosen, folder: 'custom' })
  }

  /** Abre a pasta dos vídeos baixados (cria se ainda não existe). */
  /** @param {'system' | 'custom'} [which] sem argumento: a pasta ativa */
  async openCacheFolder(which) {
    const folders = typeof this.cache.folders === 'function' ? this.cache.folders() : null
    const dir = which && folders ? folders[which]?.dir : this.cache.dir
    if (!this.openPath || !dir) return false
    try {
      await mkdir(dir, { recursive: true })
      return !(await this.openPath(dir))
    } catch {
      return false
    }
  }

  /** @param {Partial<OnlineVideoSettings>} partial */
  async setSettings(partial) {
    const wasEnabled = this.settings.enabled
    this.settings = settingsFromRecord({ ...this.settings, ...(partial && typeof partial === 'object' ? partial : {}) })
    this.writeRecord(ONLINE_VIDEO_RECORD, this.settings)
    if (this.cache instanceof MultiCache) {
      this.folderQueue = this.folderQueue.catch(() => {}).then(() => this.#applyFolders())
      await this.folderQueue
    }
    await this.cache.setLimit(NO_LIMIT_BYTES)
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

  /**
   * "Baixar" pedido pelo operador (módulo YouTube): vale mesmo com a chave desligada, instalando
   * as ferramentas na primeira vez. Vai para a pasta ativa (escolhida no popup / Configurações).
   * @returns {Promise<boolean>} false quando este sistema não baixa vídeos
   */
  async download(ids) {
    if (this.hidden || !this.tools.available) return false
    const list = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string')
    if (list.length === 0) return false
    try {
      await this.tools.ensure()
    } catch {
      return false
    }
    this.manager.prefetch(list)
    return true
  }

  keep(ids) {
    return this.cache.setKeep(Array.isArray(ids) ? ids : [])
  }

  /**
   * Apaga a cópia baixada de um vídeo (botão lixeira do módulo YouTube), em qualquer pasta.
   * O vídeo que está tocando agora não é apagado.
   * @returns {Promise<boolean>}
   */
  async removeVideo(id) {
    if (typeof id !== 'string' || !this.cache.has?.(id)) return false
    if (typeof this.cache.isProtected === 'function' && this.cache.isProtected(id)) return false
    await this.cache.remove(id)
    return true
  }

  /** Aba "Baixados" do módulo YouTube. */
  listDownloads() {
    return typeof this.cache.list === 'function' ? this.cache.list() : []
  }

  /**
   * "Renomear": muda o nome do arquivo baixado na pasta. Recusa o vídeo que está tocando (no
   * Windows o arquivo aberto não pode ser renomeado).
   * @returns {Promise<string | null>} nome novo do arquivo
   */
  async renameVideo(id, name) {
    if (typeof id !== 'string' || typeof name !== 'string' || !this.cache.has?.(id)) return null
    if (typeof this.cache.rename !== 'function') return null
    if (typeof this.cache.isProtected === 'function' && this.cache.isProtected(id)) return null
    try {
      return await this.cache.rename(id, name)
    } catch (error) {
      this.log(`não foi possível renomear ${id}: ${error?.message ?? error}`)
      return null
    }
  }

  /** @param {'system' | 'custom'} [which] sem argumento: as duas pastas */
  async clear(which) {
    await this.cache.clear(which === 'system' || which === 'custom' ? which : undefined)
    return this.status()
  }

  /** Pasta personalizada nova (ou trocada): carrega o índice dela; a ativa segue a escolha. */
  async #applyFolders() {
    const cache = /** @type {MultiCache} */ (this.cache)
    const wanted = this.settings.customDir ? customVideosDir(this.settings.customDir) : null
    if ((cache.custom?.dir ?? null) !== wanted) {
      const store = this.settings.customDir ? this.#customStore(this.settings.customDir) : null
      if (store) {
        try {
          await store.load()
        } catch (error) {
          this.log(`pasta personalizada inacessível: ${error?.message ?? error}`)
          this.settings = { ...this.settings, folder: 'system', customDir: null }
          this.writeRecord(ONLINE_VIDEO_RECORD, this.settings)
          cache.setCustom(null)
          cache.setActive('system')
          return
        }
      }
      cache.setCustom(store)
    }
    cache.setActive(this.settings.folder)
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
  ipcMain.handle('online-video:download', (_event, ids) => service.download(ids))
  ipcMain.handle('online-video:remove', (_event, id) => service.removeVideo(id))
  ipcMain.handle('online-video:rename', (_event, id, name) => service.renameVideo(id, name))
  ipcMain.handle('online-video:list', () => service.listDownloads())
  ipcMain.handle('online-video:keep', (_event, ids) => service.keep(ids))
  ipcMain.handle('online-video:clear', (_event, which) => service.clear(which))
  ipcMain.handle('online-video:video-status', (_event, ids) => service.videoStatus(ids))
  ipcMain.handle('online-video:retry-tools', () => service.retryTools())
  ipcMain.handle('online-video:open-folder', (_event, which) => service.openCacheFolder(which))
  ipcMain.handle('online-video:choose-folder', () => service.chooseCustomFolder())
}
