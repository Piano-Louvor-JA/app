/**
 * Testes do escopo SPEAKER do Controle Remoto (página do pregador /speaker).
 *
 * O pregador emparelha no WS 7071 com `hello {role:'speaker', token}` e só
 * pode navegar slides. Qualquer outra ação do APK (play/pause/stop/eject…)
 * deve ser rejeitada com `error code='forbidden'` SEM encaminhar ao renderer.
 *
 * SPEAKER_ALLOWED é a fonte única da regra (consumida no handler de command).
 *
 * Nota: import dinâmico com caminho absoluto — o resolve relativo do vitest
 * para módulos em electron/ (fora do root de transform do app) é instável.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const ipcHandlers = new Map()
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/userData') },
  ipcMain: {
    handle: vi.fn((ch, fn) => ipcHandlers.set(ch, fn)),
    on: vi.fn(),
    removeListener: vi.fn(),
    removeHandler: vi.fn((ch) => ipcHandlers.delete(ch)),
  },
}))

const serverUrl = pathToFileURL(path.resolve(process.cwd(), 'electron/remote-server.mjs')).href
const { SPEAKER_ALLOWED, startRemoteServer } = await import(serverUrl)

const TOKEN = 'TESTTOKEN'
const SPEAKER_TOKEN = 'SPEAKERTK'

/** FakeWebSocket mínimo (superfície usada pelo servidor: readyState/OPEN/send/close/on). */
function fakeWs() {
  const sent = []
  const listeners = {}
  return {
    sent,
    listeners,
    readyState: 1,
    OPEN: 1,
    send: (data) => sent.push(JSON.parse(data)),
    close: vi.fn(),
    on: (ev, fn) => {
      if (ev === 'message') listeners.message = fn
      if (ev === 'close') listeners.close = fn
    },
    terminate: vi.fn(),
    _socket: { remoteAddress: '192.168.0.50' },
  }
}

function fakeWss() {
  const handlers = {}
  return {
    handlers,
    on: (ev, fn) => { handlers[ev] = fn },
    address: () => ({ port: 7071 }),
  }
}

function fakeContents() {
  const sent = []
  return {
    sent,
    isDestroyed: () => false,
    send: (channel, payload) => sent.push({ channel, payload }),
  }
}

/** Sobe um servidor com token fixo e conecta um cliente speaker. */
async function makeSpeakerServer() {
  const wss = fakeWss()
  const contents = fakeContents()
  await startRemoteServer(wss, contents, { token: TOKEN, speakerToken: SPEAKER_TOKEN })
  const connection = wss.handlers.connection
  expect(connection).toBeTruthy()
  const ws = fakeWs()
  connection(ws)
  const message = (msg) => ws.listeners.message(JSON.stringify(msg))
  // Handshake do pregador: hello marca o escopo speaker.
  message({ v: 1, type: 'hello', role: 'speaker', token: SPEAKER_TOKEN })
  return { ws, message, contents }
}

describe('escopo speaker — permissão mínima', () => {
  it('SPEAKER_ALLOWED contém somente navegação de slides', () => {
    expect([...SPEAKER_ALLOWED].sort()).toEqual(['slide:goto', 'slide:next', 'slide:prev'])
  })

  it('speaker autenticado: slide:* é encaminhado ao renderer', async () => {
    const { ws, message, contents } = await makeSpeakerServer()
    ws.sent.length = 0
    contents.sent.length = 0
    message({ v: 1, type: 'command', id: 'c1', action: 'slide:next', token: SPEAKER_TOKEN })
    const fwd = contents.sent.find((m) => m.channel === 'remote:command')
    expect(fwd?.payload?.action).toBe('slide:next')
    expect(ws.sent.find((m) => m.type === 'error')).toBeUndefined()
  })

  it('speaker autenticado: play/pause/stop/seek/eject → forbidden SEM tocar o renderer', async () => {
    const { ws, message, contents } = await makeSpeakerServer()
    ws.sent.length = 0
    contents.sent.length = 0
    const denied = [
      'player.play', 'player.pause', 'player.stop', 'player.seek',
      'player.setVolume', 'player.open', 'media.open', 'liturgy.next', 'bible.open',
    ]
    for (const [i, action] of denied.entries()) {
      message({ v: 1, type: 'command', id: `f${i}`, action, token: SPEAKER_TOKEN })
    }
    const errors = ws.sent.filter((m) => m.type === 'error')
    expect(errors).toHaveLength(denied.length)
    for (const e of errors) expect(e.code).toBe('forbidden')
    // Nada chegou ao renderer.
    expect(contents.sent).toEqual([])
  })

  it('speaker autenticado: token errado num comando → bad_token + disconnect', async () => {
    const { ws, message } = await makeSpeakerServer()
    ws.sent.length = 0
    message({ v: 1, type: 'command', id: 'x1', action: 'slide:next', token: 'WRONG' })
    const err = ws.sent.find((m) => m.type === 'error')
    expect(err?.code).toBe('bad_token')
    expect(ws.close).toHaveBeenCalled()
  })

  it('cliente normal (APK, sem role speaker) NÃO é afetado pelo allowlist', async () => {
    const wss = fakeWss()
    const contents = fakeContents()
    await startRemoteServer(wss, contents, { token: TOKEN })
    const ws = fakeWs()
    wss.handlers.connection(ws)
    const message = (msg) => ws.listeners.message(JSON.stringify(msg))
    message({ v: 1, type: 'hello', device: 'Pixel', token: TOKEN })
    message({ v: 1, type: 'command', id: 'p1', action: 'player.play', token: TOKEN })
    const fwd = contents.sent.find((m) => m.channel === 'remote:command')
    expect(fwd?.payload?.action).toBe('player.play')
    expect(ws.sent.find((m) => m.type === 'error')).toBeUndefined()
  })

  it('token do pregador sem hello de pregador: play → forbidden (escopo vem do token)', async () => {
    const wss = fakeWss()
    const contents = fakeContents()
    await startRemoteServer(wss, contents, { token: TOKEN, speakerToken: SPEAKER_TOKEN })
    const ws = fakeWs()
    wss.handlers.connection(ws)
    const message = (msg) => ws.listeners.message(JSON.stringify(msg))
    message({ v: 1, type: 'hello', device: 'Pixel', token: SPEAKER_TOKEN })
    message({ v: 1, type: 'command', id: 'p1', action: 'player.play', token: SPEAKER_TOKEN })
    message({ v: 1, type: 'command', id: 'p2', action: 'slide:next', token: SPEAKER_TOKEN })
    expect(ws.sent.find((m) => m.id === 'p1')?.code).toBe('forbidden')
    const actions = contents.sent.filter((m) => m.channel === 'remote:command').map((m) => m.payload.action)
    expect(actions).toEqual(['slide:next'])
  })

  it('URL do pregador leva só o token do pregador; o pareamento do APK mantém o token completo', async () => {
    const wss = fakeWss()
    await startRemoteServer(wss, fakeContents(), { token: TOKEN, speakerToken: SPEAKER_TOKEN })
    const info = await ipcHandlers.get('remote:pairing-info')()
    expect(new URL(info.speakerUrl).searchParams.get('token')).toBe(SPEAKER_TOKEN)
    expect(info.speakerUrl).not.toContain(TOKEN)
    expect(info.connectUrl).toContain(`token=${TOKEN}`)
  })

  it('tokens aleatórios do pregador e do APK são diferentes', async () => {
    const wss = fakeWss()
    await startRemoteServer(wss, fakeContents())
    const info = await ipcHandlers.get('remote:pairing-info')()
    const speakerToken = new URL(info.speakerUrl).searchParams.get('token')
    expect(speakerToken).toMatch(/^[0-9A-F]{8}$/)
    expect(speakerToken).not.toBe(info.token)
  })
})

