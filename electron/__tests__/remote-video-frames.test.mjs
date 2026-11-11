/**
 * Prévia do vídeo/YouTube no celular: quadros pequenos num canal próprio
 * (`frame`), fora do estado, só para o APK operador e sem empilhar capturas.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/userData') },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeListener: vi.fn(), removeHandler: vi.fn() },
}))

const serverUrl = pathToFileURL(path.resolve(process.cwd(), 'electron/remote-server.mjs')).href
const { startRemoteServer } = await import(serverUrl)

const TOKEN = 'TESTTOKEN'
const SPEAKER_TOKEN = 'SPEAKERTK'

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
    on: (ev, fn) => { listeners[ev] = fn },
    terminate: vi.fn(),
    _socket: { remoteAddress: '192.168.0.50' },
  }
}

async function makeServer(captureVideoFrame) {
  const handlers = {}
  const wss = { on: (ev, fn) => { handlers[ev] = fn }, address: () => ({ port: 7071 }), close: vi.fn() }
  const contents = { isDestroyed: () => false, send: vi.fn() }
  const server = await startRemoteServer(wss, contents, {
    token: TOKEN,
    speakerToken: SPEAKER_TOKEN,
    captureVideoFrame,
    frameIntervalMs: 250,
  })
  const connect = (hello) => {
    const ws = fakeWs()
    handlers.connection(ws)
    ws.listeners.message(JSON.stringify({ v: 1, type: 'hello', ...hello }))
    return ws
  }
  return { server, connect }
}

const frames = (ws) => ws.sent.filter((m) => m.type === 'frame')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('manda o quadro do vídeo ao APK operador a cada intervalo', async () => {
  const capture = vi.fn(async () => 'AAA')
  const { server, connect } = await makeServer(capture)
  const apk = connect({ device: 'Pixel', token: TOKEN })

  await vi.advanceTimersByTimeAsync(260)

  expect(frames(apk)).toEqual([{ v: 1, type: 'frame', data: 'AAA' }])
  server.stop()
})

it('quadro igual ao anterior não é reenviado; quadro novo vai', async () => {
  const capture = vi.fn(async () => 'AAA')
  const { server, connect } = await makeServer(capture)
  const apk = connect({ device: 'Pixel', token: TOKEN })

  await vi.advanceTimersByTimeAsync(760)
  expect(frames(apk)).toHaveLength(1)

  capture.mockResolvedValue('BBB')
  await vi.advanceTimersByTimeAsync(250)
  expect(frames(apk).at(-1)?.data).toBe('BBB')
  server.stop()
})

it('pregador não recebe quadros e sem APK não captura nada', async () => {
  const capture = vi.fn(async () => 'AAA')
  const { server, connect } = await makeServer(capture)
  const speaker = connect({ role: 'speaker', token: SPEAKER_TOKEN })

  await vi.advanceTimersByTimeAsync(760)

  expect(capture).not.toHaveBeenCalled()
  expect(frames(speaker)).toEqual([])
  server.stop()
})

it('captura lenta não empilha: a próxima só começa depois', async () => {
  let release
  const capture = vi.fn(() => new Promise((resolve) => { release = () => resolve('AAA') }))
  const { server, connect } = await makeServer(capture)
  connect({ device: 'Pixel', token: TOKEN })

  await vi.advanceTimersByTimeAsync(1100)
  expect(capture).toHaveBeenCalledTimes(1)

  release()
  await vi.advanceTimersByTimeAsync(260)
  expect(capture).toHaveBeenCalledTimes(2)
  server.stop()
})

it('sem vídeo aberto (null) não manda nada; parar o servidor para as capturas', async () => {
  const capture = vi.fn(async () => null)
  const { server, connect } = await makeServer(capture)
  const apk = connect({ device: 'Pixel', token: TOKEN })

  await vi.advanceTimersByTimeAsync(510)
  expect(frames(apk)).toEqual([])

  server.stop()
  const calls = capture.mock.calls.length
  await vi.advanceTimersByTimeAsync(1000)
  expect(capture).toHaveBeenCalledTimes(calls)
})

it('APK real: hello sem token; vira operador no 1º comando com o token', async () => {
  const capture = vi.fn(async () => 'AAA')
  const { server, connect } = await makeServer(capture)
  const apk = connect({ device: 'Pixel' })

  await vi.advanceTimersByTimeAsync(510)
  expect(frames(apk)).toEqual([])
  expect(capture).not.toHaveBeenCalled()

  apk.listeners.message(JSON.stringify({ v: 1, type: 'command', id: 'c1', action: 'state.request', token: TOKEN }))
  await vi.advanceTimersByTimeAsync(260)
  expect(frames(apk)).toEqual([{ v: 1, type: 'frame', data: 'AAA' }])
  server.stop()
})

it('comando com o token do pregador não libera quadros', async () => {
  const capture = vi.fn(async () => 'AAA')
  const { server, connect } = await makeServer(capture)
  const ws = connect({ device: 'Navegador' })

  ws.listeners.message(JSON.stringify({ v: 1, type: 'command', id: 'c1', action: 'slide:next', token: SPEAKER_TOKEN }))
  await vi.advanceTimersByTimeAsync(510)

  expect(frames(ws)).toEqual([])
  server.stop()
})
