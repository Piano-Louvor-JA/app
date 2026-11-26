// @vitest-environment node
/**
 * Carimbo de build do receiver: aba de espelho/retorno com HTML antigo recarrega
 * uma vez. A legenda (overlay.html) é outra página, sem carimbo: nunca pode
 * receber esse reload, senão entra em loop de recarga e para de funcionar.
 */
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

env.root = mkdtempSync(path.join(tmpdir(), 'piano-rxbuild-'))
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

const reloads = (received: Array<Record<string, any>>) =>
  received.filter(m => m.type === 'obsControl' && m.action === 'reload')

describe('reload por carimbo de build do receiver', () => {
  it('espelho desatualizado recarrega; legenda nunca recebe esse reload', async () => {
    setTransmissionState({ bind: 'all', requireToken: false })
    const slot = new PalcoSlot('rx', 'RX', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const legenda = await connect(slot)
      legenda.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['overlay', 'heartbeat'], page: 'legenda' }))
      const espelho = await connect(slot)
      espelho.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['frameView', 'heartbeat'], page: 'espelho', rxBuild: 'antigo' }))

      await expect.poll(() => reloads(espelho.received).length, { timeout: 2000 }).toBe(1)
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(reloads(legenda.received)).toHaveLength(0)
      for (const c of [legenda, espelho]) c.ws.terminate()
    } finally { await slot.dispose() }
  }, 10000)
})
