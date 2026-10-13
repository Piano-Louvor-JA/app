/**
 * Servidor WS de Controle Remoto (main process do Electron).
 *
 * Protocolo "LouvorJA Remote v1" — mesmo do APK
 * (lib/core/services/remote/remote_protocol.dart):
 * - envelope JSON {v:1, type, ...}
 * - command/ack/state/error/ping/pong
 * - token de emparelhamento em todo comando (ou desconecta)
 * - estado COMPLETO, não delta
 *
 * O APK conecta aqui (porta 7071) e comanda a LITURGIA (prioridade:
 * múltiplos monitores + projetor cabeado) e o player.
 *
 * Ações de liturgia executam no renderer (store Pinia) via
 * webContents.send('remote:command', ...) — o handler vive em
 * src/modules/remote/renderer/liturgy-bridge.ts.
 */

import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'

import QRCode from 'qrcode'
import { app, ipcMain } from 'electron'

const PORT = 7071
const HEARTBEAT_MS = 15_000
const HEARTBEAT_TIMEOUT_MS = 10_000

/** @typedef {import('electron').WebContents} WebContents */

/**
 * @param {import('ws').WebSocketServer} wss
 * @param {WebContents} contents
 * @returns {{ token: string, stop: () => void }}
 */
function lanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

/**
 * RF2 (SPEC remote-diagnostics) — getter de status p/ o diagnóstico.
 * Module-scope: attachRemoteServer alimenta; startRemoteServer publica.
 */
const remoteStatus = { status: null, port: null, token: null }

export function getRemoteStatus() {
  return { ...remoteStatus }
}

export async function startRemoteServer(wss, contents) {
  const token = randomBytes(4).toString('hex').toUpperCase()

  /** @type {Map<import('ws').WebSocket, {aliveAt: number, authed: boolean, timer: NodeJS.Timeout}>} */
  const clients = new Map()

  const send = (ws, obj) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj))
    }
  }

  const clientIdentity = () => {
    const first = clients.keys().next().value
    if (!first) return null
    const entry = clients.get(first)
    const address = first._socket?.remoteAddress?.replace(/^::ffff:/, '') ?? null
    if (entry?.device && address) return `${entry.device} • ${address}`
    return entry?.device ?? address ?? null
  }

  const notifyClients = () => {
    try {
      if (!contents.isDestroyed()) {
        contents.send('remote:clients', {
          count: clients.size,
          address: clientIdentity(),
        })
      }
    } catch {
      // janela ainda não pronta
    }
  }

  const pushState = () => {
    // Renderer responde com estado completo; broadcast a todos os clientes.
    try {
      if (!contents.isDestroyed()) contents.send('remote:request-state')
    } catch {
      // janela ainda não pronta
    }
  }

  wss.on('connection', (ws) => {
    // Um operador por desktop: evita comandos concorrentes e ambiguidade UX.
    if (clients.size >= 1) {
      send(ws, { v: 1, type: 'error', code: 'remote_busy' })
      ws.close()
      return
    }

    const entry = {
      aliveAt: Date.now(),
      authed: false,
      device: null,
      timer: setInterval(() => {
        if (Date.now() - entry.aliveAt > HEARTBEAT_TIMEOUT_MS + HEARTBEAT_MS) {
          ws.terminate()
          return
        }
        send(ws, { v: 1, type: 'ping' })
      }, HEARTBEAT_MS),
    }
    clients.set(ws, entry)
    notifyClients()

    ws.on('message', async (raw) => {
      entry.aliveAt = Date.now()
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg?.v !== 1) return

      switch (msg.type) {
        case 'hello': {
          // APK identifica o aparelho logo após conectar.
          const device = typeof msg.device === 'string' ? msg.device : null
          const appVersion =
            typeof msg.appVersion === 'string' ? msg.appVersion : null
          if (device) {
            entry.device = appVersion ? `${device} (${appVersion})` : device
            notifyClients()
          }
          return
        }
        case 'ping':
          send(ws, { v: 1, type: 'pong' })
          return
        case 'pong':
          return
        case 'command': {
          const { id, action, token: tok } = msg
          console.info(
            `[remote] RAW command ${action} id=${id} payload=${JSON.stringify(msg).slice(0, 300)}`,
          )
          if (typeof id !== 'string' || typeof action !== 'string') return
          if (tok !== token) {
            send(ws, { v: 1, type: 'error', id, code: 'bad_token' })
            ws.close()
            return
          }
          entry.authed = true
          // Encaminha ao renderer; o ack volta via 'remote:ack'.
          // Campos v2 (bible/timer/countdown) além dos do v1.
          contents.send('remote:command', {
            id,
            action,
            value: typeof msg.value === 'number' ? msg.value : undefined,
            positionMs:
              typeof msg.positionMs === 'number' ? msg.positionMs : undefined,
            mode: typeof msg.mode === 'string' ? msg.mode : undefined,
            hymnId: typeof msg.hymnId === 'number' ? msg.hymnId : undefined,
            musicId: typeof msg.musicId === 'number' ? msg.musicId : undefined,
            query: typeof msg.query === 'string' ? msg.query : undefined,
            albumId:
              typeof msg.albumId === 'number' ? msg.albumId : undefined,
            versionId:
              typeof msg.versionId === 'number' ? msg.versionId : undefined,
            bookId: typeof msg.bookId === 'number' ? msg.bookId : undefined,
            chapter:
              typeof msg.chapter === 'number' ? msg.chapter : undefined,
            verse: typeof msg.verse === 'number' ? msg.verse : undefined,
            index: typeof msg.index === 'number' ? msg.index : undefined,
            durationMs:
              typeof msg.durationMs === 'number' ? msg.durationMs : undefined,
            name: typeof msg.name === 'string' ? msg.name : undefined,
            style: typeof msg.style === 'string' ? msg.style : undefined,
            showSeconds:
              typeof msg.showSeconds === 'boolean' ? msg.showSeconds : undefined,
            format24h:
              typeof msg.format24h === 'boolean' ? msg.format24h : undefined,
            numberMin:
              typeof msg.numberMin === 'number' ? msg.numberMin : undefined,
            numberMax:
              typeof msg.numberMax === 'number' ? msg.numberMax : undefined,
            namesText:
              typeof msg.namesText === 'string' ? msg.namesText : undefined,
            // Palco (cast TV): liga/desliga/projeta/idle
            text: typeof msg.text === 'string' ? msg.text : undefined,
            footerRef:
              typeof msg.footerRef === 'string' ? msg.footerRef : undefined,
            // Palco slots: criar/remover/ligar TVs remotamente
            slotId:
              typeof msg.slotId === 'string' ? msg.slotId : undefined,
            label:
              typeof msg.label === 'string' ? msg.label : undefined,
          })
          return
        }
        default:
          return
      }
    })

    ws.on('close', () => {
      clearInterval(entry.timer)
      clients.delete(ws)
      notifyClients()
    })
    ws.on('error', () => ws.terminate())

    // Estado inicial na conexão
    if (!contents.isDestroyed()) pushState()
  })

  // Renderer → APK: ack de comando e push de estado (ipcMain, global)
  const onAck = (_e, ack) => {
    for (const [ws] of clients) send(ws, { v: 1, type: 'ack', ...ack })
  }
  const onState = (_e, player) => {
    for (const [ws] of clients) {
      send(ws, { v: 1, type: 'state', ...(player ?? {}) })
    }
  }
  ipcMain.on('remote:ack', onAck)
  ipcMain.on('remote:state', onState)

  // Porta real em uso (pode ser fallback 7072-7075)
  const activePort = wss.address().port
  console.info(`[remote] servidor WS na porta ${activePort} — token ${token}`)
  // RF2 — publica status p/ getRemoteStatus()
  remoteStatus.status = activePort === PORT ? 'ok' : 'fallback'
  remoteStatus.port = activePort
  remoteStatus.token = token

  // Pairing: renderer pergunta host+token+QR (Configurações > Controle Remoto)
  const host = lanIp()
  const connectUrl = `louvorja://connect?host=${host}:${activePort}&token=${token}`
  const qrDataUrl = await QRCode.toDataURL(connectUrl, { margin: 1, width: 220 })
  ipcMain.handle('remote:pairing-info', () => ({
    host,
    port: activePort,
    token,
    connectUrl,
    qrDataUrl,
    clientCount: clients.size,
    clientAddress: clientIdentity(),
  }))

  return {
    token,
    stop() {
      // Fechamento normal: avisa o APK para ele sair do modo remoto já.
      for (const [ws, entry] of clients) {
        clearInterval(entry.timer)
        send(ws, { v: 1, type: 'error', id: 'server', code: 'desktop_closed' })
        ws.close()
      }
      clients.clear()
      ipcMain.removeListener('remote:ack', onAck)
      ipcMain.removeListener('remote:state', onState)
      wss.close()
    },
  }
}

