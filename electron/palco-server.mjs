import { DEFAULT_REMOTE_PORT } from './remote-config.mjs'
import { readConnectionStartup, saveConnectionStartup } from './palco/connection-startup.mjs'
/**
 * Servidor do PALCO (cast para TV) — multi-slot (paridade PalcoOrchestrator APK).
 *
 * APK PalcoOrchestrator: cada slot = par de portas HTTP/WS próprio:
 *   slot 0 (principal): 47080/47081 (antes 7080/7081; salvos são migrados)
 *   slot 1: 47082/47083
 *   slot 2: 47084/47085 ...
 * Cada slot tem sender próprio (HTTP + WS), replay de estado, mídia, etc.
 *
 * IPC do renderer:
 *   palco:slots → lista slots
 *   palco:slot-create {label} → cria slot, retorna id
 *   palco:slot-remove {id} → remove (exceto principal)
 *   palco:send {slotId?, ...msg} → manda no slot (default: principal)
 *   palco:status {slotId?} → status de um slot (default: principal)
 *   palco:start {slotId?}, palco:stop {slotId?}, palco:slot-status {slotId?}
 *
 * Receiver conecta em `ws://ip:47081+2N/palco?port=47081+2N` (query port opcional)
 */

import { publishReceiverEvent } from './palco/receiver-events.mjs'
import { updateReplayState } from './palco/replay-state.mjs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { app, ipcMain } from 'electron'
import { WebSocketServer } from 'ws'

import { loadOrCreatePalcoToken, requestHasPalcoAccess } from './palco-token.mjs'
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_TRANSMISSION,
  migrateLegacyPort,
  normalizeOverlayStyle,
  rankInterfaces,
  readTransmissionConfig,
  resolveBind,
  saveTransmissionConfig,
  suggestPort,
  validatePort,
} from './palco/transmission-config.mjs'

const MAX_SLOTS = 8 // slot 0-7

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')

/** @typedef {import('node:http').IncomingMessage} Req */
/** @typedef {import('node:http').ServerResponse} Res */

/** Rede e token escolhidos na aba Transmissão (persistidos pelo manager). */
let _transmission = { ...DEFAULT_TRANSMISSION }
export function getTransmissionState() { return { ..._transmission } }
export function setTransmissionState(next) {
  _transmission = { bind: next?.bind ?? 'all', requireToken: next?.requireToken !== false }
}
function networkBinding() {
  return resolveBind(_transmission.bind, rankInterfaces(networkInterfaces()))
}
function lanIp() { return networkBinding().linkHost }
/** Token cobrado da rede; null quando o operador desligou a exigência. */
function requiredToken() { return _transmission.requireToken ? getPalcoToken() : null }
function isLoopback(ip) { return ip === '127.0.0.1' || ip === '::1' }

function portInUse(error, port) {
  return error?.code === 'EADDRINUSE' ? { code: 'port-in-use', port } : { code: 'start-failed', port }
}

/** Estado de um slot de palco. */
class PalcoSlot {
  #id
  #label
  #httpPort
  #wsPort
  #httpServer
  #preparing
  #wss
  #clients = new Set()
  #receiverIps = new Map() // WebSocket -> IP físico da TV/browser
  #lastByType = new Map() // replay pro receiver que chega tarde
  #running = false
  #media = new Map() // mídia local servida em /media/
  #contents // callback pro renderer
  #overlay
  #error = null
  #listenHost = null

  constructor(id, label, httpPort, wsPort, getContents, options = {}) {
    this.#id = id
    this.#label = label
    this.#httpPort = httpPort
    this.#wsPort = wsPort
    this.#contents = getContents
    this.#overlay = normalizeOverlayStyle(options.overlay)
  }

