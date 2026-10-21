// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
const mocks = vi.hoisted(() => ({ handlers: new Map() }))
vi.mock('electron', () => ({
  app: { on: vi.fn() },
  ipcMain: {
    on: (name, handler) => mocks.handlers.set(name, handler),
    handle: (name, handler) => mocks.handlers.set(name, handler),
    removeListener: name => mocks.handlers.delete(name), removeHandler: name => mocks.handlers.delete(name),
  },
}))
import { startRemoteServer } from '../remote-server.mjs'
import { listenRemoteHttp } from '../remote-http.mjs'

const resources = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    resource.client?.terminate()
    resource.stop()
    await new Promise(resolve => resource.httpServer.close(resolve))
  }
  mocks.handlers.clear()
})
function nextMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', listener); reject(new Error('message timeout')) }, 2000)
    const listener = raw => { const message = JSON.parse(String(raw)); if (!predicate(message)) return; clearTimeout(timeout); socket.off('message', listener); resolve(message) }
    socket.on('message', listener)
  })
}
async function setup() {
  const { wss, httpServer } = await listenRemoteHttp(WebSocketServer, 0)
  const send = vi.fn((channel, payload) => {
    if (channel === 'remote:request-state') mocks.handlers.get('remote:state')?.(null, { liturgy: { items: [{ title: 'Leitura' }] } })
    if (channel === 'remote:command') {
      mocks.handlers.get('remote:ack')?.(null, { id: payload.id, ok: true })
      mocks.handlers.get('remote:state')?.(null, { liturgy: { items: [{ title: 'Leitura' }] } })
    }
  })
  const handle = await startRemoteServer(wss, { send, isDestroyed: () => false })
  const record = { ...handle, httpServer, port: httpServer.address().port, client: null, send }
  resources.push(record)
  return record
}
describe('Controle por navegador no servidor local', () => {
  it('autentica no hello e entrega o estado inicial sem exigir comando', async () => {
    const host = await setup()
    const client = new WebSocket(`ws://localhost:${host.port}`)
    host.client = client
    await once(client, 'open')
    const state = nextMessage(client, message => message.type === 'state')
    client.send(JSON.stringify({ v: 1, type: 'hello', device: 'Browser', token: host.token }))
    expect((await state).liturgy.items[0].title).toBe('Leitura')
    expect(mocks.handlers.get('remote:pairing-info')().clientCount).toBe(1)
  })
  it('recusa hello inválido sem anunciar uma identidade autenticada', async () => {
    const host = await setup()
    const client = new WebSocket(`ws://localhost:${host.port}`)
    host.client = client
    await once(client, 'open')
    const rejected = nextMessage(client, message => message.type === 'error')
    client.send(JSON.stringify({ v: 1, type: 'hello', device: 'Fake', token: 'incorrect' }))
    expect((await rejected).code).toBe('bad_token')
    expect(mocks.handlers.get('remote:pairing-info')().clientAddress).toBeNull()
  })
  it('rejeita porta ocupada sem gerar erro não tratado', async () => {
    const host = await setup()
    await expect(listenRemoteHttp(WebSocketServer, host.port)).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
  it('serve a interface e o script, sem expor arquivos nem incluir o código na página', async () => {
    const host = await setup()
    const response = await fetch(`http://localhost:${host.port}/control`)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('connect-form')
    expect(html).not.toContain(host.token)
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect((await fetch(`http://localhost:${host.port}/control.js`)).status).toBe(200)
    expect((await fetch(`http://localhost:${host.port}/../package.json`)).status).toBe(404)
    expect((await fetch(`http://localhost:${host.port}/control`, { method: 'POST' })).status).toBe(405)
  })
  it('protege o estado até autenticar e encaminha os comandos com confirmação', async () => {
    const host = await setup()
    const client = new WebSocket(`ws://localhost:${host.port}`)
    host.client = client
    const seen = []
    client.on('message', raw => seen.push(JSON.parse(String(raw))))
    await once(client, 'open')
    const pong = nextMessage(client, message => message.type === 'pong')
    client.send(JSON.stringify({ v: 1, type: 'ping' }))
    await pong
    expect(seen.some(message => message.type === 'state')).toBe(false)
    const state = nextMessage(client, message => message.type === 'state')
    client.send(JSON.stringify({ v: 1, type: 'command', id: '1', token: host.token, action: 'liturgy.state' }))
    expect((await state).liturgy.items[0].title).toBe('Leitura')
    expect(host.send).toHaveBeenCalledWith('remote:command', expect.objectContaining({ action: 'liturgy.state' }))
  })
  it('recusa um código incorreto', async () => {
    const host = await setup()
    const client = new WebSocket(`ws://localhost:${host.port}`)
    host.client = client
    await once(client, 'open')
    const rejected = nextMessage(client, message => message.type === 'error')
    client.send(JSON.stringify({ v: 1, type: 'command', id: 'bad', token: 'incorrect', action: 'liturgy.next' }))
    expect((await rejected).code).toBe('bad_token')
    expect(host.send).not.toHaveBeenCalledWith('remote:command', expect.anything())
  })
})
