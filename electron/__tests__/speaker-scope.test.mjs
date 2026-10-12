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
  await startRemoteServer(wss, contents, { token: TOKEN })
  const connection = wss.handlers.connection
  expect(connection).toBeTruthy()
  const ws = fakeWs()
  connection(ws)
  const message = (msg) => ws.listeners.message(JSON.stringify(msg))
  // Handshake do pregador: hello marca o escopo speaker.
  message({ v: 1, type: 'hello', role: 'speaker', token: TOKEN })
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
    message({ v: 1, type: 'command', id: 'c1', action: 'slide:next', token: TOKEN })
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
      message({ v: 1, type: 'command', id: `f${i}`, action, token: TOKEN })
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
})
