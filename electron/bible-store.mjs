import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip as gunzipCallback } from 'node:zlib'
import { app } from 'electron'

import { WORKSPACE_DIRS } from './constants.mjs'

const gunzip = promisify(gunzipCallback)

/** Formato de `GET /v1/bible/bundles/{versionId}` da API. */
const BUNDLE_SCHEMA = 1
const BUNDLE_FILE_RE = /^(\d+)\.json\.gz$/

/**
 * @typedef {'download' | 'bundled'} BibleBundleSource
 * @typedef {{ dir: string, source: BibleBundleSource }} BibleBundleDir
 * @typedef {Record<string, string>} ChapterVerses
 * @typedef {Record<string, Record<string, ChapterVerses>>} BundleChapters
 */

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0
}

/**
 * Bíblia offline (app .planning/bible-offline): lê capítulos dos bundles
 * `<versionId>.json.gz`, na ordem das fontes (bundle baixado na atualização
 * antes do que veio no instalador). Bundle inválido cai na próxima fonte.
 *
 * @param {{ getSources: () => BibleBundleDir[], maxLoaded?: number }} options
 */
export function createBibleStore({ getSources, maxLoaded = 2 }) {
  /** @type {Map<number, Promise<BundleChapters | null>>} ordem = uso recente */
  const loaded = new Map()

  /** @param {string} file @param {number} versionId */
  async function readBundle(file, versionId) {
    try {
      const raw = await gunzip(await readFile(file))
      const data = JSON.parse(raw.toString('utf8'))
      if (
        data?.schema !== BUNDLE_SCHEMA ||
        data.versionId !== versionId ||
        !data.chapters ||
        typeof data.chapters !== 'object'
      ) {
        return null
      }
      return /** @type {BundleChapters} */ (data.chapters)
    } catch {
      return null
    }
  }

  /** @param {number} versionId */
  async function loadVersion(versionId) {
    for (const { dir } of getSources()) {
      const chapters = await readBundle(path.join(dir, `${versionId}.json.gz`), versionId)
      if (chapters) return chapters
    }
    return null
  }

  /** @param {number} versionId */
  function getVersion(versionId) {
    let pending = loaded.get(versionId)
    if (pending) {
      loaded.delete(versionId)
    } else {
      pending = loadVersion(versionId)
      // Falha não fica em memória: um bundle baixado depois passa a valer.
      pending.then((chapters) => {
        if (!chapters && loaded.get(versionId) === pending) loaded.delete(versionId)
      })
    }
    loaded.set(versionId, pending)
    while (loaded.size > maxLoaded) {
      loaded.delete(loaded.keys().next().value)
    }
    return pending
  }

  return {
    /**
     * @param {number} versionId
     * @param {number} bookId
     * @param {number} chapter
     * @returns {Promise<ChapterVerses | null>}
     */
    async getChapter(versionId, bookId, chapter) {
      if (![versionId, bookId, chapter].every(isPositiveInt)) return null
      const chapters = await getVersion(versionId)
      const verses = chapters?.[String(bookId)]?.[String(chapter)]
      if (!verses || typeof verses !== 'object' || Object.keys(verses).length === 0) {
        return null
      }
      return verses
    },

    /** @returns {Promise<Array<{ versionId: number, source: BibleBundleSource }>>} */
    async listVersions() {
      /** @type {Map<number, BibleBundleSource>} */
      const found = new Map()
      for (const { dir, source } of getSources()) {
        let names = []
        try {
          names = await readdir(dir)
        } catch {
          continue
        }
        for (const name of names) {
          const match = BUNDLE_FILE_RE.exec(name)
          if (!match) continue
          const versionId = Number(match[1])
          if (!found.has(versionId)) found.set(versionId, source)
        }
      }
      return [...found.entries()]
        .sort(([a], [b]) => a - b)
        .map(([versionId, source]) => ({ versionId, source }))
    },

    /** @param {number} [versionId] sem argumento esquece todas */
    invalidate(versionId) {
      if (versionId == null) loaded.clear()
      else loaded.delete(versionId)
    },
  }
}

/** Pasta dos bundles baixados pela atualização (fora do `.sysdata`). */
export function getDownloadedBibleDir() {
  return path.join(app.getPath('userData'), WORKSPACE_DIRS.bible)
}

/** Pasta dos bundles que vieram no instalador (`extraResources`). */
export function getBundledBibleDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'bible')
  return path.join(app.getAppPath(), 'resources', 'bible')
}

/** @type {ReturnType<typeof createBibleStore> | null} */
let defaultStore = null

export function getBibleStore() {
  defaultStore ??= createBibleStore({
    getSources: () => [
      { dir: getDownloadedBibleDir(), source: 'download' },
      { dir: getBundledBibleDir(), source: 'bundled' },
    ],
  })
  return defaultStore
}
