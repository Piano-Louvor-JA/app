import { readFile, writeFile, mkdir, rm, rename, readdir, open, lstat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { constants } from 'node:fs'
import catalog from './catalog.json' with { type: 'json' }

export const FONT_CATALOG = catalog
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_CSS_BYTES = 512 * 1024
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

function catalogFont(id) {
  const font = FONT_CATALOG.find(item => item.id === id)
  if (!font) throw new Error('invalid-font')
  return font
}

function checkedUrl(value, host) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) throw new Error('invalid-font-url')
  return url.href
}

export function parseFontCss(css) {
  const faces = []
  // Comments identify Google subsets. Other scripts are not installed.
  for (const match of css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]+)\}/g)) {
    const subset = match[1] ?? 'latin'
    if (!['latin', 'latin-ext'].includes(subset)) continue
    const body = match[2]
    const source = body.match(/src:\s*url\(['"]?([^)'"\s]+)['"]?\)\s*format\(['"]woff2['"]\)/i)
    const weight = body.match(/font-weight:\s*(\d+(?:\s+\d+)?)/i)?.[1]
    const unicodeRange = body.match(/unicode-range:\s*([^;]+)/i)?.[1].trim()
    if (!source || !weight || !unicodeRange || !/^U\+[\da-f?]+(?:-[\da-f]+)?(?:\s*,\s*U\+[\da-f?]+(?:-[\da-f]+)?)*$/i.test(unicodeRange)) throw new Error('invalid-font-css')
    faces.push({ source: checkedUrl(source[1], 'fonts.gstatic.com'), weight, unicodeRange, subset })
  }
  if (!faces.length || faces.length > 32) throw new Error('invalid-font-css')
  return faces
}

export function createFontService({ mediaRoot, fetch: fetcher = globalThis.fetch, referencedIds = async () => [] }) {
  const locks = new Map()
  const pins = new Map()
  const root = () => path.join(mediaRoot(), 'fontes')
  // Session cache is intentionally not included in installed-font manifests.
  const previewSession = randomUUID()

  async function exclusive(id, task) {
    const previous = locks.get(id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(task)
    locks.set(id, next)
    try { return await next } finally { if (locks.get(id) === next) locks.delete(id) }
  }

  async function request(url, host, signal, limit) {
    checkedUrl(url, host)
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(30_000)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let current = url
    for (let redirects = 0; redirects < 4; redirects++) {
      const response = await fetcher(current, { signal: combined, redirect: 'manual', credentials: 'omit', headers: { 'User-Agent': USER_AGENT } })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        current = checkedUrl(new URL(response.headers.get('location'), current).href, host)
        await response.body?.cancel()
        continue
      }
      if (!response.ok || !response.body) throw new Error('font-network')
      if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); throw new Error('font-too-large') }
      const chunks = []
      let size = 0
      const reader = response.body.getReader()
      try {
        while (true) {
          combined.throwIfAborted()
          const { done, value } = await reader.read()
          if (done) break
          size += value.length
          if (size > limit) throw new Error('font-too-large')
          chunks.push(Buffer.from(value))
        }
      } finally { await reader.cancel().catch(() => {}) }
      return Buffer.concat(chunks)
    }
    throw new Error('font-redirect')
  }

  function exposed(manifest, relative) {
    return { ...manifest, faces: manifest.faces.map(face => ({ ...face, url: `local://media/fontes/${relative}/${face.file}` })) }
  }

  async function installed(id, directory = path.join(root(), id), relative = id) {
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
      if (manifest.version !== 1 || manifest.id !== id || !manifest.faces?.length || manifest.faces.length > 32) return null
      for (const face of manifest.faces) {
        if (!/^face-\d+\.woff2$/.test(face.file)) return null
        const file = path.join(directory, face.file)
        // Open once without following symlinks; validate and read that same descriptor.
        const before = await lstat(file)
        if (before.isSymbolicLink()) return null
        const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
        let bytes
        try {
          const stat = await handle.stat()
          if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev || stat.size > MAX_FILE_BYTES) return null
          bytes = await handle.readFile()
        } finally { await handle.close() }
        if (bytes.length !== face.bytes || hash(bytes) !== face.sha256 || bytes.toString('ascii', 0, 4) !== 'wOF2') return null
      }
      return exposed(manifest, relative)
    } catch { return null }
  }

  async function install(id, { signal, preview = false } = {}) {
    catalogFont(id)
    const base = root()
    await mkdir(base, { recursive: true })
    signal?.throwIfAborted()
    const relative = preview ? `.preview-${previewSession}/${id}` : id
    const destination = path.join(base, relative)
    const existing = await installed(id, destination, relative)
    if (existing) return existing
    const font = catalogFont(id)
    const temp = path.join(base, `.partial-${id}-${randomUUID()}`)
    await mkdir(temp, { recursive: true })
    try {
      const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@${font.weights.join(';')}&display=swap`
      const css = (await request(url, 'fonts.googleapis.com', signal, MAX_CSS_BYTES)).toString('utf8')
      const faces = parseFontCss(css)
      const downloads = new Map()
      for (let i = 0; i < faces.length; i++) {
        const face = faces[i]
        let bytes = downloads.get(face.source)
        if (!bytes) {
          bytes = await request(face.source, 'fonts.gstatic.com', signal, MAX_FILE_BYTES)
          if (bytes.length < 40 || bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error('invalid-woff2')
          downloads.set(face.source, bytes)
        }
        face.file = `face-${i}.woff2`
        face.bytes = bytes.length
        face.sha256 = hash(bytes)
        await writeFile(path.join(temp, face.file), bytes)
        delete face.source
      }
      signal?.throwIfAborted()
      const manifest = { version: 1, id, family: font.family, installedAt: new Date().toISOString(), faces }
      await writeFile(path.join(temp, 'manifest.json'), JSON.stringify(manifest))
      await mkdir(path.dirname(destination), { recursive: true })
      // A previous invalid installation has no usable manifest; complete ones returned above.
      await rm(destination, { recursive: true, force: true })
      await rename(temp, destination)
      return exposed(manifest, relative)
    } finally { await rm(temp, { recursive: true, force: true }) }
  }

  return {
    pin(id, token) { catalogFont(id); pins.set(token, id) },
    unpin(token) { pins.delete(token) },
    async list() {
      return (await Promise.all(FONT_CATALOG.map(font => installed(font.id)))).filter(Boolean)
    },
    download(id, options) { return exclusive(id, () => install(id, options)) },
    preview(id, options) {
      return exclusive(id, async () => await installed(id) ?? install(id, { ...options, preview: true }))
    },
    remove(id) {
      catalogFont(id)
      if (locks.has(id) || [...pins.values()].includes(id)) return Promise.reject(new Error('font-in-use'))
      return exclusive(id, async () => {
        if ([...pins.values()].includes(id) || (await referencedIds()).includes(id)) throw new Error('font-in-use')
        await rm(path.join(root(), id), { recursive: true, force: true })
      })
    },
    async cleanup() {
      await mkdir(root(), { recursive: true })
      for (const entry of await readdir(root())) {
        if (entry.startsWith('.partial-') || entry.startsWith('.preview-')) await rm(path.join(root(), entry), { recursive: true, force: true })
      }
    },
  }
}