describe('convivência operador (APK) + pregador — limites POR PAPEL', () => {
  /** Servidor com um operador APK já conectado e autenticado. */
  async function serverWithOperator() {
    const wss = fakeWss()
    const contents = fakeContents()
    await startRemoteServer(wss, contents, { token: TOKEN })
    const op = fakeWs()
    wss.handlers.connection(op)
    const opMessage = (msg) => op.listeners.message(JSON.stringify(msg))
    opMessage({ v: 1, type: 'hello', device: 'Moto G85', appVersion: '0.2.0', token: TOKEN })
    const connect = () => {
      const ws = fakeWs()
      wss.handlers.connection(ws)
      const message = (msg) => ws.listeners.message(JSON.stringify(msg))
      return { ws, message }
    }
    return { wss, contents, op, opMessage, connect }
  }

  it('pregador conecta COM operador ativo — aceito, sem remote_busy', async () => {
    const { contents, op, connect } = await serverWithOperator()
    const { ws, message } = connect()
    message({ v: 1, type: 'hello', role: 'speaker', token: TOKEN })
    // Nenhum lado foi rejeitado.
    expect(ws.sent.find((m) => m.type === 'error')).toBeUndefined()
    expect(op.sent.find((m) => m.type === 'error')).toBeUndefined()
    expect(ws.close).not.toHaveBeenCalled()
    // Pregador navega slides normalmente.
    contents.sent.length = 0
    message({ v: 1, type: 'command', id: 's1', action: 'slide:next', token: TOKEN })
    expect(contents.sent.find((m) => m.channel === 'remote:command')?.payload?.action).toBe('slide:next')
  })

  it('2º OPERADOR é rejeitado com remote_busy; operador original segue vivo', async () => {
    const { op, connect } = await serverWithOperator()
    const { ws, message } = connect()
    message({ v: 1, type: 'hello', device: 'Pixel 8', token: TOKEN })
    expect(ws.sent.find((m) => m.type === 'error')?.code).toBe('remote_busy')
    expect(ws.close).toHaveBeenCalled()
    expect(op.sent.find((m) => m.type === 'error')).toBeUndefined()
  })

  it('2º PREGADOR é rejeitado com remote_busy', async () => {
    const { connect } = await serverWithOperator()
    const s1 = connect()
    s1.message({ v: 1, type: 'hello', role: 'speaker', token: TOKEN })
    // Operador + pregador já ocupam as 2 vagas físicas — rejeitado na conexão,
    // antes mesmo do hello (listeners.message nunca é registrado).
    const s2 = connect()
    expect(s2.ws.sent.find((m) => m.type === 'error')?.code).toBe('remote_busy')
    expect(s2.ws.close).toHaveBeenCalled()
    expect(s1.ws.sent.find((m) => m.type === 'error')).toBeUndefined()
  })

  it('pairing-info distingue os dois papéis conectados', async () => {
    const { connect } = await serverWithOperator()
    const { message } = connect()
    message({ v: 1, type: 'hello', role: 'speaker', token: TOKEN })
    const info = ipcHandlers.get('remote:pairing-info')?.()
    expect(info.clientCount).toBe(2)
    expect(info.remoteAddress).toMatch(/Moto G85/)
    expect(info.speakerAddress).toBeTruthy()
  })
})
