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
    address: () => ({ port: 48080 }),
    close: vi.fn(),
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

  it('URL do pregador aponta para a porta padrão do palco (47080/47081)', async () => {
    await startRemoteServer(fakeWss(), fakeContents(), { token: TOKEN, speakerToken: SPEAKER_TOKEN })
    const url = new URL((await ipcHandlers.get('remote:pairing-info')()).speakerUrl)
    expect(url.port).toBe('47080')
    expect(url.searchParams.get('palcoPort')).toBe('47081')
  })

  it('URL do pregador acompanha a porta atual da Fonte 1', async () => {
    let palcoPort = 47080
    await startRemoteServer(fakeWss(), fakeContents(), { token: TOKEN, palcoHttpPort: () => palcoPort })
    palcoPort = 47090
    const info = await ipcHandlers.get('remote:pairing-info')()
    const url = new URL(info.speakerUrl)
    expect(url.port).toBe('47090')
    expect(url.searchParams.get('palcoPort')).toBe('47091')
    expect(info.speakerQrDataUrl).toMatch(/^data:image\/png;base64,/)
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
    // Conexões de visualização podem coexistir; o hello identifica o papel.
    const s2 = connect()
    s2.message({ v: 1, type: 'hello', role: 'speaker', token: TOKEN })
    expect(s2.ws.sent.find((m) => m.type === 'error')?.code).toBe('remote_busy')
    expect(s2.ws.close).toHaveBeenCalled()
    expect(s1.ws.sent.find((m) => m.type === 'error')).toBeUndefined()
  })

  it('pairing-info distingue os dois papéis conectados', async () => {
    const { connect } = await serverWithOperator()
    const { message } = connect()
    message({ v: 1, type: 'hello', role: 'speaker', token: TOKEN })
    const info = await ipcHandlers.get('remote:pairing-info')?.()
    expect(info.clientCount).toBe(2)
    expect(info.remoteAddress).toMatch(/Moto G85/)
    expect(info.speakerAddress).toBeTruthy()
  })
})

describe('operador — controles da barra de vídeo', () => {
  it('encaminha destino e estado do comando video.setTarget', async () => {
    const wss = fakeWss()
    const contents = fakeContents()
    await startRemoteServer(wss, contents, { token: TOKEN, speakerToken: SPEAKER_TOKEN })
    const ws = fakeWs()
    wss.handlers.connection(ws)

    ws.listeners.message(
      JSON.stringify({
        v: 1,
        type: 'command',
        id: 'c1',
        action: 'video.setTarget',
        token: TOKEN,
        targetId: 'tv:a',
        enabled: false,
      }),
    )

    const fwd = contents.sent.find((m) => m.channel === 'remote:command')
    expect(fwd?.payload).toMatchObject({ targetId: 'tv:a', enabled: false })
  })
})


