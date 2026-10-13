/**
 * Servidor do PALCO (cast para TV) — multi-slot (paridade PalcoOrchestrator APK).
 *
 * APK PalcoOrchestrator: cada slot = par de portas HTTP/WS próprio:
 *   slot 0 (principal): 7080/7081 — compatível com receivers atuais
 *   slot 1: 7082/7083
 *   slot 2: 7084/7085 ...
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
 * Receiver conecta em `ws://ip:7081+2N/palco?port=7081+2N` (query port opcional)
 */

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

const BASE_HTTP_PORT = 7080
const BASE_WS_PORT = 7081
const MAX_SLOTS = 8 // slot 0-7

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')

/** @typedef {import('node:http').IncomingMessage} Req */
/** @typedef {import('node:http').ServerResponse} Res */

function lanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

/** Estado de um slot de palco. */
class PalcoSlot {
  #id
  #label
  #httpPort
  #wsPort
  #httpServer
  #wss
  #clients = new Set()
  #receiverIps = new Map() // WebSocket -> IP físico da TV/browser
  #lastByType = new Map() // replay pro receiver que chega tarde
  #running = false
  #media = new Map() // mídia local servida em /media/
  #contents // callback pro renderer

  constructor(id, label, httpPort, wsPort, getContents) {
    this.#id = id
    this.#label = label
    this.#httpPort = httpPort
    this.#wsPort = wsPort
    this.#contents = getContents
  }

