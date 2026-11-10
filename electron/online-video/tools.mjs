/**
 * yt-dlp e ffmpeg baixados do GitHub no primeiro uso, conferidos por SHA-256 antes de executar.
 * Cada versão fica numa pasta própria e a ativa só muda depois de a nova estar completa,
 * então um processo em execução nunca perde os arquivos; as antigas saem no `cleanup()` do boot.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { chmod, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { OnlineVideoError } from './resolver.mjs'

const require = createRequire(import.meta.url)
const yauzl = require('yauzl')

export const YTDLP_BASE_URL = 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download'
export const FFMPEG_BASE_URL = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0'
export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000
export const RENEW_INTERVAL_MS = 60 * 60 * 1000
const PROBE_TIMEOUT_MS = 60_000

const YTDLP_ASSETS = {
  'linux-x64': 'yt-dlp_linux.zip',
  'linux-arm64': 'yt-dlp_linux_aarch64.zip',
  'darwin-x64': 'yt-dlp_macos.zip',
  'darwin-arm64': 'yt-dlp_macos.zip',
  'win32-x64': 'yt-dlp_win.zip',
  'win32-arm64': 'yt-dlp_win_arm64.zip',
}

/** Windows em ARM executa o build x64 emulado; não há ffmpeg estático arm64 para ele. */
const FFMPEG_TARGETS = {
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
  'win32-x64': 'win32-x64',
  'win32-arm64': 'win32-x64',
}

const FFMPEG_SHA256 = {
  'linux-x64': '17c1ae10b52ac499180679fe6ba77e17642390c4eedb0f1e3b0ac045da55128f',
  'linux-arm64': '2b708b2d15041d2a192c1db24c7a8a1d24f645a8242dce1c744ff2392b86ada1',
  'darwin-x64': 'a12354fce7eb62361473bbe10d53a1893695babd35869ec8e92e5dfea8d0440b',
  'darwin-arm64': '6be74d6f449889c2e87a75873894f8520cad56c08ac76f2a628d85b0519daaca',
  'win32-x64': '450d66226c79405c724e821f291cab0911e934bfa9fa2231adcab587f3e07b50',
}

/**
 * @typedef {{ ytdlp: string, ffmpeg: { asset: string, sha256: string }, exeSuffix: string }} ToolAssets
 * @param {string} platform @param {string} arch
 * @returns {ToolAssets | null} `null` quando não há binário publicado para a plataforma.
 */
export function platformAssets(platform, arch) {
  const key = `${platform}-${arch}`
  const ytdlp = YTDLP_ASSETS[key]
  const target = FFMPEG_TARGETS[key]
  if (!ytdlp || !target) return null
  return {
    ytdlp,
    ffmpeg: { asset: `ffmpeg-${target}.gz`, sha256: FFMPEG_SHA256[target] },
    exeSuffix: platform === 'win32' ? '.exe' : '',
  }
}

/** @param {string} text conteúdo do `SHA2-256SUMS` da release */
export function parseSha256Sums(text) {
  const sums = new Map()
  for (const line of String(text ?? '').split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim())
    if (match) sums.set(match[2], match[1].toLowerCase())
  }
  return sums
}

/** Ambiente dos processos filhos: sem herdar variáveis do app nem cookies, com `PATH` mínimo. */
export function minimalEnv(extra = {}, env = process.env, platform = process.platform) {
  const keep = ['SystemRoot', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL']
  const out = {}
  for (const key of keep) if (env[key]) out[key] = env[key]
  out.PATH = platform === 'win32'
    ? [env.SystemRoot && `${env.SystemRoot}\\System32`, env.SystemRoot].filter(Boolean).join(';')
    : '/usr/bin:/bin'
  return { ...out, ...extra }
}

/**
 * Executa sem shell e com argumentos em lista. Nunca rejeita: falhas viram `code` diferente de 0.
 * @param {string} file @param {string[]} args
 * @param {{ timeoutMs?: number, env?: Record<string, string>, cwd?: string, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function execTool(file, args, { timeoutMs = 0, env, cwd, signal } = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, env: env ?? minimalEnv(), cwd, signal, windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const code = !error ? 0 : typeof error.code === 'number' ? error.code : 1
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') || (error ? error.message : '') })
      },
    )
  })
}

function toolsError(error, signal) {
  if (signal?.aborted) return new OnlineVideoError('cancelled', 'Instalação cancelada')
  if (error instanceof OnlineVideoError) return error
  return new OnlineVideoError('tools', error?.message || String(error))
}

/**
 * Baixa para `<file>.part` calculando o SHA-256 e só renomeia para `file` se o hash confere.
 * @param {{ url: string, file: string, sha256: string, fetchImpl?: typeof fetch, signal?: AbortSignal,
 *   onProgress?: (received: number, total: number) => void }} opts
 */
export async function downloadVerified({ url, file, sha256, fetchImpl = fetch, signal, onProgress }) {
  const part = `${file}.part`
  try {
    const res = await fetchImpl(url, { signal, redirect: 'follow' })
    if (!res.ok || !res.body) {
      await res.body?.cancel()
      throw new OnlineVideoError('tools', `Download de ${path.basename(file)} falhou (HTTP ${res.status})`)
    }
    const total = Number(res.headers.get('content-length')) || 0
    const hash = createHash('sha256')
    let received = 0
    await pipeline(
      Readable.fromWeb(res.body),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk)
          received += chunk.length
          onProgress?.(received, total)
          yield chunk
        }
      },
      createWriteStream(part),
      { signal },
    )
    if (hash.digest('hex') !== sha256.toLowerCase()) {
      throw new OnlineVideoError('tools', `SHA-256 de ${path.basename(file)} não confere`)
    }
    await rename(part, file)
  } catch (error) {
    await rm(part, { force: true })
    throw toolsError(error, signal)
  }
}

