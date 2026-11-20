/**
 * Cache dos vídeos prontos: `<dir>/<título>_<id>.mp4`, legenda opcional em `<dir>/<título>_<id>.vtt`
 * e metadados em `<dir>/index.json` (nome do arquivo em `file`; ver file-name.mjs). Vídeos baixados
 * antes, só com o ID no nome, são renomeados ao carregar. Acima do limite sai primeiro o de uso mais antigo, nunca um marcado para
 * manter (liturgia de hoje ou futura) nem o que está tocando.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isSafeFileBase, videoFileBase } from './file-name.mjs'
import { MUX_TEMP_PREFIX } from './mux.mjs'
import { isVideoId } from './resolver.mjs'

export const DEFAULT_CACHE_LIMIT_BYTES = 6 * 1024 ** 3
export const STREAM_DIR = '.stream'
const STALE_TEMP_MS = 24 * 60 * 60 * 1000

/**
 * Cargas em andamento por pasta. Duas instâncias lendo a mesma pasta ao mesmo tempo (várias
 * janelas pedindo a pasta personalizada na abertura) não podem se cruzar: uma renomearia os
 * vídeos antigos e a outra, com o índice velho, apagaria os nomes novos como desconhecidos.
 * @type {Map<string, Promise<unknown>>}
 */
const loadingDirs = new Map()

/**
 * @typedef {{ title: string, duration: number, height: number, size: number, lastUsed: number,
 *   keep: boolean, subtitleLang?: string | null, file?: string }} CacheEntry
 */

/**
 * Arquivo do vídeo com outro nome que o índice (renomeado fora do app ou índice antigo):
 * `<id>.mp4` ou `<qualquer título>_<id>.mp4`. Melhor reconhecer que apagar.
 * @param {string[]} names @param {string} id
 */