export const REMOTE_PORT = PORT

/** Conveniência para o main: sobe junto com o app em dev (devmode). */
export function attachRemoteServer(getContents) {
  let stopped = false
  const MAX_ATTEMPTS = 5
  const boot = async () => {
    if (stopped) return
    const { WebSocketServer } = await import('ws')

    // Tentativa por porta: EACCES (Windows reserva faixas — Hyper-V/WSL,
    // bug real do José 30/08 que impedia o app de abrir) e EADDRINUSE
    // (outra instância do PIANO rodando) NÃO PODEM derrubar o app.
    //
    // ATENÇÃO: o listen() do 'ws' é ASSÍNCRONO — o construtor retorna antes
    // do bind e o erro chega como evento 'error' re-throwado (uncaughtException).
    // try/catch em volta do new NÃO pega (bug do fix 400475e, reproduzido
    // 30/08 à noite). Por isso o handler de erro vai no evento, via promessa.
    const tryListen = (port) =>
      new Promise((resolve, reject) => {
        const server = new WebSocketServer({ port })
        server.once('error', (err) => {
          try { server.close() } catch { /* já morto */ }
          reject(err)
        })
        server.once('listening', () => resolve(server))
      })

    let wss = null
    let activePort = PORT
    let lastError = null
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        wss = await tryListen(activePort)
        if (activePort !== PORT) {
          console.warn(`[remote] porta ${PORT} indisponível — usando ${activePort} (QR/IP mudam junto)`)
        }
        break
      } catch (err) {
        const code = err?.code ?? ''
        if (code !== 'EADDRINUSE' && code !== 'EACCES') throw err
        console.warn(`[remote] porta ${activePort} falhou (${code}) — tentando próxima`)
        lastError = code
        activePort = PORT + attempt + 1
      }
    }
    if (!wss) {
      console.error(`[remote] nenhuma porta disponível (${PORT}..${PORT + MAX_ATTEMPTS}) — controle remoto DESLIGADO. O app segue sem ele.`)
      // RF2 — publica desligado p/ diagnóstico
      remoteStatus.status = 'desligado'
      remoteStatus.port = null
      remoteStatus.erro = lastError
      return
    }

    const handle = await startRemoteServer(wss, {
      // proxy mínimo de WebContents usado pelo servidor
      send: (channel, ...args) => getContents()?.send(channel, ...args),
      isDestroyed: () => !getContents(),
    })
    app.on('quit', handle.stop)
  }
  boot().catch((err) => console.error('[remote] falhou:', err))
  return () => {
    stopped = true
  }
}