  get id() { return this.#id }
  get label() { return this.#label }
  get httpPort() { return this.#httpPort }
  get wsPort() { return this.#wsPort }
  get running() { return this.#running }
  get clientsCount() { return this.#clients.size }
  get overlay() { return { ...this.#overlay } }

  /** Aparência da legenda desta conexão; fontes abertas recebem na hora. */
  setOverlay(style) {
    this.#overlay = normalizeOverlayStyle({ ...this.#overlay, ...style })
    if (this.#running) this.broadcast(this.#overlayMessage())
    return this.overlay
  }

  #overlayMessage() { return { v: 2, type: 'overlayStyle', style: this.overlay } }

  /** Fecha quem entrou pela rede (token antigo); fontes deste computador seguem. */
  disconnectNetworkClients() {
    for (const [ws, ip] of this.#receiverIps) {
      if (!isLoopback(ip)) { try { ws.close() } catch { /* ignore */ } }
    }
  }

  /** Troca o par de portas (WS = HTTP + 1) mantendo o id. */
  async setPorts(httpPort) {
    if (this.#running) throw new Error('running')
    await this.#closeHttp()
    this.#httpPort = httpPort
    this.#wsPort = httpPort + 1
    this.#error = null
    await this.prepare()
  }

  /** Refaz o bind HTTP depois de a interface de rede mudar. */
  async rebind() {
    if (this.#running) throw new Error('running')
    await this.#closeHttp()
    await this.prepare()
  }

  async #closeHttp() {
    await this.#preparing?.catch(() => {})
    const server = this.#httpServer
    this.#httpServer = null
    if (server) await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.() })
  }

  /** Broadcast p/ todos os receivers conectados neste slot. */
  broadcast(obj) {
    updateReplayState(this.#lastByType, obj)
    const data = JSON.stringify(obj)
    for (const ws of this.#clients) {
      try { if (ws.readyState === ws.OPEN) ws.send(data) } catch { this.#clients.delete(ws) }
    }
  }

  /** Transiente: só p/ conectados AGORA — não grava replay.
   * Pause/play/seek/stop destruíam o replay: uma msg {video,action:play}
   * SEM url sobrescrevia o estado completo, e quem reconectasse recebia
   * play sem src (nada projetava) + timer/audio velhos em ordem errada.
   */
  broadcastTransient(obj) {
    const data = JSON.stringify(obj)
    for (const ws of this.#clients) {
      try { if (ws.readyState === ws.OPEN) ws.send(data) } catch { this.#clients.delete(ws) }
    }
  }

  /** The receiver remains reachable while transmission is off. */
  async prepare() {
    if (this.#httpServer?.listening) return
    if (this.#preparing) return this.#preparing
    this.#preparing = (async () => {
      const server = createServer((req, res) => { void this.handleHttp(req, res) })
      const host = networkBinding().listenHost
      this.#httpServer = server
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject)
          server.listen(this.#httpPort, host, resolve)
        })
        this.#listenHost = host
        this.#error = null
      } catch (error) {
        this.#httpServer = null
        server.close()
        this.#error = portInUse(error, this.#httpPort)
        throw error
      }
    })()
    try { await this.#preparing } finally { this.#preparing = null }
  }

  /** Enables transmission without replacing the already served receiver page. */
  async start() {
    if (this.#running) return true
    try {
      await this.prepare()
      this.#wss = new WebSocketServer({ port: this.#wsPort, host: this.#listenHost ?? networkBinding().listenHost })
      this.#wss.on('connection', (ws, req) => {
        if (req?.url && !req.url.split('?')[0].startsWith('/palco')) { ws.close(); return }
        // OBS S1: token na LAN (localhost bypass) — feature off = comportamento atual
        if (
          !requestHasPalcoAccess({
            remoteAddress: req?.socket?.remoteAddress,
            url: req?.url,
            headers: req?.headers,
            expectedToken: requiredToken(),
          })
        ) {
          try { ws.close() } catch { /* ignore */ }
          return
        }
        this.#clients.add(ws)
        const remoteIp = req?.socket?.remoteAddress?.replace('::ffff:', '')
        if (remoteIp) this.#receiverIps.set(ws, remoteIp)
        // replay do estado atual pro receiver que chegou depois
        for (const msg of this.#lastByType.values()) {
          try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)) } catch { this.#clients.delete(ws) }
        }
        if (remoteIp) {
          try { ws.send(JSON.stringify({ v: 2, type: 'youare', ip: remoteIp, slot: this.#id, slotLabel: this.#label })) } catch { /* ignore */ }
        }
        this.#contents()?.send('palco:receiver-connected', { ip: remoteIp, count: this.#clients.size, slotId: this.#id })
        ws.on('message', (raw) => {
          try {
            const message = { ...JSON.parse(String(raw)), slotId: this.#id }
            this.#contents()?.send('palco:event', message)
            publishReceiverEvent(message)
          } catch { /* ignore */ }
        })
        ws.on('close', () => {
          this.#clients.delete(ws)
          this.#receiverIps.delete(ws)
          this.#contents()?.send('palco:receiver-disconnected', { count: this.#clients.size, slotId: this.#id })
        })
        ws.on('error', () => this.#clients.delete(ws))
        // SEM ping (webOS 4.x não responde)
      })

      try {
        await new Promise((resolve, reject) => { this.#wss.once('listening', resolve); this.#wss.once('error', reject) })
      } catch (error) {
        const wss = this.#wss
        this.#wss = null
        wss?.close()
        this.#error = portInUse(error, this.#wsPort)
        throw error
      }
      this.#error = null
      this.#running = true
      updateReplayState(this.#lastByType, this.#overlayMessage())
      return true
    } catch (e) {
      console.error(`[palco:slot:${this.#id}] start error:`, e)
      return false
    }
  }

  /** Para este slot. */
  async stop() {
    if (!this.#running) return
    this.broadcastTransient({ v: 2, type: 'obsControl', action: 'stop' })
    this.#running = false
    const wss = this.#wss
    this.#wss = null
    if (wss) await new Promise(resolve => {
      const timeout = setTimeout(() => { for (const client of this.#clients) client.terminate(); resolve() }, 250)
      for (const client of this.#clients) client.close()
      wss.close(() => { clearTimeout(timeout); resolve() })
    })
    this.#clients.clear()
    this.#receiverIps.clear()
    this.#lastByType.clear()
    this.#media.clear()
  }

  async dispose() {
    await this.stop()
    await this.#closeHttp()
  }

  /** Manda mensagem prós receivers deste slot. */
  send(msg) {
    if (!this.#running) return false
    // normaliza: string JSON → objeto (spread de string vira {0:'{',1:'"'...})
    let m = msg
    if (typeof m === 'string') {
      try { m = JSON.parse(m) } catch { return false }
    }
    if (!m || typeof m !== 'object' || !m.type) return false
    if (m.type === 'mirror-signal') { this.broadcastTransient(m); return true }
    if (m.type === 'obsControl') { this.broadcastTransient(m); return true }
    // OBS S1: URL de mídia sai COM o token (a TV/browser recebe a URL já
    // autenticada — o renderer não precisa saber do token).
    const token = requiredToken()
    if (token && typeof m.url === 'string' && m.url.includes('/media/')) {
      try {
        const u = new URL(m.url)
        u.searchParams.set('token', token)
        m = { ...m, url: u.toString() }
      } catch { /* url malformada — segue como veio */ }
    }
    // Mesmo gate para o BG/cover da projection: <img> não manda header, e
    // localhost bypass escondia o 403 — browser/OBS/TV buscavam
    // http://<lan>:47080/media/... sem token → 403 → onerror → fallback FIXO.
    const bgUrl = m.type === 'projection' || m.type === 'stageReturn' ? (m.background ?? m.cover) : undefined
    if (token && typeof bgUrl === 'string' && bgUrl.includes('/media/')) {
      try {
        const u = new URL(bgUrl)
        u.searchParams.set('token', token)
        const patched = u.toString()
        if (m.background === bgUrl) m = { ...m, background: patched }
        else m = { ...m, cover: patched }
      } catch { /* url malformada — segue como veio */ }
    }
    // Transientes: action sem url/conteúdo NÃO entra no replay.
    // audio stop GRAVA (fix 27/08): é estado terminal — como transient, o
    // replay ficava com o 'play' velho e o F5 na TV ressuscitava o MP3.
    if (m.type === 'video' && m.action === 'captions') {
      const video = this.#lastByType.get('video')
      if (video?.youtubeId) this.#lastByType.set('video', { ...video, captionsHidden: m.captionsHidden === true })
      this.broadcastTransient(m)
      return true
    }
    const transient =
      m.action === 'pause' || m.action === 'play' || m.action === 'seek'
    if (transient) this.broadcastTransient(m)
    else this.broadcast(m)
    return true
  }

  /** Status deste slot. */
  status() {
    const host = lanIp()
    const tokenQuery = requiredToken() ? `?token=${requiredToken()}` : ''
    return {
      id: this.#id,
      label: this.#label,
      running: this.#running,
      clients: this.#clients.size,
      receiverIps: Array.from(new Set(this.#receiverIps.values())),
      httpPort: this.#httpPort,
      wsPort: this.#wsPort,
      listenHost: this.#listenHost ?? networkBinding().listenHost,
      error: this.#error,
      overlay: this.overlay,
      url: `http://${host}:${this.#httpPort}`,
      wsUrl: `ws://${host}:${this.#wsPort}/palco`,
      // OBS S1: receiver URL pronta com token (UI copia/cola no OBS Browser Source)
      receiverUrl: this.#running ? `http://${host}:${this.#httpPort}/espelho${tokenQuery}` : null,
      overlayUrl: this.#running ? `http://${host}:${this.#httpPort}/legenda${tokenQuery}` : null,
      returnUrl: this.#running ? `http://${host}:${this.#httpPort}/retorno${tokenQuery}` : null,
    }
  }

  /** Handler HTTP unificado (serve receiver, /status, /bg/, /proxy, /media/). */
  async handleHttp(req, res) {
    const url = new URL(req.url ?? '/', 'http://x')
    const p = url.pathname

    // Scan do receiver: identifica sender na sub-rede
    if (p === '/status') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ unlocked: true, running: this.#running, clients: this.#clients.size, slotId: this.#id, label: this.#label, httpPort: this.#httpPort, wsPort: this.#wsPort }))
      return
    }

    // Controle do pregador: página LAN sem CDN, preview passivo + remote WS.
    // Preview = iframe escalado do PRÓPRIO receiver.html — mesmo renderizador
    // da TV (bg, letra, caixinha, footer), zero divergência visual.
    if (p === '/speaker') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(speakerPageHtml({ palcoToken: getPalcoToken() }))
      return
    }

    // Legenda da Transmissão (fonte de navegador do OBS) e a aparência desta conexão
    if (p === '/legenda') {
      try {
        const page = await readFile(path.join(__dirname, 'palco', 'overlay.html'))
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(page)
      } catch {
        res.statusCode = 404
        res.end('overlay not bundled')
      }
      return
    }
    if (p === '/legenda-config') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ style: this.overlay }))
      return
    }

    // Receiver embutido (mesma página do palco-receiver): /espelho replica a TV; em /retorno vira o retorno de palco
    if (p === '/' || p === '/receiver.html' || p === '/index.html' || p === '/espelho' || p === '/retorno') {
      try {
        const page = await readFile(path.join(__dirname, 'palco', 'receiver.html'))
        // Versão do RECEIVER (appinfo.json embutido, mesmo do .ipk webOS) —
        // o HTML resolve via fetch. NÃO usar a versão do app desktop aqui.
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        // Receiver sempre revalida — evita browser preso em HTML antigo
        res.setHeader('Cache-Control', 'no-store')
        res.end(page)
      } catch {
        res.statusCode = 404
        res.end('receiver not bundled')
      }
      return
    }

    // Assets do receiver
    // Assets do receiver — nomes reservados de rotas (/proxy, /status…)
    // fora: /proxy casava aqui e 404ava ANTES do handler real (L301),
    // quebrando todo bg/cover externo (músicas da API) → fallback.
    const assetMatch = /^(?!\/(?:proxy|status|bg|media)(?:\/|$))\/([a-z0-9._-]+)$/i.exec(p)
    if (assetMatch) {
      if (/\.html$/i.test(p)) { res.statusCode = 404; res.end(); return }
      try {
        const file = path.join(__dirname, 'palco', String(assetMatch[1]))
        const buf = await readFile(file)
        const ext = path.extname(file).toLowerCase()
        res.setHeader('Content-Type', ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'application/octet-stream')
        res.end(buf)
      } catch {
        res.statusCode = 404; res.end()
      }
      return
    }

    // Background oficial do stage: /bg/bg-01.png → dist/assets/bg-01-<hash>.png
    if (p.startsWith('/bg/')) {
      const id = p.slice('/bg/'.length).replace(/[^a-z0-9._-]/gi, '')
      if (id) {
        try {
          const { readdir } = await import('node:fs/promises')
          const files = await readdir(path.join(DIST_DIR, 'assets'))
          const hit = files.find(f => f.startsWith(id.replace(/\.png$/, '')) && f.endsWith('.png'))
          if (hit) {
            const buf = await readFile(path.join(DIST_DIR, 'assets', hit))
            res.setHeader('Content-Type', 'image/png')
            res.setHeader('Cache-Control', 'public, max-age=86400')
            res.end(buf)
            return
          }
        } catch { /* tenta a fonte direto */ }
        // Dev (Vite em memória) ou dist sem hash: serve direto da FONTE
        // src/assets/backgrounds/ — fonte da verdade em dev E prod.
        try {
          const base = id.replace(/\.png$/, '')
          for (const cand of [base + '.png', base + '.jpg', base + '.webp']) {
            const buf = await readFile(path.join(__dirname, '..', 'src', 'assets', 'backgrounds', cand)).catch(() => null)
            if (buf) {
              res.setHeader('Content-Type', cand.endsWith('.jpg') ? 'image/jpeg' : 'image/png')
              res.setHeader('Cache-Control', 'public, max-age=86400')
              res.end(buf)
              return
            }
          }
        } catch { /* 404 abaixo */ }
      }
      res.statusCode = 404; res.end(); return
    }

    // Proxy CORS p/ o receiver (origem file://)
    if (p === '/proxy') {
      if (
        !requestHasPalcoAccess({
          remoteAddress: req.socket?.remoteAddress,
          url: req.url,
          headers: req.headers,
          expectedToken: requiredToken(),
        })
      ) {
        res.statusCode = 403
        res.end('forbidden')
        return
      }
      const target = url.searchParams.get('url')
      if (!target || !/^https?:\/\//i.test(target)) { res.statusCode = 400; res.end('bad url'); return }
      try {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 15000)
        const upstream = await fetch(target, { signal: controller.signal, headers: { 'user-agent': 'LouvorJA-Palco/1.0' } })
        clearTimeout(t)
        res.statusCode = upstream.status
        const ctype = upstream.headers.get('content-type')
        if (ctype) res.setHeader('Content-Type', ctype)
        const clen = upstream.headers.get('content-length')
        if (clen) res.setHeader('Content-Length', clen)
        res.setHeader('Accept-Ranges', 'none')
        if (req.method === 'HEAD') { res.end(); return }
        const buf = Buffer.from(await upstream.arrayBuffer())
        res.end(buf)
      } catch (e) { res.statusCode = 502; res.end(`proxy error: ${e.message}`) }
      return
    }

    // Mídia local servida pelo sender — com HTTP Range (streaming/seek):
    // sem Range o <video> do receiver baixa o MP4 inteiro antes de tocar
    // fluido (stutter em 1080p) e seek não funciona.
    if (p.startsWith('/media/')) {
      if (
        !requestHasPalcoAccess({
          remoteAddress: req.socket?.remoteAddress,
          url: req.url,
          headers: req.headers,
          expectedToken: requiredToken(),
        })
      ) {
        res.statusCode = 403
        res.end('forbidden')
        return
      }
      const name = p.slice('/media/'.length)
      const entry = this.#media.get(name)
      if (!entry) { res.statusCode = 404; res.end(); return }
      res.setHeader('Content-Type', entry.mime)
      res.setHeader('Accept-Ranges', 'bytes')
      const total = entry.bytes.length
      const range = req.headers.range
      if (range) {
        const rm = /bytes=(\d*)-(\d*)/.exec(String(range))
        if (rm) {
          const start = rm[1] ? parseInt(rm[1], 10) : 0
          const end = rm[2] ? Math.min(parseInt(rm[2], 10), total - 1) : total - 1
          if (start <= end && start < total) {
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
            res.setHeader('Content-Length', end - start + 1)
            if (req.method === 'HEAD') { res.end(); return }
            res.end(entry.bytes.subarray(start, end + 1))
            return
          }
        }
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${total}`)
        res.end()
        return
      }
      res.setHeader('Content-Length', total)
      if (req.method === 'HEAD') { res.end(); return }
      res.end(entry.bytes)
      return
    }

    res.statusCode = 404; res.end()
  }

  /** Publica mídia via base64 (compat renderer que já tem bytes). */
  serveMediaBase64(name, mime, base64) {
    if (!this.#running) return null
    this.#media.set(name, { mime, bytes: Buffer.from(base64, 'base64') })
    return `http://${lanIp()}:${this.#httpPort}/media/${name}`
  }

  /** Publica arquivo LOCAL (file://, path, local://media/...) → /media/. */
  async servePath(filePath) {
    if (!this.#running) return null
    try {
      let clean = String(filePath ?? '').replace(/^file:\/\//, '')
      const localMatch = clean.match(/^local:\/\/media\/(music|images|covers|slides)\/(.+)$/)
      if (localMatch) {
        const { resolveMediaDirectory } = await import('./paths.mjs')
        const kind = localMatch[1] === 'images' ? 'slides' : localMatch[1]
        clean = path.join(resolveMediaDirectory(kind), decodeURIComponent(localMatch[2]))
      }
      const { stat, readFile: rf } = await import('node:fs/promises')
      const info = await stat(clean)
      if (!info.isFile() || info.size > 200 * 1024 * 1024) return null
      const base = path.basename(clean).replace(/[^A-Za-z0-9._-]/g, '_')
      // Nome DETERMINÍSTICO (hash do path resolved + mtime + size): a mesma
      // imagem publicada N vezes gera a MESMA URL. Com nome por timestamp,
      // cada republish (o onTimeUpdate republisha ~4x/s) trocava o src do
      // <img> na TV e o Chromium recarregava a imagem a cada publish —
      // flash = oscilação fallback↔imagem. URL estável = cache do browser,
      // zero reload. mtime/size no hash: arquivo re-baixado (mesmo path,
      // bytes novos) muda de URL → cache não serve imagem velha.
      const h = createHash('sha1')
        .update(`${path.resolve(clean)}|${info.mtimeMs}|${info.size}`)
        .digest('hex')
        .slice(0, 12)
      const name = `local_${h}_${base}`
      const bytes = await rf(clean)
      const mime = /\.(mp3|m4a)$/i.test(base) ? 'audio/mpeg' : /\.mp4$/i.test(base) ? 'video/mp4' : 'image/png'
      this.#media.set(name, { mime, bytes })
      return `http://${lanIp()}:${this.#httpPort}/media/${name}`
    } catch { return null }
  }

  clearMedia() { this.#media.clear(); return true }
}

/** Gerenciador de slots (singleton no main process). */
function slotsConfigPath() {
  return path.join(app.getPath('userData'), 'palco-slots.json')
}

/** Token de acesso (persistido no userData). Feature off = null. */
let _palcoToken = null
export function palcoTokenPath() {
  return path.join(app.getPath('userData'), 'palco-token.txt')
}
export function getPalcoToken() {
  return _palcoToken
}
export function enablePalcoToken() {
  _palcoToken = loadOrCreatePalcoToken(palcoTokenPath())
  return _palcoToken
}
export function resetPalcoToken() {
  const tmp = palcoTokenPath() + '.reset'
  _palcoToken = loadOrCreatePalcoToken(tmp) // path inexistente → regenera
  try { renameSync(tmp, palcoTokenPath()) } catch { /* best effort */ }
  return _palcoToken
}

function readPersistedSlots() {
  try {
    const raw = JSON.parse(readFileSync(slotsConfigPath(), 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

class PalcoManager {
  #slots = new Map() // id -> PalcoSlot
  #getContents // callback renderer

  constructor(getContents) { this.#getContents = getContents }

  /** Slot principal (id='0') sempre existe. */
  init() {
    const stored = readPersistedSlots()
    let migrated = false
    const rows = stored.map((item) => {
      const httpPort = Number(item?.httpPort)
      const moved = migrateLegacyPort(httpPort)
      if (moved === httpPort || Number(item?.wsPort) !== httpPort + 1) return item
      migrated = true
      return { ...item, httpPort: moved, wsPort: moved + 1 }
    })
    const principal = rows.find(item => String(item?.id) === '0')
    const principalPort = Number(principal?.httpPort)
    const principalHttp = validatePort(principalPort, []).ok && Number(principal?.wsPort) === principalPort + 1 ? principalPort : DEFAULT_HTTP_PORT
    this.ensureSlot('0', 'Principal', principalHttp, principalHttp + 1, principal?.overlay)
    // Operador configura a TV 2 uma vez; slots voltam após restart.
    for (const item of rows) {
      const httpPort = Number(item?.httpPort)
      const wsPort = Number(item?.wsPort)
      const id = String(item?.id ?? '')
      const label = String(item?.label ?? '').trim()
      if (
        id !== '0' && label && !this.#slots.has(id) &&
        validatePort(httpPort, this.#takenPorts()).ok &&
        wsPort === httpPort + 1 && this.#slots.size < MAX_SLOTS
      ) this.ensureSlot(id, label, httpPort, wsPort, item?.overlay)
    }
    if (migrated) this.persistSlots()
  }

  #takenPorts(exceptId) {
    return this.getAllSlots().filter(slot => slot.id !== exceptId).map(slot => slot.httpPort)
  }

  persistSlots() {
    try {
      const rows = Array.from(this.#slots.values())
        .map((slot) => slot.id === '0'
          ? { id: slot.id, httpPort: slot.httpPort, wsPort: slot.wsPort, overlay: slot.overlay }
          : { id: slot.id, label: slot.label, httpPort: slot.httpPort, wsPort: slot.wsPort, overlay: slot.overlay })
      const file = slotsConfigPath()
      mkdirSync(path.dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf8')
      renameSync(tmp, file)
    } catch (error) {
      console.warn('[palco] persist slots:', error?.message ?? error)
    }
  }

  /** Garante slot; cria se não existe. */
  ensureSlot(id, label, httpPort, wsPort, overlay) {
    if (this.#slots.has(id)) return this.#slots.get(id)
    const slot = new PalcoSlot(id, label, httpPort, wsPort, () => this.#getContents(), { overlay })
    this.#slots.set(id, slot)
    void slot.prepare().catch(error => console.warn('[palco] receiver prepare:', error?.message ?? error))
    return slot
  }

  /** Cria novo slot (aloca próximo par de portas livre). */
  createSlot(label = `TV ${this.#slots.size}`) {
    if (this.#slots.size >= MAX_SLOTS) throw new Error('max slots')
    let httpPort = suggestPort(DEFAULT_HTTP_PORT + 2, this.#takenPorts())
    // id = porta HTTP de criação (ex: "47082"); continua o mesmo se a porta mudar depois
    while (httpPort !== null && this.#slots.has(String(httpPort))) httpPort = suggestPort(httpPort + 2, this.#takenPorts())
    if (httpPort === null) throw new Error('no free port')
    const slot = this.ensureSlot(String(httpPort), label, httpPort, httpPort + 1)
    this.persistSlots()
    return slot
  }

  /** Porta e/ou aparência de uma conexão. */
  async updateSlot(id, { httpPort, overlay } = {}) {
    const slot = this.#slots.get(id)
    if (!slot) return { ok: false, reason: 'not-found' }
    if (httpPort !== undefined && httpPort !== slot.httpPort) {
      const check = validatePort(httpPort, this.#takenPorts(id))
      if (!check.ok) return check
      if (slot.running) return { ok: false, reason: 'running' }
      try {
        await slot.setPorts(httpPort)
      } catch (error) {
        this.persistSlots()
        console.warn('[palco] port change:', error?.message ?? error)
        return { ok: false, reason: 'port-in-use', status: this.statusOf(slot) }
      }
    }
    if (overlay) slot.setOverlay(overlay)
    this.persistSlots()
    return { ok: true, status: this.statusOf(slot) }
  }

  /** Status com sugestão de porta quando a atual está ocupada por outro programa. */
  statusOf(slot) {
    const status = slot.status()
    if (status.error?.code !== 'port-in-use') return status
    const suggestedPort = suggestPort(slot.httpPort + 2, this.#takenPorts(slot.id), [status.error.port])
    return { ...status, error: { ...status.error, suggestedPort } }
  }

  /** Aplica rede/token; trocar a interface exige todas as conexões paradas. */
  async setTransmission(file, next) {
    const current = getTransmissionState()
    const bind = next?.bind ?? current.bind
    if (bind !== current.bind && this.getAllSlots().some(slot => slot.running)) return { ok: false, reason: 'running' }
    const saved = saveTransmissionConfig(file, { bind, requireToken: next?.requireToken ?? current.requireToken })
    setTransmissionState(saved)
    if (saved.bind !== current.bind) {
      await Promise.all(this.getAllSlots().map(slot => slot.rebind().catch(error => console.warn('[palco] rebind:', slot.id, error?.message ?? error))))
    }
    return { ok: true, ...saved }
  }

  /** Remove slot (exceto principal). */
  removeSlot(id) {
    if (id === '0') return false
    const slot = this.#slots.get(id)
    if (!slot) return false
    void slot.dispose()
    this.#slots.delete(id)
    this.persistSlots()
    return true
  }

  getSlot(id = '0') { return this.#slots.get(id) }
  getAllSlots() { return Array.from(this.#slots.values()) }
  getPrincipal() { return this.#slots.get('0') }

  /** Para mídia em TODAS as TVs (áudio+vídeo) — usado no quit do app. */
  stopAllMedia() {
    for (const slot of this.#slots.values()) {
      try {
        if (!slot.running) continue
        slot.broadcastTransient({ v: 2, type: 'audio', action: 'stop' })
        slot.broadcastTransient({ v: 2, type: 'video', action: 'stop' })
      } catch { /* ignore */ }
    }
    return true
  }

  /** Broadcast p/ TODOS os slots ligados (ex: projeção fechou → idle). */
  broadcastAll(msg) {
    for (const slot of this.#slots.values()) {
      try { if (slot.running) slot.broadcastTransient(msg) } catch { /* ignore */ }
    }
    return true
  }
}

/** Instância única do manager. */
let manager = null

/** Anexa ao main process (chamado em main.mjs). */
export function attachPalcoServer(getContents) {
  const transmissionFile = path.join(app.getPath('userData'), 'palco-transmission.json')
  setTransmissionState(readTransmissionConfig(transmissionFile))
  if (!manager) manager = new PalcoManager(getContents)
  manager.init()
  const startupFile = path.join(app.getPath('userData'), 'palco-connections-startup.json')
  let startup = readConnectionStartup(startupFile)
  function saveStartup(next) {
    saveConnectionStartup(startupFile, next)
    startup = next
  }
  if (startup.enabled) {
    for (const id of startup.activeIds) {
      const slot = manager.getSlot(id)
      if (slot) void slot.start().catch(error => console.warn('[palco] restore:', id, error))
    }
  }
  ipcMain.handle('palco:persistence-get', () => ({ enabled: startup.enabled }))
  ipcMain.handle('palco:persistence-set', (_e, { enabled }) => {
    saveStartup({ enabled: enabled === true, activeIds: enabled === true ? manager.getAllSlots().filter(slot => slot.running).map(slot => slot.id) : [] })
    return { enabled: startup.enabled }
  })

  // OBS S1: token de acesso carregado/criado 1x no boot (persistido no userData)
  enablePalcoToken()

  // IPC: token (UI mostra URL pronta p/ OBS + reset)
  ipcMain.handle('palco:token', () => ({ token: getPalcoToken(), path: palcoTokenPath() }))
  ipcMain.handle('palco:token-reset', () => {
    const token = resetPalcoToken()
    for (const slot of manager.getAllSlots()) slot.disconnectNetworkClients()
    return { token }
  })

  // IPC: lista slots
  ipcMain.handle('palco:slots', () => manager.getAllSlots().map(slot => manager.statusOf(slot)))

  // IPC: cria slot
  ipcMain.handle('palco:slot-create', (_e, { label }) => {
    const slot = manager.createSlot(label)
    return { id: slot.id, label: slot.label, httpPort: slot.httpPort, wsPort: slot.wsPort }
  })

  // IPC: remove slot
  ipcMain.handle('palco:slot-remove', (_e, { id }) => {
    const removed = manager.removeSlot(id)
    if (removed && startup.enabled) saveStartup({ ...startup, activeIds: startup.activeIds.filter(active => active !== id) })
    return removed
  })

  ipcMain.handle('palco:slot-update', (_e, { id, httpPort, overlay } = {}) => manager.updateSlot(String(id ?? ''), { httpPort, overlay }))

  // IPC: rede/token da aba Transmissão
  ipcMain.handle('palco:transmission-get', () => {
    const interfaces = rankInterfaces(networkInterfaces())
    const state = getTransmissionState()
    return { ...state, ...resolveBind(state.bind, interfaces), bind: state.bind, interfaces, token: getPalcoToken() }
  })
  ipcMain.handle('palco:transmission-set', (_e, next) => manager.setTransmission(transmissionFile, next))

  // IPC: status (default slot 0)
  ipcMain.handle('palco:status', (_e, { slotId }) => {
    const slot = manager.getSlot(slotId ?? '0')
    return slot ? manager.statusOf(slot) : null
  })

  // IPC: start/stop (default slot 0)
  ipcMain.handle('palco:start', async (_e, { slotId }) => {
    const id = slotId ?? '0'
    const started = await (manager.getSlot(id)?.start() ?? false)
    if (started && startup.enabled) saveStartup({ ...startup, activeIds: [...new Set([...startup.activeIds, id])] })
    return started
  })
  ipcMain.handle('palco:stop', async (_e, { slotId }) => {
    const id = slotId ?? '0'
    await manager.getSlot(id)?.stop()
    if (startup.enabled) saveStartup({ ...startup, activeIds: startup.activeIds.filter(active => active !== id) })
    return true
  })

  // IPC: send → slot específico (default: principal)
  ipcMain.handle('palco:send', (_e, { slotId, ...msg }) => {
    const slot = manager.getSlot(slotId ?? '0')
    const r = slot?.send(msg) ?? false
    console.log('[palco:send]', slotId ?? '0', msg?.type, '→ ok=' + r)
    return r
  })

  // IPC: serve media (base64)
  ipcMain.handle('palco:serve-media', (_e, { slotId, name, mime, base64 }) => {
    const slot = manager.getSlot(slotId ?? '0')
    return slot?.serveMediaBase64(name, mime, base64) ?? null
  })

  // IPC: serve path (arquivo local)
  ipcMain.handle('palco:serve-path', async (_e, { slotId, path }) => {
    const slot = manager.getSlot(slotId ?? '0')
    return slot?.servePath(path) ?? null
  })

  // IPC: clear media
  ipcMain.handle('palco:clear-media', (_e, { slotId }) => {
    const slot = manager.getSlot(slotId ?? '0')
    return slot?.clearMedia() ?? true
  })

  // Expõe manager pra debug
  globalThis.__PALCO_MANAGER__ = manager
}

export function getPalcoManager() { return manager }

// Testes de handleHttp (node puro, electron mockado) — see palco-assets.test.ts
export { PalcoSlot }

// ── Página do Pregador (/speaker) ─────────────────────────────────────────────
// HTML standalone (sem build) servido pelo slot HTTP. Preview full-area (flex,
// 16:9 máx por largura, cresce até o limite sem distorcer), controles no rodapé
// (thumb-friendly), i18n via ?lang=/navigator.language (pt-BR/en/es) e
// design tokens de src/design-system/tokens interpolados (fonte única).

/** Tokens do design system (unicidade com o renderer). */
const SPEAKER_TOKENS = {
  bg: '#131313', // colors.dark.background
  surface: '#1E1E1E', // colors.dark.surfaceElevated
  surfaceInput: '#242424', // colors.dark.surfaceCard
  onSurface: '#e5e2e1', // colors.dark.onSurface
  onSurfaceVariant: '#bfc7d4', // colors.dark.onSurfaceVariant
  primary: '#E0895A', // accents[defaultAccent].primary (orange)
  onPrimary: '#2b160b', // contraste para o realce laranja
  outline: 'rgba(255,255,255,0.10)', // colors.dark.outlineStrong
  success: '#64d99b',
  radiusSm: '8px 0 8px 0', // radius.sm
  radiusMd: '12px 0 12px 0', // radius.md
  spacing1: '4px', spacing2: '8px', spacing3: '12px', spacing4: '16px',
}

/** Dicionário i18n da página do pregador — TODO texto visível passa por aqui. */
export const SPEAKER_I18N = {
  'pt-BR': {
    disconnected: 'A conexão foi encerrada pelo desktop. Outro dispositivo já pode acessar o modo interativo.',
    waiting: 'Aguardando transmissão',
    interactiveBusy: 'Já existe uma conexão interativa ativa. Encerre a conexão no outro dispositivo e atualize esta página para tentar novamente.',
    stopwatch: 'Tempo de pregação', start: 'Iniciar', pause: 'Pausar', resume: 'Continuar', reset: 'Zerar', title: 'Tela de apoio', connecting: 'Conectando preview…', noPairing: 'Sem pareamento — cole o link do QR',
    pairHint: 'Pareamento perdido. Cole abaixo o link do QR exibido no app do desktop (começa com http://…/speaker?token=…):',
    connect: 'Conectar', cancel: 'Cancelar', repair: 'Reemparelhar',
    previousSlide: 'Anterior', nextSlide: 'Próximo', unavailable: 'Sem slide', back: 'Voltar', next: 'Avançar', previewTitle: 'Preview da projeção',
  },
  en: {
    disconnected: 'The desktop ended this connection. Another device can now access interactive mode.',
    waiting: 'Waiting for broadcast',
    interactiveBusy: 'An interactive connection is already active. Disconnect the other device and refresh this page to try again.',
    stopwatch: 'Sermon time', start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset', title: 'Support screen', connecting: 'Connecting preview…', noPairing: 'Not paired — paste the QR link',
    pairHint: 'Pairing lost. Paste below the QR link shown in the desktop app (starts with http://…/speaker?token=…):',
    connect: 'Connect', cancel: 'Cancel', repair: 'Re-pair',
    previousSlide: 'Previous', nextSlide: 'Next', unavailable: 'No slide', back: 'Back', next: 'Next', previewTitle: 'Projection preview',
  },
  es: {
    disconnected: 'El escritorio finalizó la conexión. Otro dispositivo ya puede acceder al modo interactivo.',
    waiting: 'Esperando transmisión',
    interactiveBusy: 'Ya existe una conexión interactiva activa. Desconecta el otro dispositivo y actualiza esta página para intentarlo de nuevo.',
    stopwatch: 'Tiempo de predicación', start: 'Iniciar', pause: 'Pausar', resume: 'Continuar', reset: 'Reiniciar', title: 'Pantalla de apoyo', connecting: 'Conectando vista previa…', noPairing: 'Sin emparejar — pega el enlace del QR',
    pairHint: 'Emparejamiento perdido. Pega abajo el enlace del QR mostrado en la app de escritorio (empieza con http://…/speaker?token=…):',
    connect: 'Conectar', cancel: 'Cancelar', repair: 'Reemparejar',
    previousSlide: 'Anterior', nextSlide: 'Siguiente', unavailable: 'Sin diapositiva', back: 'Atrás', next: 'Adelante', previewTitle: 'Vista previa de proyección',
  },
}

/**
 * HTML da página /speaker. `lang` força idioma (teste); no navegador decide
 * ?lang= > navigator.language > pt-BR.
 */
export function speakerPageHtml({ palcoToken = '' } = {}) {
  const t = SPEAKER_TOKENS
  const dictJson = JSON.stringify(SPEAKER_I18N)
  // Token do palco embutido no JS (regex do receiver aceita A-Z0-9 de 5).
  const safeToken = /^[A-Z0-9]{5}$/.test(palcoToken) ? palcoToken : ''
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover"><title>Tela de apoio · LouvorJA</title>
<style>
:root{--bg:${t.bg};--surface:${t.surface};--surface-input:${t.surfaceInput};--on-surface:${t.onSurface};--on-surface-variant:${t.onSurfaceVariant};--primary:${t.primary};--on-primary:${t.onPrimary};--outline:${t.outline};--success:${t.success};--radius-sm:${t.radiusSm};--radius-md:${t.radiusMd};--sp1:${t.spacing1};--sp2:${t.spacing2};--sp3:${t.spacing3};--sp4:${t.spacing4}}
[hidden]{display:none!important}
#connectionError{position:fixed;inset:0;z-index:20;display:grid;place-content:center;padding:32px;background:var(--bg);color:var(--on-surface);text-align:center;font-size:20px;line-height:1.6}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--on-surface);font:16px 'Plus Jakarta Sans',system-ui,sans-serif;display:flex;flex-direction:column;min-height:100dvh}
main{flex:1;display:flex;flex-direction:column;padding:var(--sp3) var(--sp3) var(--sp2);max-width:480px;width:100%;margin:auto;min-height:0;box-sizing:border-box}
h1{font-size:20px;margin:0}
.speaker-header{display:flex;align-items:center;justify-content:space-between;gap:var(--sp2);margin-bottom:var(--sp3)}
.stopwatch{display:grid;grid-template-columns:auto auto;align-items:center;gap:4px 12px;background:var(--surface);border:1px solid var(--outline);border-radius:var(--radius-sm);padding:8px 10px}
.stopwatch-label{grid-column:1/-1;font-size:11px;color:var(--on-surface-variant)}
#stopwatchTime{font-size:26px;line-height:1.2;font-weight:700;font-variant-numeric:tabular-nums;color:var(--primary)}
.stopwatch-controls{display:flex;gap:6px}
.stopwatch button{min-height:36px;width:auto;padding:6px 10px;font-size:12px}
#stopwatchReset{background:var(--surface-input);color:var(--on-surface)}
@media(max-width:350px){.speaker-header{align-items:flex-start;flex-direction:column}.stopwatch{align-self:stretch}}

.preview{flex:1;min-height:0;background:#000;border:1px solid var(--outline);border-radius:var(--radius-sm);overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center}
.bible-preview{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;justify-content:center;gap:20px;padding:24px;background:#000;text-align:center;overflow:auto}
.bible-preview[hidden]{display:none}
#bibleText{font-size:clamp(18px,4.5vw,28px);line-height:1.5;white-space:pre-line}
#bibleReference{color:var(--primary);font-size:16px}
.thumbnail span{padding:8px;text-align:center;max-height:100%;overflow:auto;box-sizing:border-box}
#supportIdle{position:absolute;inset:0;z-index:2;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
#supportIdle img{width:64px;height:auto;animation:supportPulse 3.2s ease-in-out infinite}
#supportIdle span{font-size:13px;letter-spacing:.06em;color:var(--on-surface-variant)}
@keyframes supportPulse{0%,100%{opacity:.35}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){#supportIdle img{animation:none}}
.preview>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
.preview>img[hidden]{display:none}
.preview iframe{width:1280px;height:720px;border:0;transform-origin:0 0;position:absolute;top:0;left:0;background:#000}
#msg{position:absolute;inset:0;display:grid;place-items:center;color:var(--on-surface-variant);font-size:14px;padding:var(--sp2);text-align:center}
footer{margin-top:var(--sp2)}
.neighbors{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp3);margin-bottom:var(--sp3)}
.neighbor{margin:0;min-width:0;background:var(--surface);border:1px solid var(--outline);border-radius:var(--radius-sm);overflow:hidden}
.neighbor figcaption{padding:var(--sp2);font-size:15px;font-weight:600;color:var(--primary)}
.thumbnail{position:relative;height:clamp(64px,14dvh,130px);background:#000;display:grid;place-items:center}
.thumbnail img{width:100%;height:100%;object-fit:contain;position:absolute;inset:0}
.thumbnail img[hidden]{display:none}
.neighbors.music-neighbors{grid-template-columns:1fr}
.neighbors.music-neighbors .neighbor:first-child{display:none}
.neighbors.bible-neighbors.music-neighbors .thumbnail{align-items:center}
.neighbors.bible-neighbors.music-neighbors .thumbnail span{font-size:clamp(22px,5vw,30px);line-height:1.5;padding:16px;text-align:center}
.neighbors.bible-neighbors .thumbnail{height:clamp(140px,24dvh,240px);align-items:start;justify-items:stretch}
.neighbors.bible-neighbors .verse-reference{display:block;color:var(--primary);font-weight:500;margin-bottom:8px}
.neighbors.bible-neighbors .thumbnail span{font-size:14px;line-height:1.6;color:var(--on-surface);white-space:pre-line;text-align:left;display:block;width:100%;padding:12px}
.thumbnail span{color:var(--on-surface-variant);font-size:12px}
button:focus-visible{outline:2px solid var(--on-surface);outline-offset:3px}
button{min-height:64px;width:48%;font-size:28px;border-radius:var(--radius-md);border:0;background:var(--primary);color:var(--on-primary);font-weight:700}
button:disabled{opacity:.35;cursor:not-allowed;filter:grayscale(1)}
button:not(:disabled):active{filter:brightness(1.3)}
nav{display:flex;justify-content:space-between;gap:var(--sp3)}
#count{font-size:24px;text-align:center;margin:var(--sp2);font-weight:700}
.changed{outline:4px solid var(--success)}
#pair{position:fixed;inset:0;background:var(--bg);z-index:10;display:none;flex-direction:column;justify-content:center;padding:var(--sp6,24px);gap:var(--sp3)}
#pair input{padding:var(--sp3);border-radius:var(--radius-sm);border:1px solid var(--outline);background:var(--surface-input);color:var(--on-surface);font-size:14px}
.small{min-height:44px;width:100%;font-size:16px;background:var(--surface);color:var(--on-surface)}
.hint{color:var(--on-surface-variant);font-size:13px;line-height:1.4}
</style></head>
<body>
<div id="connectionError" hidden role="alert" data-i18n="interactiveBusy">Já existe uma conexão interativa ativa.</div>
<main>
<header class="speaker-header"><h1 id="t" data-i18n="title">Tela de apoio</h1>
<section class="stopwatch" data-i18n-attr="aria-label:stopwatch" aria-label="Tempo de pregação">
<span class="stopwatch-label" data-i18n="stopwatch">Tempo de pregação</span>
<output id="stopwatchTime" role="timer" aria-live="off">00:00</output>
<div class="stopwatch-controls"><button id="stopwatchToggle" data-i18n="start">Iniciar</button><button id="stopwatchReset" data-i18n="reset">Zerar</button></div>
</section></header>
<div class="preview"><div id="supportIdle"><img src="logo-louvor-ja.svg" alt="Louvor JA"><span data-i18n="waiting">Aguardando transmissão</span></div><div id="biblePreview" class="bible-preview" hidden><div id="bibleText"></div><div id="bibleReference"></div></div><img id="currentImage" hidden data-i18n-attr="alt:previewTitle" alt="Preview da projeção"><iframe id="frame" data-i18n-attr="title:previewTitle" title="Preview da projeção" style="display:none"></iframe><div id="msg" data-i18n="connecting">Conectando preview…</div></div>
<footer>
<div class="neighbors">
<figure class="neighbor"><figcaption data-i18n="previousSlide">Anterior</figcaption><div class="thumbnail"><span data-i18n="unavailable">Sem slide</span><img id="previousImage" hidden data-i18n-attr="alt:previousSlide" alt="Anterior"></div></figure>
<figure class="neighbor"><figcaption data-i18n="nextSlide">Próximo</figcaption><div class="thumbnail"><span data-i18n="unavailable">Sem slide</span><img id="nextImage" hidden data-i18n-attr="alt:nextSlide" alt="Próximo"></div></figure>
</div>
<div id="conn" style="font-size:13px;text-align:center;margin-bottom:6px;color:var(--on-surface-variant)"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--on-surface-variant);margin-right:6px"></span><span data-i18n="connecting">Conectando preview…</span></div>
<div id="count">—/—</div>
<nav><button id="prev" disabled data-i18n-attr="aria-label:back" aria-label="Voltar">◀</button><button id="next" disabled data-i18n-attr="aria-label:next" aria-label="Avançar">▶</button></nav>
<button id="repair" class="small" style="margin-top:var(--sp3)" data-i18n-attr="aria-label:repair" aria-label="Reemparelhar" data-i18n="repair">Reemparelhar</button>
</footer>
</main>
<div id="pair"><p class="hint" data-i18n="pairHint">Pareamento perdido. Cole abaixo o link do QR exibido no app do desktop (começa com http://…/speaker?token=…):</p>
<input id="pairUrl" placeholder="http://192.168.x.x:47080/speaker?remotePort=${DEFAULT_REMOTE_PORT}&token=abcd1234">
<button id="pairGo" class="small" data-i18n="connect">Conectar</button><button id="pairCancel" class="small" data-i18n="cancel">Cancelar</button></div>
<script>
const I18N=${dictJson};
const q=new URLSearchParams(location.search);
const readOnly=q.get('mode')==='view';
if(readOnly){document.querySelector('nav').hidden=true;document.querySelector('.stopwatch').hidden=true;document.getElementById('repair').hidden=true}
// Idioma: ?lang= > navigator.language do celular > pt-BR (resolveAppLocale-equiv).
function pickLang(){const sup=['pt-BR','en','es'];const p=v=>{if(!v)return'';const l=sup.find(s=>s.toLowerCase()===v.toLowerCase());if(l)return l;const pre=v.split('-')[0].toLowerCase();return sup.find(s=>s.split('-')[0].toLowerCase()===pre)||''};
  return p(q.get('lang'))||p(navigator.language)||'pt-BR'}
const lang=pickLang(),T=I18N[lang]||I18N['pt-BR'];
document.documentElement.lang=lang;
document.title=T.title+' · LouvorJA';
document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=T[el.dataset.i18n]});
document.querySelectorAll('[data-i18n-attr]').forEach(el=>{const[k,key]=el.dataset.i18nAttr.split(':');el.setAttribute(k,T[key])});
// Relógio absoluto: não perde tempo quando o navegador suspende os intervalos.
let stopwatch={elapsed:0,startedAt:null};
try{const saved=JSON.parse(localStorage.getItem('speaker.stopwatch'));
  if(saved&&Number.isFinite(saved.elapsed)&&saved.elapsed>=0&&(saved.startedAt===null||(Number.isFinite(saved.startedAt)&&saved.startedAt>=0)))stopwatch=saved;
}catch{}
function stopwatchElapsed(){return stopwatch.elapsed+(stopwatch.startedAt===null?0:Math.max(0,Date.now()-stopwatch.startedAt))}
function saveStopwatch(){try{localStorage.setItem('speaker.stopwatch',JSON.stringify(stopwatch))}catch{}}
function renderStopwatch(){const seconds=Math.floor(stopwatchElapsed()/1000),hours=Math.floor(seconds/3600),pad=n=>String(n).padStart(2,'0');
  document.getElementById('stopwatchTime').textContent=(hours?pad(hours)+':':'')+pad(Math.floor(seconds/60)%60)+':'+pad(seconds%60);
  document.getElementById('stopwatchToggle').textContent=stopwatch.startedAt!==null?T.pause:stopwatch.elapsed?T.resume:T.start;
}
document.getElementById('stopwatchToggle').onclick=()=>{
  if(stopwatch.startedAt===null)stopwatch.startedAt=Date.now();else{stopwatch.elapsed=stopwatchElapsed();stopwatch.startedAt=null}
  saveStopwatch();renderStopwatch();
};
document.getElementById('stopwatchReset').onclick=()=>{stopwatch={elapsed:0,startedAt:null};saveStopwatch();renderStopwatch()};
setInterval(renderStopwatch,250);
document.addEventListener('visibilitychange',renderStopwatch);
renderStopwatch();
const storagePrefix=readOnly?'support.viewer.':'speaker.';
let token=q.get('token')||localStorage.getItem(storagePrefix+'token');
let remotePort=q.get('remotePort')||localStorage.getItem(storagePrefix+'remotePort')||'${DEFAULT_REMOTE_PORT}';
let palcoPort=q.get('palcoPort')||localStorage.getItem(storagePrefix+'palcoPort')||String((Number(location.port)||47080)+1);
// Token do palco (valor real injetado server-side abaixo) — o preview precisa
// dele para o WS do palco não fechar a conexão fora do localhost.
let palcoToken='${safeToken}';
if(token){localStorage.setItem(storagePrefix+'token',token);localStorage.setItem(storagePrefix+'remotePort',remotePort);localStorage.setItem(storagePrefix+'palcoPort',palcoPort)}
let connectionBlocked=false;
let preview,remote,queued=[],state={index:0,total:0,active:false},seq=0,lastSend=0;
const frame=document.querySelector('#frame'),msg=document.querySelector('#msg'),count=document.querySelector('#count');
function host(port,path){return 'ws://'+location.hostname+':'+port+path}
// Preview full-area: escala por LARGURA (16:9) e centra verticalmente no
// retângulo flexível; box cresce até o espaço disponível sem distorcer.
function fitFrame(){const box=frame.parentElement,s=Math.min(box.clientWidth/1280,box.clientHeight/720)||box.clientWidth/1280;
  frame.style.transform='scale('+s+')';frame.style.left=((box.clientWidth-1280*s)/2)+'px';frame.style.top=((box.clientHeight-720*s)/2)+'px'}
addEventListener('resize',fitFrame);
// Gestos de zoom (pinça/duplo-toque) travados — preview fixo, sem acidentes.
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('gesturechange',e=>e.preventDefault());
let lastTouch=0;
document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTouch<300)e.preventDefault();lastTouch=now},{passive:false});
let galleryKey='',gallery=[];
function render(){
  const idle=state.active===false;
  document.getElementById('supportIdle').hidden=!idle;
  const bible=state.kind==='bible';
  document.getElementById('prev').disabled=readOnly||state.canNavigate!==true;
  document.getElementById('next').disabled=readOnly||state.canNavigate!==true;
  document.querySelector('.neighbors').classList.toggle('bible-neighbors',bible||Array.isArray(state.lyrics));
  document.querySelector('.neighbors').classList.toggle('music-neighbors',!bible&&Array.isArray(state.lyrics));
  document.getElementById('biblePreview').hidden=!bible;
  document.getElementById('bibleText').textContent=bible?state.text||'':'';
  document.getElementById('bibleReference').textContent=bible?state.reference||'':'';
  count.textContent=(state.total?state.index+1:'—')+'/'+(state.total||'—');
  for(const [id,index] of [['currentImage',state.index],['previousImage',state.index-1],['nextImage',state.index+1]]){
    const img=document.getElementById(id),raw=index>=0&&index<state.total?(id==='currentImage'?(state.preview||gallery[index]):gallery[index]):null;
    const src=typeof raw==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(raw)?'data:image/jpeg;base64,'+raw:raw;
    const safe=typeof src==='string'&&/^data:image[/](png|jpeg|webp);base64,/.test(src);
    img.hidden=!safe;
    if(id==='currentImage'){frame.style.display=safe?'none':'';if(safe)msg.style.display='none'}
    else {
      const label=img.previousElementSibling,text=bible?(id==='previousImage'?state.previousText:state.nextText):(Array.isArray(state.lyrics)&&index>=0&&index<state.total?state.lyrics[index]:'');
      const reference=bible?(id==='previousImage'?state.previousReference:state.nextReference):'';
      label.replaceChildren();
      if(text&&reference){const ref=document.createElement('strong');ref.className='verse-reference';ref.textContent=reference;label.appendChild(ref)}
      label.appendChild(document.createTextNode(text||T.unavailable));label.hidden=!!safe;
    }
    if(safe)img.src=src;else img.removeAttribute('src');
  }
  if(idle)frame.style.display='none';
}
function updateSlide(slide,active){
  if(active===false)slide={index:0,total:0,canNavigate:false};
  if(!slide.galleryKey||slide.galleryKey!==galleryKey){gallery=[];galleryKey=slide.galleryKey||''}
  if(Array.isArray(slide.previews))gallery=slide.previews;
  state={...slide,active};render();
}
function setConn(online){if(!online){updateSlide({index:0,total:0},false)}const c=document.querySelector('#conn'),d=c.querySelector('.dot'),s=c.querySelector('[data-i18n]');d.style.background=online?'var(--success)':'var(--on-surface-variant)';s.textContent=online?({ptBR:'Conectado',en:'Connected',es:'Conectado'})[lang.replace('-','')]||'Conectado':T.connecting}
function pulse(){count.classList.add('changed');setTimeout(()=>count.classList.remove('changed'),350)}
// Preview: receiver.html real (mesmo renderizador da TV) apontando pro palco.
// palcoToken: WS do palco exige token fora do localhost — sem ele o receiver
// é fechado na conexão e o preview fica preso no splash (fix 13/10).
function openPreview(){try{preview&&preview.close()}catch{}
  frame.src='receiver.html?speakerPreview=1&host='+encodeURIComponent(location.hostname)+'&port='+palcoPort+(palcoToken?'&token='+encodeURIComponent(palcoToken):'');
  frame.style.display='';msg.style.display='none';fitFrame()}
function send(action){if(connectionBlocked||readOnly||(action.startsWith('slide:')&&state.canNavigate!==true))return;const now=Date.now();if(now-lastSend<250)return;lastSend=now;
  const m={v:1,type:'command',id:'s'+(++seq),action,token};
  if(remote&&remote.readyState===1)remote.send(JSON.stringify(m));else queued.push(m)}
function openRemote(){remote=new WebSocket(host(remotePort,''));
  remote.onopen=()=>{setConn(true);remote.send(JSON.stringify({v:1,type:'hello',role:'speaker',token}));queued.splice(0).forEach(m=>remote.send(JSON.stringify(m)))};
  remote.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='error'&&(m.code==='remote_busy'||m.code==='speaker_disconnected')){connectionBlocked=true;queued=[];setConn(false);document.getElementById('connectionError').textContent=m.code==='speaker_disconnected'?T.disconnected:T.interactiveBusy;document.getElementById('connectionError').hidden=false;frame.src='about:blank';return}if(connectionBlocked)return;if(m.type==='state'&&m.slide){const old=state.index;updateSlide(m.slide,m.supportActive);if(old!==state.index)pulse()}}catch{}};
  remote.onclose=()=>{setConn(false);if(!connectionBlocked)setTimeout(openRemote,800)}}
document.querySelector('#prev').onclick=()=>send('slide:prev');
document.querySelector('#next').onclick=()=>send('slide:next');
// Reemparelhar: limpa pareamento e abre overlay pra colar o link do QR de novo.
const pair=document.querySelector('#pair');
document.querySelector('#repair').onclick=()=>{localStorage.removeItem(storagePrefix+'token');localStorage.removeItem(storagePrefix+'remotePort');localStorage.removeItem(storagePrefix+'palcoPort');pair.style.display='flex'};
document.querySelector('#pairCancel').onclick=()=>{pair.style.display='none';location.reload()};
document.querySelector('#pairGo').onclick=()=>{const u=new URL(document.querySelector('#pairUrl').value.trim());location.href=u.toString()};
// Wake Lock: tela acesa durante o culto; re-adquire ao voltar pro foreground.
async function lock(){try{await navigator.wakeLock&&navigator.wakeLock.request('screen')}catch{}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)lock()});
if(token){lock();openPreview();openRemote()}
else{pair.style.display='flex';msg.textContent=T.noPairing}
render();
</script></body></html>`
}