/**
 * Cache dos vídeos prontos: `<dir>/<id>.mp4`, legenda opcional em `<dir>/<id>.vtt` e metadados em
 * `<dir>/index.json`. Acima do limite sai primeiro o de uso mais antigo, nunca um marcado para
 * manter (liturgia de hoje ou futura) nem o que está tocando.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MUX_TEMP_PREFIX } from './mux.mjs'
import { isVideoId } from './resolver.mjs'

export const DEFAULT_CACHE_LIMIT_BYTES = 6 * 1024 ** 3
export const STREAM_DIR = '.stream'
const STALE_TEMP_MS = 24 * 60 * 60 * 1000

/**
 * @typedef {{ title: string, duration: number, height: number, size: number, lastUsed: number,
 *   keep: boolean, subtitleLang?: string | null }} CacheEntry
 */

export class CacheStore {
  /** @param {{ dir: string, limitBytes?: number, now?: () => number }} opts */
  constructor({ dir, limitBytes = DEFAULT_CACHE_LIMIT_BYTES, now = Date.now }) {
    this.dir = dir
    this.limitBytes = limitBytes
    this.now = now
    /** @type {Record<string, CacheEntry>} */
    this.videos = {}
    this.keepIds = new Set()
    this.protected = new Set()
    this.saving = Promise.resolve()
  }

  get indexFile() {
    return path.join(this.dir, 'index.json')
  }

  videoPath(id) {
    return path.join(this.dir, `${id}.mp4`)
  }

  subtitlePath(id) {
    return path.join(this.dir, `${id}.vtt`)
  }

  streamDir(id) {
    return path.join(this.dir, STREAM_DIR, id)
  }

  /**
   * Lê o índice e arruma a pasta: apaga downloads interrompidos (`.stream/`), montagens velhas
   * e arquivos que o índice não conhece; descarta do índice o que sumiu do disco.
   */
  async load() {
    await mkdir(this.dir, { recursive: true })
    let index = {}
    try {
      index = JSON.parse(await readFile(this.indexFile, 'utf8')) ?? {}
    } catch {
      index = {}
    }
    this.keepIds = new Set(Array.isArray(index.keepIds) ? index.keepIds.filter(isVideoId) : [])
    this.videos = {}
    for (const [id, entry] of Object.entries(index.videos ?? {})) {
      if (isVideoId(id) && entry && existsSync(this.videoPath(id))) this.videos[id] = entry
    }
    await rm(path.join(this.dir, STREAM_DIR), { recursive: true, force: true })
    for (const name of await readdir(this.dir)) {
      if (name === 'index.json') continue
      const file = path.join(this.dir, name)
      if (name.startsWith(MUX_TEMP_PREFIX)) {
        const info = await stat(file).catch(() => null)
        if (info && this.now() - info.mtimeMs > STALE_TEMP_MS) await rm(file, { force: true })
        continue
      }
      const id = name.replace(/\.(mp4|vtt)$/, '')
      if (!this.videos[id]) await rm(file, { recursive: true, force: true })
    }
    await this.save()
    return this.usage()
  }

  has(id) {
    return Boolean(this.videos[id]) && existsSync(this.videoPath(id))
  }

  /** @returns {CacheEntry | null} */
  get(id) {
    return this.videos[id] ?? null
  }

  async touch(id) {
    if (!this.videos[id]) return
    this.videos[id].lastUsed = this.now()
    await this.save()
  }

  /**
   * Registra um vídeo que acabou de ser montado e libera espaço se passou do limite.
   * @param {string} id @param {{ title?: string, duration?: number, height?: number, size: number, subtitleLang?: string | null }} meta
   */
  async add(id, meta) {
    this.videos[id] = {
      title: meta.title ?? '',
      duration: meta.duration ?? 0,
      height: meta.height ?? 0,
      size: meta.size,
      lastUsed: this.now(),
      keep: this.keepIds.has(id),
      subtitleLang: meta.subtitleLang ?? null,
    }
    await this.enforceLimit()
  }

  /** Marca para manter só estes IDs (os vídeos da liturgia de hoje e futura). */
  async setKeep(ids) {
    this.keepIds = new Set(ids.filter(isVideoId))
    for (const [id, entry] of Object.entries(this.videos)) entry.keep = this.keepIds.has(id)
    await this.enforceLimit()
  }

  /** Vídeos em uso agora (tocando ou sendo baixados) nunca são descartados. */
  protect(id) {
    this.protected.add(id)
  }

  unprotect(id) {
    this.protected.delete(id)
  }

  async setLimit(bytes) {
    this.limitBytes = bytes
    await this.enforceLimit()
  }

  usage() {
    let bytes = 0
    for (const entry of Object.values(this.videos)) bytes += entry.size
    return { bytes, count: Object.keys(this.videos).length, limitBytes: this.limitBytes }
  }

  /** @returns {Promise<string[]>} IDs descartados */
  async enforceLimit() {
    const removed = []
    let { bytes } = this.usage()
    const candidates = Object.entries(this.videos)
      .filter(([id, entry]) => !entry.keep && !this.protected.has(id))
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
    for (const [id, entry] of candidates) {
      if (bytes <= this.limitBytes) break
      await this.#deleteFiles(id)
      delete this.videos[id]
      bytes -= entry.size
      removed.push(id)
    }
    await this.save()
    return removed
  }

  async remove(id) {
    if (!this.videos[id]) return
    await this.#deleteFiles(id)
    delete this.videos[id]
    await this.save()
  }

  /** "Apagar vídeos baixados": tudo, menos o que está em uso. */
  async clear() {
    for (const id of Object.keys(this.videos)) {
      if (this.protected.has(id)) continue
      await this.#deleteFiles(id)
      delete this.videos[id]
    }
    await this.save()
    return this.usage()
  }

  /** Gravações em série: a última sempre reflete o estado mais novo. */
  save() {
    this.saving = this.saving.catch(() => {}).then(async () => {
      await mkdir(this.dir, { recursive: true })
      const tmp = `${this.indexFile}.tmp`
      await writeFile(tmp, JSON.stringify({ version: 1, keepIds: [...this.keepIds], videos: this.videos }))
      await rename(tmp, this.indexFile)
    })
    return this.saving
  }

  async #deleteFiles(id) {
    await rm(this.videoPath(id), { force: true })
    await rm(this.subtitlePath(id), { force: true })
  }
}