function insideDir(root, target) {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function writeZipEntry(zip, entry, root) {
  const target = path.resolve(root, entry.fileName)
  if (!insideDir(root, target)) throw new OnlineVideoError('tools', `Caminho inválido no zip: ${entry.fileName}`)
  if (entry.fileName.endsWith('/')) {
    await mkdir(target, { recursive: true })
    return
  }
  await mkdir(path.dirname(target), { recursive: true })
  const attrs = (entry.externalFileAttributes >>> 16) & 0xffff
  const stream = await new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, readStream) => (error ? reject(error) : resolve(readStream)))
  })
  if ((attrs & 0o170000) === 0o120000) {
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const linkTarget = Buffer.concat(chunks).toString('utf8')
    if (!insideDir(root, path.resolve(path.dirname(target), linkTarget))) {
      throw new OnlineVideoError('tools', `Link inválido no zip: ${entry.fileName}`)
    }
    await symlink(linkTarget, target)
    return
  }
  const mode = attrs & 0o777 || 0o644
  await pipeline(stream, createWriteStream(target, { mode }))
  await chmod(target, mode)
}

/** Extrai preservando permissões e links internos; recusa caminhos que saem de `destDir`. */
export function extractZip(zipFile, destDir) {
  const root = path.resolve(destDir)
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true, autoClose: true }, (openError, zip) => {
      if (openError) return reject(toolsError(openError))
      let failed = false
      const fail = (error) => {
        if (failed) return
        failed = true
        zip.close()
        reject(toolsError(error))
      }
      zip.on('error', fail)
      zip.on('end', () => { if (!failed) resolve() })
      zip.on('entry', (entry) => { writeZipEntry(zip, entry, root).then(() => zip.readEntry(), fail) })
      zip.readEntry()
    })
  })
}

/**
 * @typedef {{ dir: string, exe: string, sha256: string, version: string }} ToolRecord
 * @typedef {{ ytdlp?: ToolRecord & { checkedAt: number, renewedAt: number }, ffmpeg?: ToolRecord }} ToolsRecord
 * @typedef {{ state: 'unavailable'|'missing'|'installing'|'ready'|'error', tool?: 'ytdlp'|'ffmpeg',
 *   progress?: number, version?: string, error?: string }} ToolsStatus
 */

export class Tools {
  /**
   * @param {{ binDir: string, platform?: string, arch?: string, assets?: ToolAssets | null,
   *   fetchImpl?: typeof fetch, exec?: typeof execTool, now?: () => number,
   *   ytdlpBaseUrl?: string, ffmpegBaseUrl?: string, onStatus?: (status: ToolsStatus) => void }} opts
   */
  constructor(opts) {
    const { binDir, platform = process.platform, arch = process.arch } = opts
    this.binDir = binDir
    this.assets = 'assets' in opts ? opts.assets : platformAssets(platform, arch)
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.exec = opts.exec ?? execTool
    this.now = opts.now ?? Date.now
    this.ytdlpBaseUrl = opts.ytdlpBaseUrl ?? YTDLP_BASE_URL
    this.ffmpegBaseUrl = opts.ffmpegBaseUrl ?? FFMPEG_BASE_URL
    this.onStatus = opts.onStatus
    /** @type {ToolsRecord} */
    this.record = {}
    this.installing = null
    this.progress = null
    this.lastError = null
  }

  get available() {
    return this.assets !== null
  }

