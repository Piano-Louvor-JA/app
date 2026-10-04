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
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { app, ipcMain } from 'electron'
import { WebSocketServer } from 'ws'

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
        if (req?.url && !req.url.startsWith('/palco')) { ws.close(); return }
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
    const assetMatch = /^(?!\/(proxy|status|bg|media)(\/|$))\/([a-z0-9._-]+)$/i.exec(p)
    if (assetMatch) {
      try {
        const file = path.join(__dirname, 'palco', assetMatch[1])
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
      const name = `local_${Date.now()}_${base}`
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