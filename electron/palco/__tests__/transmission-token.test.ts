// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

const env = vi.hoisted(() => ({ root: '', handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({
  app: { getPath: () => env.root },
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => env.handlers.set(name, fn) },
}))
// @ts-ignore Native runtime module.
import { attachPalcoServer, getPalcoManager, getPalcoToken, PalcoSlot, setTransmissionState } from '../../palco-server.mjs'

env.root = mkdtempSync(path.join(tmpdir(), 'piano-transmission-token-'))
afterAll(() => rmSync(env.root, { recursive: true, force: true }))
afterEach(() => setTransmissionState({ bind: 'all', requireToken: true }))

vi.spyOn(PalcoSlot.prototype, 'prepare').mockResolvedValue(undefined)
attachPalcoServer(() => null)
vi.restoreAllMocks()

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

function fakeRes() {
  const state = { statusCode: 200 }
  return {
    state,
    set statusCode(value: number) { state.statusCode = value },
    get statusCode() { return state.statusCode },
    setHeader() {},
    end() {},
  }
}

async function statusFromNetwork(slot: any, url: string) {
  const res = fakeRes()
  await slot.handleHttp({ url, socket: { remoteAddress: '::ffff:192.168.0.50' }, headers: {} }, res)
  return res.state.statusCode
}

const lanAddress = Object.values(networkInterfaces()).flat()
  .find(entry => entry?.family === 'IPv4' && !entry.internal)?.address

describe('token requirement', () => {
  it('protects media and proxy from the network only while the token is required', async () => {
    const slot = new PalcoSlot('token', 'Token', 0, 0, null)
    expect(await statusFromNetwork(slot, '/media/missing.png')).toBe(403)
    expect(await statusFromNetwork(slot, '/proxy')).toBe(403)
    setTransmissionState({ bind: 'all', requireToken: false })
    expect(await statusFromNetwork(slot, '/media/missing.png')).toBe(404)
    expect(await statusFromNetwork(slot, '/proxy')).toBe(400)
  })

  it('prints the token in links only when it is required', async () => {
    const slot = new PalcoSlot('links', 'Links', await freePort(), await freePort(), () => null)
    try {
      expect(slot.status().overlayUrl).toBeNull()
      expect(slot.status().returnUrl).toBeNull()
      await slot.start()
      expect(slot.status().receiverUrl).toContain(`?token=${getPalcoToken()}`)
      expect(slot.status().overlayUrl).toMatch(new RegExp(`:${slot.httpPort}/overlay\\?token=${getPalcoToken()}$`))
      expect(slot.status().returnUrl).toMatch(new RegExp(`:${slot.httpPort}/retorno\\?token=${getPalcoToken()}$`))
      setTransmissionState({ bind: 'all', requireToken: false })
      expect(slot.status().receiverUrl).toMatch(/\/$/)
      expect(slot.status().overlayUrl).toMatch(/\/overlay$/)
      expect(slot.status().returnUrl).toMatch(/\/retorno$/)
    } finally { await slot.dispose() }
  }, 10000)

  it('persists the choice and reports it back', async () => {
    expect(await env.handlers.get('palco:transmission-set')!({}, { requireToken: false })).toMatchObject({ ok: true, requireToken: false })
    expect(JSON.parse(readFileSync(path.join(env.root, 'palco-transmission.json'), 'utf8')).requireToken).toBe(false)
    expect(await env.handlers.get('palco:transmission-get')!({})).toMatchObject({ requireToken: false, token: getPalcoToken() })
  })
})

it('lists connections with port, style and error details for the settings screen', async () => {
  const [principal] = await env.handlers.get('palco:slots')!({})
  expect(principal).toMatchObject({ id: '0', label: 'Principal', running: false, clients: 0, httpPort: 47080, wsPort: 47081, overlay: { layout: 'lower-third' } })
  expect(principal).toHaveProperty('error')
  expect(principal).toHaveProperty('overlayUrl', null)
})

describe('token reset', () => {
  it('issues a new token, saves it and keeps sources opened on this computer', async () => {
    const before = getPalcoToken()
    const slot = getPalcoManager().getPrincipal()
    vi.spyOn(slot, 'disconnectNetworkClients')
    const result = await env.handlers.get('palco:token-reset')!({})
    expect(result.token).toMatch(/^[A-Z0-9]{5}$/)
    expect(result.token).not.toBe(before)
    expect(readFileSync(path.join(env.root, 'palco-token.txt'), 'utf8')).toBe(result.token)
    expect(slot.disconnectNetworkClients).toHaveBeenCalledOnce()
  })

  it.skipIf(!lanAddress)('drops sources connected through the network and keeps local ones', async () => {
    const slot = new PalcoSlot('drop', 'Drop', await freePort(), await freePort(), () => null)
    const open = (host: string) => new Promise<WebSocket>((resolve, reject) => {
      const client = new WebSocket(`ws://${host}:${slot.wsPort}/palco?token=${getPalcoToken()}`)
      client.once('open', () => resolve(client))
      client.once('error', reject)
    })
    try {
      await slot.start()
      const local = await open('127.0.0.1')
      const remote = await open(lanAddress!)
      await expect.poll(() => slot.clientsCount).toBe(2)
      const closed = new Promise<void>(resolve => remote.once('close', () => resolve()))
      slot.disconnectNetworkClients()
      await closed
      await expect.poll(() => slot.clientsCount).toBe(1)
      expect(local.readyState).toBe(WebSocket.OPEN)
      local.terminate()
    } finally { await slot.dispose() }
  }, 10000)
})