describe('renovação manual dos tokens', () => {
  it('porta padrão do controle remoto é 48080', async () => {
    const { REMOTE_PORT } = await import(serverUrl)
    expect(REMOTE_PORT).toBe(48080)
  })

  it.each(['remote', 'speaker'])('renovar %s atualiza QR/link e desconecta somente esse papel', async (role) => {
    const wss = fakeWss()
    const contents = fakeContents()
    const saveTokens = vi.fn(async () => {})
    const server = await startRemoteServer(wss, contents, { token: TOKEN, speakerToken: SPEAKER_TOKEN, saveTokens })
    try {
      const operator = fakeWs()
      const speaker = fakeWs()
      wss.handlers.connection(operator)
      operator.listeners.message(JSON.stringify({ v: 1, type: 'hello', device: 'Celular', token: TOKEN }))
      wss.handlers.connection(speaker)
      speaker.listeners.message(JSON.stringify({ v: 1, type: 'hello', role: 'speaker', token: SPEAKER_TOKEN }))
      const before = await ipcHandlers.get('remote:pairing-info')()
      const reset = ipcHandlers.get('remote:token-reset')
      expect(reset).toBeTypeOf('function')
      const after = await reset(null, role)
      expect(saveTokens).toHaveBeenCalledOnce()
      if (role === 'remote') {
        expect(after.token).not.toBe(TOKEN)
        expect(after.connectUrl).not.toBe(before.connectUrl)
        expect(after.qrDataUrl).not.toBe(before.qrDataUrl)
        expect(after.speakerUrl).toBe(before.speakerUrl)
        expect(operator.close).toHaveBeenCalledOnce()
        expect(speaker.close).not.toHaveBeenCalled()
      } else {
        expect(after.token).toBe(TOKEN)
        expect(after.connectUrl).toBe(before.connectUrl)
        expect(after.speakerUrl).not.toBe(before.speakerUrl)
        expect(after.speakerQrDataUrl).not.toBe(before.speakerQrDataUrl)
        expect(speaker.close).toHaveBeenCalledOnce()
        expect(operator.close).not.toHaveBeenCalled()
      }
      const saved = saveTokens.mock.calls[0][0]
      expect(saved.token).not.toBe(saved.speakerToken)
      expect(saved.token).toBe(after.token)
      const bad = fakeWs()
      wss.handlers.connection(bad)
      bad.listeners.message(JSON.stringify({ v: 1, type: 'command', id: 'old', action: 'slide:next', token: role === 'remote' ? TOKEN : SPEAKER_TOKEN }))
      expect(bad.sent.some((m) => m.code === 'bad_token')).toBe(true)
    } finally { server.stop() }
  })

  it('falha ao persistir não troca token, QR ou conexões; papel inválido é recusado', async () => {
    const saveTokens = vi.fn(async () => { throw new Error('sem escrita') })
    const server = await startRemoteServer(fakeWss(), fakeContents(), { token: TOKEN, speakerToken: SPEAKER_TOKEN, saveTokens })
    try {
      const reset = ipcHandlers.get('remote:token-reset')
      expect(reset).toBeTypeOf('function')
      const before = await ipcHandlers.get('remote:pairing-info')()
      await expect(reset(null, 'remote')).rejects.toThrow('sem escrita')
      expect(await ipcHandlers.get('remote:pairing-info')()).toEqual(before)
      await expect(reset(null, 'qualquer')).rejects.toThrow()
    } finally { server.stop() }
  })
})


it('renovações simultâneas preservam os dois tokens persistidos', async () => {
  const saveTokens = vi.fn(async () => {})
  const server = await startRemoteServer(fakeWss(), fakeContents(), { token: TOKEN, speakerToken: SPEAKER_TOKEN, saveTokens })
  try {
    const reset = ipcHandlers.get('remote:token-reset')
    await Promise.all([reset(null, 'remote'), reset(null, 'speaker')])
    const first = saveTokens.mock.calls[0][0]
    const last = saveTokens.mock.calls[1][0]
    expect(last.token).toBe(first.token)
    expect(last.speakerToken).not.toBe(first.speakerToken)
    const pairing = await ipcHandlers.get('remote:pairing-info')()
    expect(pairing.token).toBe(last.token)
    expect(new URL(pairing.speakerUrl).searchParams.get('token')).toBe(last.speakerToken)
  } finally { server.stop() }
})

describe('confirmação de autenticação para recordar conexão no APK', () => {
  it('confirma token válido no hello e rejeita token inválido', async () => {
    const wss = fakeWss()
    const server = await startRemoteServer(wss, fakeContents(), { token: TOKEN })
    const valid = fakeWs()
    wss.handlers.connection(valid)
    await valid.listeners.message(JSON.stringify({ v: 1, type: 'hello', device: 'APK', token: TOKEN }))
    expect(valid.sent).toContainEqual({ v: 1, type: 'ack', id: 'remote-auth', ok: true })
    const invalid = fakeWs()
    wss.handlers.connection(invalid)
    await invalid.listeners.message(JSON.stringify({ v: 1, type: 'hello', device: 'APK', token: 'INVALID' }))
    expect(invalid.sent).toContainEqual({ v: 1, type: 'error', code: 'bad_token' })
    expect(invalid.close).toHaveBeenCalled()
    server.stop()
  })
})