  get id() { return this.#id }
  get label() { return this.#label }
  get httpPort() { return this.#httpPort }
  get wsPort() { return this.#wsPort }
  get running() { return this.#running }
  get clientsCount() { return this.#clients.size }

  /** Broadcast p/ todos os receivers conectados neste slot. */
  broadcast(obj) {
    // idle = fim da projeção: o cache de replay da projection morre junto,
    // senão quem reconecta recebe versículo velho por cima do idle
    // (bíblia fantasma ao recarregar a TV — bug real 27/08).
    if (obj.type === 'idle') this.#lastByType.delete('projection')
    this.#lastByType.set(obj.type, obj)
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

  /** Inicia HTTP + WS deste slot. */
  async start() {
    if (this.#running) return true
    try {
      this.#httpServer = createServer((req, res) => { void this.handleHttp(req, res) })
      await new Promise((resolve, reject) => {
        this.#httpServer.once('error', reject)
        this.#httpServer.listen(this.#httpPort, '0.0.0.0', resolve)
      })

      this.#wss = new WebSocketServer({ port: this.#wsPort })
      this.#wss.on('connection', (ws, req) => {
        if (req?.url && !req.url.split('?')[0].startsWith('/palco')) { ws.close(); return }
        // OBS S1: token na LAN (localhost bypass) — feature off = comportamento atual
        if (
          !requestHasPalcoAccess({
            remoteAddress: req?.socket?.remoteAddress,
            url: req?.url,
            headers: req?.headers,
            expectedToken: getPalcoToken(),
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
          try { this.#contents()?.send('palco:event', JSON.parse(String(raw))) } catch { /* ignore */ }
        })
        ws.on('close', () => {
          this.#clients.delete(ws)
          this.#receiverIps.delete(ws)
          this.#contents()?.send('palco:receiver-disconnected', { count: this.#clients.size, slotId: this.#id })
        })
        ws.on('error', () => this.#clients.delete(ws))
        // SEM ping (webOS 4.x não responde)
      })

      this.#running = true
      return true
    } catch (e) {
      console.error(`[palco:slot:${this.#id}] start error:`, e)
      return false
    }
  }

  /** Para este slot. */
  async stop() {
    if (!this.#running) return
    this.#running = false
    this.#wss?.close()
    await new Promise((r) => this.#httpServer?.close(r))
    this.#clients.clear()
    this.#lastByType.clear()
    this.#media.clear()
    this.#wss = null
    this.#httpServer = null
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
    // OBS S1: URL de mídia sai COM o token (a TV/browser recebe a URL já
    // autenticada — o renderer não precisa saber do token).
    const token = getPalcoToken()
    if (token && typeof m.url === 'string' && m.url.includes('/media/')) {
      try {
        const u = new URL(m.url)
        u.searchParams.set('token', token)
        m = { ...m, url: u.toString() }
      } catch { /* url malformada — segue como veio */ }
    }
    // Mesmo gate para o BG/cover da projection: <img> não manda header, e
    // localhost bypass escondia o 403 — browser/OBS/TV buscavam
    // http://<lan>:7080/media/... sem token → 403 → onerror → fallback FIXO.
    const bgUrl = m.type === 'projection' ? (m.background ?? m.cover) : undefined
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
    const transient =
      m.action === 'pause' || m.action === 'play' || m.action === 'seek'
    if (transient) this.broadcastTransient(m)
    else this.broadcast(m)
    return true
  }

  /** Status deste slot. */
  status() {
    return {
      id: this.#id,
      label: this.#label,
      running: this.#running,
      clients: this.#clients.size,
      receiverIps: Array.from(new Set(this.#receiverIps.values())),
      url: `http://${lanIp()}:${this.#httpPort}`,
      wsUrl: `ws://${lanIp()}:${this.#wsPort}/palco`,
      // OBS S1: receiver URL pronta com token (UI copia/cola no OBS Browser Source)
      receiverUrl: this.#running
        ? `http://${lanIp()}:${this.#httpPort}/?token=${getPalcoToken()}`
        : null,
    }
  }

  /** Handler HTTP unificado (serve receiver, /status, /bg/, /proxy, /media/). */
  async handleHttp(req, res) {
    const url = new URL(req.url ?? '/', 'http://x')
    const p = url.pathname

    // Scan do receiver: identifica sender na sub-rede
    if (p === '/status') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ unlocked: true, clients: this.#clients.size, slotId: this.#id, label: this.#label }))
      return
    }

    // Controle do pregador: página LAN sem CDN, preview passivo + remote WS.
    // Preview = iframe escalado do PRÓPRIO receiver.html — mesmo renderizador
    // da TV (bg, letra, caixinha, footer), zero divergência visual.
    if (p === '/speaker') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(speakerPageHtml())
      return
    }

    // Receiver embutido (mesma página do palco-receiver)
    if (p === '/' || p === '/receiver.html' || p === '/index.html') {
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
      try {
        const file = path.join(__dirname, 'palco', String(assetMatch[1]))
        const buf = await readFile(file)
        const ext = path.extname(file).toLowerCase()
        res.setHeader('Content-Type', ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'application/octet-stream')
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
          expectedToken: getPalcoToken(),
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
          expectedToken: getPalcoToken(),
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
    this.ensureSlot('0', 'Principal', BASE_HTTP_PORT, BASE_WS_PORT)
    // Operador configura TV 2/porta 7082 uma vez; slots voltam após restart.
    for (const item of readPersistedSlots()) {
      const httpPort = Number(item?.httpPort)
      const wsPort = Number(item?.wsPort)
      const id = String(item?.id ?? '')
      const label = String(item?.label ?? '').trim()
      if (
        id !== '0' && label && Number.isInteger(httpPort) &&
        Number.isInteger(wsPort) && httpPort >= BASE_HTTP_PORT + 2 &&
        wsPort === httpPort + 1 && this.#slots.size < MAX_SLOTS
      ) this.ensureSlot(id, label, httpPort, wsPort)
    }
  }

  persistSlots() {
    try {
      const rows = Array.from(this.#slots.values())
        .filter((slot) => slot.id !== '0')
        .map((slot) => ({ id: slot.id, label: slot.label, httpPort: slot.httpPort, wsPort: slot.wsPort }))
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
  ensureSlot(id, label, httpPort, wsPort) {
    if (this.#slots.has(id)) return this.#slots.get(id)
    const slot = new PalcoSlot(id, label, httpPort, wsPort, () => this.#getContents())
    this.#slots.set(id, slot)
    return slot
  }

  /** Cria novo slot (aloca próximo par de portas livre). */
  createSlot(label = `TV ${this.#slots.size}`) {
    if (this.#slots.size >= MAX_SLOTS) throw new Error('max slots')
    let httpPort = BASE_HTTP_PORT + 2, wsPort = BASE_WS_PORT + 2
    while (this.#slots.has(String(httpPort))) { httpPort += 2; wsPort += 2 }
    const id = String(httpPort) // id = porta HTTP (ex: "7082")
    const slot = this.ensureSlot(id, label, httpPort, wsPort)
    this.persistSlots()
    return slot
  }

  /** Remove slot (exceto principal). */
  removeSlot(id) {
    if (id === '0') return false
    const slot = this.#slots.get(id)
    if (!slot) return false
    slot.stop()
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
  if (!manager) manager = new PalcoManager(getContents)
  manager.init()

  // OBS S1: token de acesso carregado/criado 1x no boot (persistido no userData)
  enablePalcoToken()

  // IPC: token (UI mostra URL pronta p/ OBS + reset)
  ipcMain.handle('palco:token', () => ({ token: getPalcoToken(), path: palcoTokenPath() }))
  ipcMain.handle('palco:token-reset', () => {
    const token = resetPalcoToken()
    // receivers conectados com o token velho caem na reconexão — ok
    return { token }
  })

  // IPC: lista slots
  ipcMain.handle('palco:slots', () =>
    manager.getAllSlots().map(s => ({ id: s.id, label: s.label, running: s.running, clients: s.clientsCount, httpPort: s.httpPort, wsPort: s.wsPort }))
  )

  // IPC: cria slot
  ipcMain.handle('palco:slot-create', (_e, { label }) => {
    const slot = manager.createSlot(label)
    return { id: slot.id, label: slot.label, httpPort: slot.httpPort, wsPort: slot.wsPort }
  })

  // IPC: remove slot
  ipcMain.handle('palco:slot-remove', (_e, { id }) => manager.removeSlot(id))

  // IPC: status (default slot 0)
  ipcMain.handle('palco:status', (_e, { slotId }) => {
    const slot = manager.getSlot(slotId ?? '0')
    return slot ? slot.status() : null
  })

  // IPC: start/stop (default slot 0)
  ipcMain.handle('palco:start', (_e, { slotId }) => manager.getSlot(slotId ?? '0')?.start() ?? false)
  ipcMain.handle('palco:stop', (_e, { slotId }) => { manager.getSlot(slotId ?? '0')?.stop(); return true })

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
  primary: '#2196f3', // colors.primary
  onPrimary: '#003258', // colors.dark.onPrimary
  outline: 'rgba(255,255,255,0.10)', // colors.dark.outlineStrong
  success: '#64d99b',
  radiusSm: '8px 0 8px 0', // radius.sm
  radiusMd: '12px 0 12px 0', // radius.md
  spacing1: '4px', spacing2: '8px', spacing3: '12px', spacing4: '16px',
}

/** Dicionário i18n da página do pregador — TODO texto visível passa por aqui. */
export const SPEAKER_I18N = {
  'pt-BR': {
    title: 'Pregador', connecting: 'Conectando preview…', noPairing: 'Sem pareamento — cole o link do QR',
    pairHint: 'Pareamento perdido. Cole abaixo o link do QR exibido no app do desktop (começa com http://…/speaker?token=…):',
    connect: 'Conectar', cancel: 'Cancelar', repair: 'Reemparelhar',
    back: 'Voltar', next: 'Avançar', previewTitle: 'Preview da projeção',
  },
  en: {
    title: 'Speaker', connecting: 'Connecting preview…', noPairing: 'Not paired — paste the QR link',
    pairHint: 'Pairing lost. Paste below the QR link shown in the desktop app (starts with http://…/speaker?token=…):',
    connect: 'Connect', cancel: 'Cancel', repair: 'Re-pair',
    back: 'Back', next: 'Next', previewTitle: 'Projection preview',
  },
  es: {
    title: 'Predicador', connecting: 'Conectando vista previa…', noPairing: 'Sin emparejar — pega el enlace del QR',
    pairHint: 'Emparejamiento perdido. Pega abajo el enlace del QR mostrado en la app de escritorio (empieza con http://…/speaker?token=…):',
    connect: 'Conectar', cancel: 'Cancelar', repair: 'Reemparejar',
    back: 'Atrás', next: 'Adelante', previewTitle: 'Vista previa de proyección',
  },
}

/**
 * HTML da página /speaker. `lang` força idioma (teste); no navegador decide
 * ?lang= > navigator.language > pt-BR.
 */
export function speakerPageHtml() {
  const t = SPEAKER_TOKENS
  const dictJson = JSON.stringify(SPEAKER_I18N)
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pregador · LouvorJA</title>
<style>
:root{--bg:${t.bg};--surface:${t.surface};--surface-input:${t.surfaceInput};--on-surface:${t.onSurface};--on-surface-variant:${t.onSurfaceVariant};--primary:${t.primary};--on-primary:${t.onPrimary};--outline:${t.outline};--success:${t.success};--radius-sm:${t.radiusSm};--radius-md:${t.radiusMd};--sp1:${t.spacing1};--sp2:${t.spacing2};--sp3:${t.spacing3};--sp4:${t.spacing4}}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--on-surface);font:16px system-ui;display:flex;flex-direction:column;min-height:100dvh}
main{flex:1;display:flex;flex-direction:column;padding:var(--sp3) var(--sp3) var(--sp2);max-width:480px;width:100%;margin:auto;min-height:0;box-sizing:border-box}
h1{font-size:20px;margin:0 0 var(--sp2)}
.preview{flex:1;min-height:0;background:#000;border:1px solid var(--outline);border-radius:var(--radius-sm);overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center}
.preview iframe{width:1280px;height:720px;border:0;transform-origin:0 0;position:absolute;top:0;left:0;background:#000}
#msg{position:absolute;inset:0;display:grid;place-items:center;color:var(--on-surface-variant);font-size:14px;padding:var(--sp2);text-align:center}
footer{margin-top:var(--sp2)}
button{min-height:64px;width:48%;font-size:28px;border-radius:var(--radius-md);border:0;background:var(--primary);color:var(--on-primary);font-weight:700}
button:active{filter:brightness(1.3)}
nav{display:flex;justify-content:space-between;gap:var(--sp3)}
#count{font-size:24px;text-align:center;margin:var(--sp2);font-weight:700}
.changed{outline:4px solid var(--success)}
#pair{position:fixed;inset:0;background:var(--bg);z-index:10;display:none;flex-direction:column;justify-content:center;padding:var(--sp6,24px);gap:var(--sp3)}
#pair input{padding:var(--sp3);border-radius:var(--radius-sm);border:1px solid var(--outline);background:var(--surface-input);color:var(--on-surface);font-size:14px}
.small{min-height:44px;width:100%;font-size:16px;background:var(--surface)}
.hint{color:var(--on-surface-variant);font-size:13px;line-height:1.4}
</style></head>
<body>
<main>
<h1 id="t" data-i18n="title">Pregador</h1>
<div class="preview"><iframe id="frame" data-i18n-attr="title:previewTitle" title="Preview da projeção" style="display:none"></iframe><div id="msg" data-i18n="connecting">Conectando preview…</div></div>
<footer>
<div id="count">—/—</div>
<nav><button id="prev" data-i18n-attr="aria-label:back" aria-label="Voltar">◀</button><button id="next" data-i18n-attr="aria-label:next" aria-label="Avançar">▶</button></nav>
<button id="repair" class="small" style="margin-top:var(--sp3)" data-i18n-attr="aria-label:repair" aria-label="Reemparelhar" data-i18n="repair">Reemparelhar</button>
</footer>
</main>
<div id="pair"><p class="hint" data-i18n="pairHint">Pareamento perdido. Cole abaixo o link do QR exibido no app do desktop (começa com http://…/speaker?token=…):</p>
<input id="pairUrl" placeholder="http://192.168.x.x:7080/speaker?remotePort=7071&token=abcd1234">
<button id="pairGo" class="small" data-i18n="connect">Conectar</button><button id="pairCancel" class="small" data-i18n="cancel">Cancelar</button></div>
<script>
const I18N=${dictJson};
const q=new URLSearchParams(location.search);
// Idioma: ?lang= > navigator.language do celular > pt-BR (resolveAppLocale-equiv).
function pickLang(){const sup=['pt-BR','en','es'];const p=v=>{if(!v)return'';const l=sup.find(s=>s.toLowerCase()===v.toLowerCase());if(l)return l;const pre=v.split('-')[0].toLowerCase();return sup.find(s=>s.split('-')[0].toLowerCase()===pre)||''};
  return p(q.get('lang'))||p(navigator.language)||'pt-BR'}
const lang=pickLang(),T=I18N[lang]||I18N['pt-BR'];
document.documentElement.lang=lang;
document.title=T.title+' · LouvorJA';
document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=T[el.dataset.i18n]});
document.querySelectorAll('[data-i18n-attr]').forEach(el=>{const[k,key]=el.dataset.i18nAttr.split(':');el.setAttribute(k,T[key])});
let token=q.get('token')||localStorage.getItem('speaker.token');
let remotePort=q.get('remotePort')||localStorage.getItem('speaker.remotePort')||'7071';
let palcoPort=q.get('palcoPort')||localStorage.getItem('speaker.palcoPort')||'7081';
if(token){localStorage.setItem('speaker.token',token);localStorage.setItem('speaker.remotePort',remotePort);localStorage.setItem('speaker.palcoPort',palcoPort)}
let preview,remote,queued=[],state={index:0,total:0},seq=0,lastSend=0;
const frame=document.querySelector('#frame'),msg=document.querySelector('#msg'),count=document.querySelector('#count');
function host(port,path){return 'ws://'+location.hostname+':'+port+path}
// Preview full-area: escala por LARGURA (16:9) e centra verticalmente no
// retângulo flexível; box cresce até o espaço disponível sem distorcer.
function fitFrame(){const box=frame.parentElement,s=Math.min(box.clientWidth/1280,box.clientHeight/720)||box.clientWidth/1280;
  frame.style.transform='scale('+s+')';frame.style.left=((box.clientWidth-1280*s)/2)+'px';frame.style.top=((box.clientHeight-720*s)/2)+'px'}
addEventListener('resize',fitFrame);
function render(){count.textContent=(state.total?state.index+1:'—')+'/'+(state.total||'—')}
function pulse(){count.classList.add('changed');setTimeout(()=>count.classList.remove('changed'),350)}
// Preview: receiver.html real (mesmo renderizador da TV) apontando pro palco.
function openPreview(){try{preview&&preview.close()}catch{}
  frame.src='receiver.html?host='+encodeURIComponent(location.hostname)+'&port='+palcoPort;
  frame.style.display='';msg.style.display='none';fitFrame()}
function send(action){const now=Date.now();if(now-lastSend<250)return;lastSend=now;
  const m={v:1,type:'command',id:'s'+(++seq),action,token};
  if(remote&&remote.readyState===1)remote.send(JSON.stringify(m));else queued.push(m)}
function openRemote(){remote=new WebSocket(host(remotePort,''));
  remote.onopen=()=>{remote.send(JSON.stringify({v:1,type:'hello',role:'speaker',token}));queued.splice(0).forEach(m=>remote.send(JSON.stringify(m)))};
  remote.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='state'&&m.slide){const old=state.index;state=m.slide;render();if(old!==state.index)pulse()}}catch{}};
  remote.onclose=()=>setTimeout(openRemote,800)}
document.querySelector('#prev').onclick=()=>send('slide:prev');
document.querySelector('#next').onclick=()=>send('slide:next');
// Reemparelhar: limpa pareamento e abre overlay pra colar o link do QR de novo.
const pair=document.querySelector('#pair');
document.querySelector('#repair').onclick=()=>{localStorage.removeItem('speaker.token');localStorage.removeItem('speaker.remotePort');localStorage.removeItem('speaker.palcoPort');pair.style.display='flex'};
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