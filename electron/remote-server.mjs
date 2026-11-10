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
 * O APK conecta aqui (porta 48080) e comanda a LITURGIA (prioridade:
 * múltiplos monitores + projetor cabeado) e o player.
 *
 * Ações de liturgia executam no renderer (store Pinia) via
 * webContents.send('remote:command', ...) — o handler vive em
 * src/modules/remote/renderer/liturgy-bridge.ts.
 */

import path from 'node:path'
import { createRemoteToken, loadOrCreateRemoteTokens, saveRemoteTokens } from './remote-tokens.mjs'
import { DEFAULT_REMOTE_PORT, REMOTE_PORT_ATTEMPTS } from './remote-config.mjs'
import { networkInterfaces } from 'node:os'

import QRCode from 'qrcode'
import { app, ipcMain } from 'electron'
import { trackWsConnection, trackWsDisconnect } from './diagnostics.mjs'
import { DEFAULT_HTTP_PORT } from './palco/transmission-config.mjs'

const PORT = DEFAULT_REMOTE_PORT
const HEARTBEAT_MS = 15_000
const HEARTBEAT_TIMEOUT_MS = 10_000

/**
 * Escopo do pregador (/speaker): SOMENTE navegação de slides. Qualquer outra
 * ação vinda de um cliente speaker → `forbidden` sem tocar o renderer.
 * Fonte única da regra (ver __tests__/speaker-scope.test.mjs).
 */
export const SPEAKER_ALLOWED = new Set(['slide:prev', 'slide:next', 'slide:goto'])

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

/**
 * @param {any} wss WebSocketServer (ou fake)
 * @param {any} contents BrowserWindow.webContents (ou fake)
 * @param {{ token?: string, speakerToken?: string, palcoHttpPort?: () => number, captureVideoFrame?: () => Promise<string | null>, frameIntervalMs?: number, saveTokens?: (tokens: {token: string, speakerToken: string}) => void | Promise<void> }} [opts] tokens fixos p/ testes (default: random); porta HTTP atual da Fonte 1 do palco; captura do quadro do vídeo para a prévia do celular
 */
