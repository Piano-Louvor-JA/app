import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { app, net, protocol } from 'electron'

import { API_BASE_URL } from './constants.mjs'
import { resolveMediaRoot } from './windows-media-root.mjs'

const IMAGE_EXT = /\.(bmp|jpe?g|png|gif|webp|ico)$/i

export function registerLocalScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'local',
      privileges: {
        standard: true,
        bypassCSP: true,
        supportFetchAPI: true,
        secure: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/** MIME real pelo conteúdo — no Windows o Chromium trata .bmp só como BMP. */
export function sniffImageMime(buffer) {
  if (!buffer || buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif'
  }
  if (
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

function mimeFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.ico') return 'image/x-icon'
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8'
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.m4a') return 'audio/mp4'
  if (ext === '.aac') return 'audio/aac'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.ogg') return 'audio/ogg'
  if (ext === '.flac') return 'audio/flac'
  if (ext === '.opus') return 'audio/opus'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mkv') return 'video/x-matroska'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.woff2') return 'font/woff2'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.vtt') return 'text/vtt; charset=utf-8'
  return 'application/octet-stream'
}

function parseByteRange(header, size) {
  if (!header || !Number.isFinite(size) || size <= 0) return null
  const match = String(header).match(/bytes=(\d*)-(\d*)/)
  if (!match) return null
  const start = match[1] === '' ? 0 : Number(match[1])
  const end = match[2] === '' ? size - 1 : Number(match[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null
  return {
    start: Math.max(0, start),
    end: Math.min(size - 1, end),
  }
}

/** Serve arquivo local com Content-Length + Range — senão o <video> fica com duration Infinity. */
function serveDiskFile(filePath, request, extraHeaders = {}) {
  if (!existsSync(filePath)) return new Response(null, { status: 404 })
  const { size } = statSync(filePath)
  const mime = mimeFromExtension(filePath)
  const range = parseByteRange(request.headers.get('range'), size)
  const streamOpts = range ? { start: range.start, end: range.end } : undefined
  const body = Readable.toWeb(createReadStream(filePath, streamOpts))
  const length = range ? range.end - range.start + 1 : size
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      ...(range
        ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` }
        : {}),
      ...extraHeaders,
    },
  })
}

const YT_STREAM_PATH = /^\/([\w-]{11})\/(video|audio)$/
const YT_CACHE_PATH = /^\/([\w-]{11})\.(mp4|vtt)$/

/**
 * @typedef {{ serve: (id: string, kind: 'video'|'audio', range: string | null, signal: AbortSignal) => Response,
 *   cacheFile: (name: string) => string }} OnlineVideoSource
 * @type {OnlineVideoSource | null}
 */
let onlineVideoSource = null

/** @param {OnlineVideoSource | null} source */
export function setOnlineVideoSource(source) {
  onlineVideoSource = source
}

/**
 * `local://yt-stream/<id>/<video|audio>` (trilha ainda baixando) e `local://yt-cache/<id>.<mp4|vtt>`
 * (arquivo pronto). Devolve `null` para os demais hosts.
 * @param {Request} request @param {OnlineVideoSource | null} [source]
 */
export function handleOnlineVideoRequest(request, source = onlineVideoSource) {
  const url = new URL(request.url)
  if (url.host !== 'yt-stream' && url.host !== 'yt-cache') return null
  // O player é de outra origem e, com legenda, pede imagem, som e legenda em modo CORS.
  const cors = { 'Access-Control-Allow-Origin': '*' }
  if (url.host === 'yt-stream') {
    const match = YT_STREAM_PATH.exec(url.pathname)
    if (!match || !source) return new Response(null, { status: 404 })
    const response = source.serve(match[1], /** @type {'video'|'audio'} */ (match[2]), request.headers.get('range'), request.signal)
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
  }
  const match = YT_CACHE_PATH.exec(url.pathname)
  if (!match || !source) return new Response(null, { status: 404 })
  return serveDiskFile(source.cacheFile(`${match[1]}.${match[2]}`), request, cors)
}

/**
 * Converte local://media/... no path de disco, sem consultar o registro de novo
 * (resolveMediaRoot é cacheado).
 * @param {string} requestUrl
 * @param {string} userDataRoot
 * @returns {{ kind: 'app' | 'media'; filePath: string; mediaRelative: string }}
 */
export function resolveLocalProtocolPath(requestUrl, userDataRoot) {
  const url = new URL(requestUrl)
  let filePath = decodeURIComponent(url.pathname)
  const host = url.host

  if (host === 'app') {
    if (process.platform === 'win32' && filePath.match(/^\/[a-zA-Z]:\//)) {
      filePath = filePath.slice(1)
    }
    return { kind: 'app', filePath, mediaRelative: '' }
  }

  let fallbackPath = ''
  if (host === 'media') {
    fallbackPath = filePath
  } else if (host) {
    fallbackPath = `/${host}${filePath}`
  } else {
    fallbackPath = filePath
  }

  fallbackPath = fallbackPath.replace(/^\/+/, '').replace(/\\/g, '/')
  const mediaRoot = resolveMediaRoot(userDataRoot)
  return {
    kind: 'media',
    filePath: path.join(mediaRoot, fallbackPath),
    mediaRelative: fallbackPath,
  }
}

function imageResponse(filePath) {
  const buffer = readFileSync(filePath)
  const mime = sniffImageMime(buffer) || mimeFromExtension(filePath)
  return new Response(buffer, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

export function registerLocalFileProtocol() {
  protocol.handle('local', async (request) => {
    const onlineVideo = handleOnlineVideoRequest(request)
    if (onlineVideo) return onlineVideo

    let resolved
    try {
      resolved = resolveLocalProtocolPath(request.url, app.getPath('userData'))
    } catch {
      return new Response(null, { status: 400 })
    }

    if (resolved.kind === 'app') {
      return serveDiskFile(resolved.filePath, request)
    }

    if (!existsSync(resolved.filePath)) {
      // Font files are exclusively managed by explicit Google Fonts downloads.
      // A missing/cancelled local face must never fall through to the media API.
      if (resolved.mediaRelative.startsWith('fontes/')) return new Response(null, { status: 404 })
      const apiUrl = `${API_BASE_URL}/file/${resolved.mediaRelative}`
      try {
        const response = await net.fetch(apiUrl)
        if (!response.ok) return new Response(null, { status: 404 })
        const buffer = Buffer.from(await response.arrayBuffer())
        mkdirSync(path.dirname(resolved.filePath), { recursive: true })
        writeFileSync(resolved.filePath, buffer)
        const mime = sniffImageMime(buffer) || mimeFromExtension(resolved.filePath)
        return new Response(buffer, {
          headers: {
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      } catch (error) {
        console.error('[protocol] fallback download error:', error)
        return new Response(null, { status: 404 })
      }
    }

    if (resolved.mediaRelative.startsWith('fontes/')) {
      return serveDiskFile(resolved.filePath, request, { 'Access-Control-Allow-Origin': '*' })
    }

    if (IMAGE_EXT.test(resolved.filePath)) {
      try {
        return imageResponse(resolved.filePath)
      } catch (error) {
        console.error('[protocol] falha ao ler imagem local:', error)
        return new Response(null, { status: 404 })
      }
    }

    return serveDiskFile(resolved.filePath, request)
  })
}