  get recordFile() {
    return path.join(this.binDir, 'tools.json')
  }

  /** Lê `tools.json`, descartando ferramentas cujo executável sumiu do disco. */
  async load() {
    let record = {}
    try {
      record = JSON.parse(await readFile(this.recordFile, 'utf8')) ?? {}
    } catch {
      record = {}
    }
    for (const tool of ['ytdlp', 'ffmpeg']) {
      const entry = record[tool]
      if (entry && !existsSync(this.#exePath(tool, entry))) delete record[tool]
    }
    this.record = record
    return this.status()
  }

  /** @returns {{ ytdlp: string | null, ffmpeg: string | null }} */
  paths() {
    return {
      ytdlp: this.record.ytdlp ? this.#exePath('ytdlp', this.record.ytdlp) : null,
      ffmpeg: this.record.ffmpeg ? this.#exePath('ffmpeg', this.record.ffmpeg) : null,
    }
  }

  get ready() {
    return Boolean(this.record.ytdlp && this.record.ffmpeg)
  }

  /** @returns {ToolsStatus} */
  status() {
    if (!this.available) return { state: 'unavailable' }
    if (this.installing) return { state: 'installing', ...this.progress }
    if (this.ready) return { state: 'ready', version: this.record.ytdlp.version }
    if (this.lastError) return { state: 'error', error: this.lastError }
    return { state: 'missing' }
  }

  /** Instala o que falta; chamadas simultâneas aguardam a mesma instalação. */
  ensure({ signal } = {}) {
    if (!this.available) return Promise.reject(new OnlineVideoError('tools', 'Sem yt-dlp e ffmpeg para esta plataforma'))
    if (this.ready) return Promise.resolve(this.paths())
    if (this.installing) return this.installing.then(() => this.ensure({ signal }))
    return this.#exclusive(async () => {
      if (!this.record.ffmpeg) await this.#installFfmpeg(signal)
      if (!this.record.ytdlp) await this.#installYtdlp(await this.#latestYtdlpSha(signal), signal)
      return this.paths()
    })
  }