function findVideoFile(names, id) {
  for (const name of names) {
    if (!name.endsWith('.mp4')) continue
    const base = name.slice(0, -4)
    if ((base === id || base.endsWith(`_${id}`)) && isSafeFileBase(base)) return base
  }
  return null
}

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

  /**
   * Caminho do vídeo. Já baixado: o nome guardado no índice. Ainda não: `<título>_<id>` quando o
   * título vem junto (o mesmo que `add` vai registrar), senão só o ID.
   * @param {string} id @param {string} [title]
   */
  videoPath(id, title) {
    return path.join(this.dir, `${this.#fileBase(id, title)}.mp4`)
  }

  /** @param {string} id @param {string} [title] */
  subtitlePath(id, title) {
    return path.join(this.dir, `${this.#fileBase(id, title)}.vtt`)
  }

  #fileBase(id, title) {
    const entry = this.videos[id]
    if (entry) return entry.file ?? id
    return title === undefined ? id : videoFileBase(title, id)
  }

  streamDir(id) {
    return path.join(this.dir, STREAM_DIR, id)
  }

  /**
   * Lê o índice e arruma a pasta: apaga downloads interrompidos (`.stream/`), montagens velhas
   * e arquivos que o índice não conhece; descarta do índice o que sumiu do disco.
   */
  async load() {
    const key = path.resolve(this.dir)
    const run = (loadingDirs.get(key) ?? Promise.resolve()).catch(() => {}).then(() => this.#load())
    loadingDirs.set(key, run)
    try {
      return await run
    } finally {
      if (loadingDirs.get(key) === run) loadingDirs.delete(key)
    }
  }

  async #load() {
    await mkdir(this.dir, { recursive: true })
    let index = {}
    try {
      index = JSON.parse(await readFile(this.indexFile, 'utf8')) ?? {}
    } catch {
      index = {}
    }
    this.keepIds = new Set(Array.isArray(index.keepIds) ? index.keepIds.filter(isVideoId) : [])
    this.videos = {}
    const names = await readdir(this.dir)
    for (const [id, entry] of Object.entries(index.videos ?? {})) {
      if (!isVideoId(id) || !entry || typeof entry !== 'object') continue
      const clean = { ...entry }
      if (!isSafeFileBase(clean.file)) delete clean.file
      this.videos[id] = clean
      if (existsSync(this.videoPath(id))) continue
      const found = findVideoFile(names, id)
      if (found) clean.file = found
      else delete this.videos[id]
    }
    await this.#renameLegacy()
    await rm(path.join(this.dir, STREAM_DIR), { recursive: true, force: true })
    const known = new Set()
    for (const id of Object.keys(this.videos)) {
      known.add(path.basename(this.videoPath(id)))
      known.add(path.basename(this.subtitlePath(id)))
    }
    for (const name of await readdir(this.dir)) {
      if (name === 'index.json') continue
      const file = path.join(this.dir, name)
      if (name.startsWith(MUX_TEMP_PREFIX)) {
        const info = await stat(file).catch(() => null)
        if (info && this.now() - info.mtimeMs > STALE_TEMP_MS) await rm(file, { force: true })
        continue
      }
      if (!known.has(name)) await rm(file, { recursive: true, force: true })
    }
    await this.save()
    return this.usage()
  }

  /**
   * Vídeos baixados antes do nome com título (`<id>.mp4`) passam a `<título>_<id>.mp4`. Se o
   * arquivo estiver preso (aberto em outro programa), fica com o nome antigo e tenta de novo
   * na próxima vez.
   */
  async #renameLegacy() {
    for (const [id, entry] of Object.entries(this.videos)) {
      if (entry.file) continue
      const base = videoFileBase(entry.title, id)
      if (base === id) continue
      try {
        await rename(path.join(this.dir, `${id}.mp4`), path.join(this.dir, `${base}.mp4`))
      } catch {
        continue
      }
      entry.file = base
      if (!entry.subtitleLang) continue
      try {
        await rename(path.join(this.dir, `${id}.vtt`), path.join(this.dir, `${base}.vtt`))
      } catch {
        entry.subtitleLang = null
      }
    }
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
    const file = this.#fileBase(id, meta.title)
    this.videos[id] = {
      title: meta.title ?? '',
      duration: meta.duration ?? 0,
      height: meta.height ?? 0,
      size: meta.size,
      lastUsed: this.now(),
      keep: this.keepIds.has(id),
      subtitleLang: meta.subtitleLang ?? null,
      file,
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

  /**
   * Vídeos baixados nesta pasta, do uso mais recente ao mais antigo. `renamed`: o operador deu
   * outro nome ao arquivo (diferente do automático `<título>_<id>`).
   */
  list() {
    return Object.entries(this.videos)
      .map(([id, entry]) => {
        const base = entry.file ?? id
        return {
          id,
          title: entry.title,
          duration: entry.duration,
          size: entry.size,
          lastUsed: entry.lastUsed,
          fileName: `${base}.mp4`,
          renamed: Boolean(entry.file) && base !== videoFileBase(entry.title, id),
        }
      })
      .sort((a, b) => b.lastUsed - a.lastUsed)
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

  /**
   * Renomeia o arquivo baixado (e a legenda) para `<nome limpo>_<id>`. O ID fica no fim para o
   * vídeo continuar reconhecível; o título do YouTube no índice não muda.
   * @param {string} id @param {string} name
   * @returns {Promise<string | null>} nome novo do arquivo, ou null se o vídeo não está aqui
   */
  async rename(id, name) {
    const entry = this.videos[id]
    if (!entry) return null
    const base = videoFileBase(name, id)
    if (base !== (entry.file ?? id)) {
      const from = { video: this.videoPath(id), subtitle: this.subtitlePath(id) }
      await rename(from.video, path.join(this.dir, `${base}.mp4`))
      entry.file = base
      if (entry.subtitleLang) {
        try {
          await rename(from.subtitle, this.subtitlePath(id))
        } catch {
          entry.subtitleLang = null
        }
      }
      await this.save()
    }
    return `${base}.mp4`
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
