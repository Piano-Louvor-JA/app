// @vitest-environment node
/** Conexão viva dos dois lados, com WebSockets de verdade. */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => env.root },
  ipcMain: { handle: () => {} },
}))
// @ts-ignore Native runtime module.
import { PalcoSlot, setTransmissionState } from '../../palco-server.mjs'

env.root = mkdtempSync(path.join(tmpdir(), 'piano-heartbeat-'))
afterAll(() => rmSync(env.root, { recursive: true, force: true }))
afterEach(() => setTransmissionState({ bind: 'all', requireToken: true }))

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

async function connect(slot: any) {
  const received: Array<Record<string, any>> = []
  const ws = new WebSocket(`ws://127.0.0.1:${slot.wsPort}/palco`)
  ws.on('message', raw => received.push(JSON.parse(String(raw))))
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject) })
  return { ws, received }
}

describe('heartbeat no servidor do palco', () => {
  it('manda beat a quem entende, não repassa as respostas ao app e derruba a tela que parou de responder', async () => {
    setTransmissionState({ bind: 'all', requireToken: false })
    const events: unknown[] = []
    const contents = { send: (channel: string, payload: unknown) => { if (channel === 'palco:event') events.push(payload) } }
    const slot = new PalcoSlot('hb', 'HB', await freePort(), await freePort(), () => contents, { heartbeatMs: 40 })
    try {
      await slot.start()
      const alive = await connect(slot)
      alive.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['frameView', 'heartbeat'], page: 'espelho' }))
      // responde cada beat, como as telas fazem
      alive.ws.on('message', raw => { if (JSON.parse(String(raw)).type === 'beat') alive.ws.send(JSON.stringify({ v: 2, type: 'beat' })) })
      const old = await connect(slot)

      await expect.poll(() => alive.received.filter(m => m.type === 'beat').length, { timeout: 2000 }).toBeGreaterThan(2)
      expect(old.received.some(m => m.type === 'beat')).toBe(false)
      expect(events.some((m: any) => m.type === 'beat')).toBe(false)

      // tela pendurada: para de responder (nem o ping do WebSocket)
      const hung = await connect(slot)
      hung.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['heartbeat'] }))
      await expect.poll(() => slot.clientsCount, { timeout: 2000 }).toBe(3)
      ;(hung.ws as any)._socket.pause()
      ;(hung.ws as any).pong = () => {}
      hung.ws.removeAllListeners('ping')
      await expect.poll(() => slot.clientsCount, { timeout: 3000 }).toBe(2)
      // a viva e a antiga (que nunca respondeu) seguem conectadas
      expect(alive.ws.readyState).toBe(WebSocket.OPEN)
      expect(old.ws.readyState).toBe(WebSocket.OPEN)
      for (const c of [alive, old, hung]) c.ws.terminate()
    } finally { await slot.dispose() }
  }, 10000)
})