it('regência tem token próprio, aceita múltiplos leitores e rejeita qualquer comando', async () => {
  const wss = fakeWss(), contents = fakeContents()
  const server = await startRemoteServer(wss, contents, { token: TOKEN, speakerToken: SPEAKER_TOKEN })
  try {
    const info = await ipcHandlers.get('remote:pairing-info')()
    const url = new URL(info.viewerUrl)
    const viewerToken = url.searchParams.get('token')
    expect(viewerToken).not.toBe(SPEAKER_TOKEN)
    expect(viewerToken).not.toBe(TOKEN)
    expect(url.searchParams.get('mode')).toBe('view')
    const operator = fakeWs(); wss.handlers.connection(operator)
    operator.listeners.message(JSON.stringify({ v: 1, type: 'hello', device: 'Operador', token: TOKEN }))
    const presenter = fakeWs(); wss.handlers.connection(presenter)
    presenter.listeners.message(JSON.stringify({ v: 1, type: 'hello', role: 'speaker', token: SPEAKER_TOKEN }))
    for (let i = 0; i < 2; i++) {
      const ws = fakeWs(); wss.handlers.connection(ws)
      ws.listeners.message(JSON.stringify({ v: 1, type: 'hello', role: 'speaker', token: viewerToken }))
      expect(ws.close).not.toHaveBeenCalled()
      for (const action of ['slide:next', 'slide:prev', 'slide:goto', 'player.play']) {
        ws.listeners.message(JSON.stringify({ v: 1, type: 'command', id: action, action, token: viewerToken }))
        expect(ws.sent.at(-1).code).toBe('forbidden')
      }
    }
    expect(contents.sent.filter(m => m.channel === 'remote:command')).toHaveLength(0)
  } finally { server.stop?.() }
})

it('segundo passador sem hello também é bloqueado antes de encaminhar comandos', async () => {
  const wss = fakeWss(), contents = fakeContents()
  const server = await startRemoteServer(wss, contents, { token: TOKEN, speakerToken: SPEAKER_TOKEN })
  try {
    const first = fakeWs(); wss.handlers.connection(first)
    first.listeners.message(JSON.stringify({ v: 1, type: 'hello', role: 'speaker', token: SPEAKER_TOKEN }))
    const second = fakeWs(); wss.handlers.connection(second)
    second.listeners.message(JSON.stringify({ v: 1, type: 'command', id: 'second', action: 'slide:next', token: SPEAKER_TOKEN }))
    expect(second.sent.at(-1).code).toBe('remote_busy')
    expect(second.close).toHaveBeenCalled()
    expect(first.close).not.toHaveBeenCalled()
    expect(contents.sent.filter(m => m.channel === 'remote:command')).toHaveLength(0)
  } finally { server.stop() }
})

it('desktop encerra só o passador, mantém QR e regência e libera outro dispositivo', async () => {
  const wss = fakeWss(), contents = fakeContents()
  const server = await startRemoteServer(wss, contents, { token: TOKEN, speakerToken: SPEAKER_TOKEN })
  try {
    const before = await ipcHandlers.get('remote:pairing-info')()
    const viewer = fakeWs(); wss.handlers.connection(viewer)
    viewer.listeners.message(JSON.stringify({ v: 1, type: 'hello', token: new URL(before.viewerUrl).searchParams.get('token') }))
    const first = fakeWs(); wss.handlers.connection(first)
    first.listeners.message(JSON.stringify({ v: 1, type: 'hello', role: 'speaker', token: SPEAKER_TOKEN }))
    const after = await ipcHandlers.get('remote:speaker-disconnect')()
    expect(after.speakerUrl).toBe(before.speakerUrl)
    expect(after.viewerUrl).toBe(before.viewerUrl)
    expect(after.speakerAddress).toBeNull()
    expect(first.close).toHaveBeenCalled()
    expect(first.sent.at(-1).code).toBe('speaker_disconnected')
    expect(viewer.close).not.toHaveBeenCalled()
    const second = fakeWs(); wss.handlers.connection(second)
    second.listeners.message(JSON.stringify({ v: 1, type: 'hello', role: 'speaker', token: SPEAKER_TOKEN }))
    expect(second.close).not.toHaveBeenCalled()
  } finally { server.stop() }
})