  /**
   * Troca o yt-dlp quando a release nightly publicou outro build. Sem `force`, no máximo uma vez por dia.
   * @returns {Promise<boolean>} `true` quando instalou uma versão nova.
   */
  async checkForUpdate({ force = false, signal } = {}) {
    if (!this.available) return false
    const current = this.record.ytdlp
    if (!current) {
      await this.ensure({ signal })
      return true
    }
    if (!force && this.now() - (current.checkedAt ?? 0) < UPDATE_INTERVAL_MS) return false
    if (this.installing) return this.installing.then(() => false, () => false)
    return this.#exclusive(async () => {
      const sha256 = await this.#latestYtdlpSha(signal)
      if (sha256 === this.record.ytdlp?.sha256) {
        this.record.ytdlp.checkedAt = this.now()
        await this.#save()
        return false
      }
      await this.#installYtdlp(sha256, signal)
      return true
    })
  }

  /** Depois de um erro de extração: renova o yt-dlp na hora, no máximo uma vez por hora. */
  async renewAfterExtractorError({ signal } = {}) {
    const current = this.record.ytdlp
    if (!current || this.now() - (current.renewedAt ?? 0) < RENEW_INTERVAL_MS) return false
    current.renewedAt = this.now()
    await this.#save()
    return this.checkForUpdate({ force: true, signal })
  }

  /** Apaga versões inativas e restos de instalação. Rodar no boot, antes de qualquer processo. */
  async cleanup() {
    for (const tool of ['ytdlp', 'ffmpeg']) {
      const root = path.join(this.binDir, tool)
      let names = []
      try {
        names = await readdir(root)
      } catch {
        continue
      }
      for (const name of names) {
        if (name !== this.record[tool]?.dir) await rm(path.join(root, name), { recursive: true, force: true })
      }
    }
  }

  #exePath(tool, entry) {
    return path.join(this.binDir, tool, entry.dir, entry.exe)
  }

  #exclusive(task) {
    this.lastError = null
    this.progress = null
    this.installing = (async () => {
      try {
        return await task()
      } catch (error) {
        this.lastError = error?.message || String(error)
        throw error
      } finally {
        this.installing = null
        this.progress = null
        this.#emit()
      }
    })()
    this.#emit()
    return this.installing
  }

  #emit() {
    this.onStatus?.(this.status())
  }

  #reportProgress(tool) {
    return (received, total) => {
      this.progress = { tool, progress: total > 0 ? Math.min(1, received / total) : 0 }
      this.#emit()
    }
  }

  async #save() {
    await mkdir(this.binDir, { recursive: true })
    const tmp = `${this.recordFile}.tmp`
    await writeFile(tmp, JSON.stringify(this.record, null, 2))
    await rename(tmp, this.recordFile)
  }

  async #latestYtdlpSha(signal) {
    let text
    try {
      const res = await this.fetchImpl(`${this.ytdlpBaseUrl}/SHA2-256SUMS`, { signal, redirect: 'follow' })
      if (!res.ok) throw new OnlineVideoError('tools', `Lista de hashes do yt-dlp indisponível (HTTP ${res.status})`)
      text = await res.text()
    } catch (error) {
      throw toolsError(error, signal)
    }
    const sha256 = parseSha256Sums(text).get(this.assets.ytdlp)
    if (!sha256) throw new OnlineVideoError('tools', `A release do yt-dlp não publica ${this.assets.ytdlp}`)
    return sha256
  }

  async #probe(file, args, label, signal) {
    const result = await this.exec(file, args, { timeoutMs: PROBE_TIMEOUT_MS, env: minimalEnv(), signal })
    if (signal?.aborted) throw new OnlineVideoError('cancelled', 'Instalação cancelada')
    if (result.code !== 0) {
      const detail = result.stderr.trim().split('\n').at(-1) || `código ${result.code}`
      throw new OnlineVideoError('tools', `O ${label} baixado não executa: ${detail}`)
    }
    return result.stdout.trim().split('\n')[0].trim()
  }

  async #installYtdlp(sha256, signal) {
    const root = path.join(this.binDir, 'ytdlp')
    const dir = sha256.slice(0, 16)
    const finalDir = path.join(root, dir)
    const tmpDir = `${finalDir}.tmp`
    const zipFile = `${finalDir}.zip`
    await mkdir(root, { recursive: true })
    await downloadVerified({
      url: `${this.ytdlpBaseUrl}/${this.assets.ytdlp}`,
      file: zipFile,
      sha256,
      fetchImpl: this.fetchImpl,
      signal,
      onProgress: this.#reportProgress('ytdlp'),
    })
    try {
      await rm(tmpDir, { recursive: true, force: true })
      await extractZip(zipFile, tmpDir)
      const exe = (await readdir(tmpDir)).find((name) => name.startsWith('yt-dlp')
        && (this.assets.exeSuffix ? name.endsWith(this.assets.exeSuffix) : !path.extname(name)))
      if (!exe) throw new OnlineVideoError('tools', 'Executável do yt-dlp não encontrado no zip')
      await rm(finalDir, { recursive: true, force: true })
      await rename(tmpDir, finalDir)
      const version = await this.#probe(path.join(finalDir, exe), ['--version'], 'yt-dlp', signal)
        .catch(async (error) => {
          await rm(finalDir, { recursive: true, force: true })
          throw error
        })
      const previous = this.record.ytdlp
      this.record.ytdlp = { dir, exe, sha256, version, checkedAt: this.now(), renewedAt: previous?.renewedAt ?? 0 }
      await this.#save()
    } catch (error) {
      throw toolsError(error, signal)
    } finally {
      await rm(zipFile, { force: true })
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  async #installFfmpeg(signal) {
    const { asset, sha256 } = this.assets.ffmpeg
    const root = path.join(this.binDir, 'ffmpeg')
    const dir = sha256.slice(0, 16)
    const finalDir = path.join(root, dir)
    const gzFile = `${finalDir}.gz`
    const tmpFile = `${finalDir}.tmp`
    const exe = `ffmpeg${this.assets.exeSuffix}`
    await mkdir(root, { recursive: true })
    await downloadVerified({
      url: `${this.ffmpegBaseUrl}/${asset}`,
      file: gzFile,
      sha256,
      fetchImpl: this.fetchImpl,
      signal,
      onProgress: this.#reportProgress('ffmpeg'),
    })
    try {
      await pipeline(createReadStream(gzFile), createGunzip(), createWriteStream(tmpFile, { mode: 0o755 }))
      await chmod(tmpFile, 0o755)
      await rm(finalDir, { recursive: true, force: true })
      await mkdir(finalDir)
      await rename(tmpFile, path.join(finalDir, exe))
      const version = await this.#probe(path.join(finalDir, exe), ['-version'], 'ffmpeg', signal)
        .catch(async (error) => {
          await rm(finalDir, { recursive: true, force: true })
          throw error
        })
      this.record.ffmpeg = { dir, exe, sha256, version }
      await this.#save()
    } catch (error) {
      throw toolsError(error, signal)
    } finally {
      await rm(gzFile, { force: true })
      await rm(tmpFile, { force: true })
    }
  }
}