export async function startRemoteServer(wss, contents, opts = {}) {
  let token = opts.token ?? createRemoteToken()
  // Token próprio do pregador: a URL/QR do pregador nunca leva o token
  // completo, e o escopo é decidido pelo token, não pelo que o cliente declara.
  let speakerToken = opts.speakerToken ?? createRemoteToken([token])
  while (speakerToken === token) {
    speakerToken = createRemoteToken([token])
  }
  /** @type {Map<import('ws').WebSocket, {aliveAt: number, authed: boolean, timer: NodeJS.Timeout}>} */
  const clients = new Map()

  const send = (ws, obj) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj))
    }
  }

  // Identidade POR PAPEL: APK/controle remoto (esquerda) vs pregador (direita).
  const identityFor = (speaker) => {
    for (const [ws, entry] of clients) {
      if (!!entry.speaker !== speaker) continue
      const address =
        ws._socket?.remoteAddress?.replace(/^::ffff:/, '') ?? null
      if (entry.device && address) return `${entry.device} • ${address}`
      return entry.device ?? address ?? null
    }
    return null
  }
  const clientIdentity = () => identityFor(false) ?? identityFor(true)

  const notifyClients = () => {
    try {
      if (!contents.isDestroyed()) {
        contents.send('remote:clients', {
          count: clients.size,
          address: clientIdentity(),
          // Papéis separados — o painel mostra cada um no seu lugar:
          // remote = APK/controle (esquerda), speaker = pregador (direita).
          remoteAddress: identityFor(false),
          speakerAddress: identityFor(true),
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
    trackWsConnection()
    // Máx. 2 conexões FÍSICAS: 1 operador (APK/full) + 1 pregador (slides).
    // O papel só é revelado no hello — o limite POR PAPEL é aplicado lá.
    // (13/10 Rafael: antes era 1 cliente TOTAL — pregador tomava remote_busy
    // do APK e vice-versa, impossibilitando os dois conectados ao mesmo tempo.)
    if (clients.size >= 2) {
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
          if (msg.token != null && msg.token !== token && msg.token !== speakerToken) {
            send(ws, { v: 1, type: 'error', code: 'bad_token' })
            ws.close()
            return
          }
          // Browser do pregador só recebe navegação de slides.
          if (msg.role === 'speaker' && (msg.token === token || msg.token === speakerToken)) {
            // 1 pregador por desktop: 2º browser de pregador → busy.
            for (const [other, oEntry] of clients) {
              if (other === ws || !oEntry.speaker) continue
              send(ws, { v: 1, type: 'error', code: 'remote_busy' })
              clients.delete(ws)
              clearInterval(entry.timer)
              ws.close()
              return
            }
            const was = entry.speaker
            entry.speaker = true
            // 1º hello do pregador (e mudanças de papel) precisam notificar —
            // senão o painel direito fica no "Pronto" sem IP (13/10 Rafael).
            if (!was) notifyClients()
          } else if (msg.device && msg.token === token) {
            // 1 operador (APK/full) por desktop: 2º APK → busy.
            // Papel operador = tem device e NÃO declarou speaker no hello.
            for (const [other, oEntry] of clients) {
              if (other === ws || oEntry.speaker) continue
              send(ws, { v: 1, type: 'error', code: 'remote_busy' })
              clients.delete(ws)
              clearInterval(entry.timer)
              ws.close()
              return
            }
            // Operador validado pelo token: recebe a prévia do vídeo.
            entry.operator = true
            send(ws, { v: 1, type: 'ack', id: 'remote-auth', ok: true })
          }
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
          if (tok !== token && tok !== speakerToken) {
            send(ws, { v: 1, type: 'error', id, code: 'bad_token' })
            ws.close()
            return
          }
          // Quem usa o token do pregador fica no escopo speaker nesta conexão.
          if (tok === speakerToken) entry.speaker = true
          entry.authed = true
          // O APK manda o token só nos comandos (o hello dele não leva token):
          // é aqui que o operador fica provado e passa a receber a prévia do vídeo.
          if (tok === token && !entry.speaker) entry.operator = true
          if (entry.speaker && !SPEAKER_ALLOWED.has(action)) {
            send(ws, { v: 1, type: 'error', id, code: 'forbidden' })
            return
          }
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
            speaker: entry.speaker === true,
            durationMs:
              typeof msg.durationMs === 'number' ? msg.durationMs : undefined,
            name: typeof msg.name === 'string' ? msg.name : undefined,
            // Destino da barra de vídeo (monitor:<id> ou tv:<slot>).
            targetId: typeof msg.targetId === 'string' ? msg.targetId : undefined,
            enabled: typeof msg.enabled === 'boolean' ? msg.enabled : undefined,
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
            // Endereço do navegador do celular (site.navigate).
            url: typeof msg.url === 'string' ? msg.url : undefined,
            // Proporção da rolagem do navegador do celular (site.scroll, 0..1).
            ratio: typeof msg.ratio === 'number' ? msg.ratio : undefined,
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

    ws.on('close', (code, reason) => {
      trackWsDisconnect(`${code}${reason?.length ? ` ${reason.toString().slice(0, 64)}` : ''}`)
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

  // Prévia do vídeo/YouTube: quadros num canal próprio, fora do estado (que
  // sai a cada segundo e não pode pesar). Só para o APK operador; captura
  // lenta não empilha e quadro repetido (vídeo pausado) não é reenviado.
  const captureVideoFrame = opts.captureVideoFrame
  let frameBusy = false
  let lastFrame = null
  const frameTimer = captureVideoFrame
    ? setInterval(async () => {
        if (frameBusy) return
        const operators = [...clients].filter(([, entry]) => entry.operator).map(([ws]) => ws)
        if (operators.length === 0) return
        frameBusy = true
        try {
          const data = await captureVideoFrame()
          // Sem quadro agora (reserva em intervalo, página carregando): mantém o último.
          if (data && data !== lastFrame) {
            lastFrame = data
            for (const ws of operators) send(ws, { v: 1, type: 'frame', data })
          }
        } catch {
          // janela do vídeo fechando no meio da captura
        } finally {
          frameBusy = false
        }
      }, opts.frameIntervalMs ?? 100)
    : null

  // Porta real em uso (pode ser fallback 48081-48084)
  const activePort = wss.address().port
  console.info(`[remote] servidor WS na porta ${activePort} — token ${token}`)
  // RF2 — publica status p/ getRemoteStatus()
  remoteStatus.status = activePort === PORT ? 'ok' : 'fallback'
  remoteStatus.port = activePort
  remoteStatus.token = token

  // Pairing: renderer pergunta host+token+QR (Configurações > Controle Remoto)
  const host = lanIp()
  let operator = { url: '', qr: '' }
  const palcoHttpPort = typeof opts.palcoHttpPort === 'function' ? opts.palcoHttpPort : () => DEFAULT_HTTP_PORT
  let speaker = { url: '', qr: '' }
  const speakerPairing = async () => {
    const httpPort = Number(palcoHttpPort()) || DEFAULT_HTTP_PORT
    const url = `http://${host}:${httpPort}/speaker?remotePort=${activePort}&palcoPort=${httpPort + 1}&token=${speakerToken}`
    if (url !== speaker.url) speaker = { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) }
    return speaker
  }
  await speakerPairing()
  const pairingInfo = async () => {
    const connectUrl = `louvorja://connect?host=${host}:${activePort}&token=${token}`
    if (operator.url !== connectUrl) operator = { url: connectUrl, qr: await QRCode.toDataURL(connectUrl, { margin: 1, width: 220 }) }
    return {
      host, port: activePort, token, connectUrl, qrDataUrl: operator.qr,
      speakerUrl: (await speakerPairing()).url, speakerQrDataUrl: speaker.qr,
      clientCount: clients.size, clientAddress: clientIdentity(),
      remoteAddress: identityFor(false), speakerAddress: identityFor(true),
    }
  }
  ipcMain.removeHandler?.('remote:pairing-info')
  ipcMain.removeHandler?.('remote:token-reset')
  ipcMain.handle('remote:pairing-info', pairingInfo)
  let rotations = Promise.resolve()
  const resetToken = async (role) => {
    if (role !== 'remote' && role !== 'speaker') throw new Error('Papel de controle remoto inválido')
    const next = createRemoteToken([token, speakerToken])
    const tokens = role === 'remote' ? { token: next, speakerToken } : { token, speakerToken: next }
    await opts.saveTokens?.(tokens)
    token = tokens.token
    speakerToken = tokens.speakerToken
    remoteStatus.token = token
    for (const [ws, entry] of clients) {
      if ((role === 'speaker') !== Boolean(entry.speaker)) continue
      clearInterval(entry.timer)
      clients.delete(ws)
      send(ws, { v: 1, type: 'error', id: 'server', code: 'bad_token' })
      ws.close()
    }
    notifyClients()
    return pairingInfo()
  }
  ipcMain.handle('remote:token-reset', (_event, role) => {
    const operation = rotations.then(() => resetToken(role))
    rotations = operation.catch(() => {})
    return operation
  })

  return {
    get token() { return token },
    stop() {
      // Fechamento normal: avisa o APK para ele sair do modo remoto já.
      for (const [ws, entry] of clients) {
        clearInterval(entry.timer)
        send(ws, { v: 1, type: 'error', id: 'server', code: 'desktop_closed' })
        ws.close()
      }
      clients.clear()
      if (frameTimer) clearInterval(frameTimer)
      ipcMain.removeListener('remote:ack', onAck)
      ipcMain.removeListener('remote:state', onState)
      ipcMain.removeHandler?.('remote:pairing-info')
      ipcMain.removeHandler?.('remote:token-reset')
      wss.close()
    },
  }
}

export const REMOTE_PORT = PORT

/** Conveniência para o main: sobe junto com o app em dev (devmode). */
export function attachRemoteServer(getContents, { palcoHttpPort } = {}) {
  let stopped = false
  const MAX_ATTEMPTS = REMOTE_PORT_ATTEMPTS
  const boot = async () => {
    if (stopped) return
    const tokenPath = path.join(app.getPath('userData'), 'remote-tokens.json')
    const tokens = loadOrCreateRemoteTokens(tokenPath)
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
      console.error(`[remote] nenhuma porta disponível (${PORT}..${PORT + MAX_ATTEMPTS - 1}) — controle remoto DESLIGADO. O app segue sem ele.`)
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
    }, {
      ...tokens,
      saveTokens: (tokens) => saveRemoteTokens(tokenPath, tokens),
      palcoHttpPort,
      captureVideoFrame: async () => {
        const { captureRemoteVideoFrame } = await import('./ipc/web-projection.mjs')
        return captureRemoteVideoFrame()
      },
    })
    app.on('quit', handle.stop)
  }
  boot().catch((err) => console.error('[remote] falhou:', err))
  return () => {
    stopped = true
  }
}
