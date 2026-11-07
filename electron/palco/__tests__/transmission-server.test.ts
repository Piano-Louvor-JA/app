// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

const env = vi.hoisted(() => ({ root: '', handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({
  app: { getPath: () => env.root },
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => env.handlers.set(name, fn) },
}))
// @ts-ignore Native runtime module.
import { attachPalcoServer, enablePalcoToken, getPalcoManager, PalcoSlot, setTransmissionState } from '../../palco-server.mjs'

env.root = mkdtempSync(path.join(tmpdir(), 'piano-transmission-server-'))
afterAll(() => rmSync(env.root, { recursive: true, force: true }))
afterEach(() => setTransmissionState({ bind: 'all', requireToken: true }))

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

async function occupy(port: number): Promise<Server> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(port, '0.0.0.0', resolve))
  return server
}

describe('PalcoSlot network', () => {
  it('listens only on loopback when the transmission is local', async () => {
    setTransmissionState({ bind: 'local', requireToken: true })
    const slot = new PalcoSlot('local', 'Local', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const status = slot.status()
      expect(status.listenHost).toBe('127.0.0.1')
      expect(status.url).toBe(`http://127.0.0.1:${slot.httpPort}`)
      const mirrorUrl = `http://127.0.0.1:${slot.httpPort}/espelho`
      expect(status.receiverUrl).toBe(mirrorUrl)
      expect((await fetch(`http://127.0.0.1:${slot.httpPort}/status`)).status).toBe(200)
      const mirror = await fetch(mirrorUrl)
      expect(mirror.status).toBe(200)
      expect(mirror.headers.get('content-type')).toContain('text/html')
    } finally { await slot.dispose() }
  }, 10000)

  it('reports a busy HTTP port with the port number instead of failing silently', async () => {
    const httpPort = await freePort()
    const blocker = await occupy(httpPort)
    const slot = new PalcoSlot('busy', 'Busy', httpPort, await freePort(), () => null)
    try {
      await expect(slot.prepare()).rejects.toThrow()
      expect(slot.status().error).toEqual({ code: 'port-in-use', port: httpPort })
      expect(await slot.start()).toBe(false)
      expect(slot.status().error).toEqual({ code: 'port-in-use', port: httpPort })
    } finally {
      await slot.dispose()
      await new Promise<void>(resolve => blocker.close(() => resolve()))
    }
  }, 10000)

  it('reports a busy WebSocket port and clears the error once it starts', async () => {
    const wsPort = await freePort()
    const blocker = await occupy(wsPort)
    const slot = new PalcoSlot('busy-ws', 'Busy WS', await freePort(), wsPort, () => null)
    try {
      expect(await slot.start()).toBe(false)
      expect(slot.status().error).toEqual({ code: 'port-in-use', port: wsPort })
      await new Promise<void>(resolve => blocker.close(() => resolve()))
      expect(await slot.start()).toBe(true)
      expect(slot.status().error).toBeNull()
    } finally { await slot.dispose() }
  }, 10000)

  it('moves a stopped slot to another port pair and refuses while running', async () => {
    const first = await freePort()
    const slot = new PalcoSlot('7082', 'Move', first, first + 1, () => null)
    try {
      await slot.prepare()
      const next = await freePort()
      await slot.setPorts(next)
      expect(slot.id).toBe('7082')
      expect([slot.httpPort, slot.wsPort]).toEqual([next, next + 1])
      expect((await fetch(`http://127.0.0.1:${next}/status`)).status).toBe(200)
      await expect(fetch(`http://127.0.0.1:${first}/status`)).rejects.toThrow()
      await slot.start()
      await expect(slot.setPorts(await freePort())).rejects.toThrow('running')
    } finally { await slot.dispose() }
  }, 10000)

  it('rebinds the HTTP server to the current listen host', async () => {
    const slot = new PalcoSlot('rebind', 'Rebind', await freePort(), await freePort(), () => null)
    try {
      await slot.prepare()
      setTransmissionState({ bind: 'local', requireToken: true })
      await slot.rebind()
      expect(slot.status().listenHost).toBe('127.0.0.1')
      expect((await fetch(`http://127.0.0.1:${slot.httpPort}/status`)).status).toBe(200)
    } finally { await slot.dispose() }
  }, 10000)
})

describe('PalcoSlot overlay style', () => {
  it('normalizes the style and replays it to sources that connect later, also after a restart', async () => {
    const slot = new PalcoSlot('style', 'Style', await freePort(), await freePort(), () => null, { overlay: { layout: 'fullscreen' } })
    const clients: WebSocket[] = []
    const nextStyle = () => new Promise<any>((resolve, reject) => {
      const client = new WebSocket(`ws://127.0.0.1:${slot.wsPort}/palco`)
      clients.push(client)
      client.once('error', reject)
      client.on('message', raw => { const message = JSON.parse(String(raw)); if (message.type === 'overlayStyle') resolve(message.style) })
    })
    try {
      expect(slot.overlay).toMatchObject({ layout: 'fullscreen', theme: 'dark' })
      await slot.start()
      expect(await nextStyle()).toMatchObject({ layout: 'fullscreen' })
      slot.setOverlay({ layout: 'lower-third', theme: 'transparent', textScale: 120 })
      expect(slot.status().overlay).toMatchObject({ layout: 'lower-third', theme: 'transparent', textScale: 120 })
      await slot.stop()
      await slot.start()
      expect(await nextStyle()).toMatchObject({ layout: 'lower-third', theme: 'transparent', textScale: 120 })
    } finally {
      clients.forEach(client => client.terminate())
      await slot.dispose()
    }
  }, 10000)
})

describe('PalcoSlot stage return', () => {
  it('serves the stage return page and replays its state with an authenticated background', async () => {
    const token = enablePalcoToken()
    const slot = new PalcoSlot('return', 'Return', await freePort(), await freePort(), () => null)
    const clients: WebSocket[] = []
    const nextReturn = () => new Promise<any>((resolve, reject) => {
      const client = new WebSocket(`ws://127.0.0.1:${slot.wsPort}/palco`)
      clients.push(client)
      client.once('error', reject)
      client.on('message', raw => { const message = JSON.parse(String(raw)); if (message.type === 'stageReturn') resolve(message) })
    })
    try {
      await slot.start()
      const page = await fetch(`http://127.0.0.1:${slot.httpPort}/retorno`)
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toContain('text/html')
      expect(await page.text()).toContain('id="stageReturn"')
      const background = `http://192.168.0.5:${slot.httpPort}/media/capa.png`
      slot.send({ v: 1, type: 'stageReturn', active: true, current: 'Santo', next: '', background })
      slot.send({ v: 2, type: 'idle' })
      const replayed = await nextReturn()
      expect(replayed).toMatchObject({ active: true, current: 'Santo' })
      expect(new URL(replayed.background).searchParams.get('token')).toBe(token)
    } finally {
      clients.forEach(client => client.terminate())
      await slot.dispose()
    }
  }, 10000)
})

describe('PalcoManager', () => {
  it('keeps ids stable across port changes, persists the main source and refuses rebinding while live', async () => {
    writeFileSync(path.join(env.root, 'palco-slots.json'), JSON.stringify([
      { id: '0', httpPort: 7080, wsPort: 7081, overlay: { theme: 'light' } },
      { id: '7082', label: 'OBS 2', httpPort: 9100, wsPort: 9101 },
      { id: '7084', label: 'OBS 4', httpPort: 7084, wsPort: 7085 },
      { id: 'bad', label: 'Bad', httpPort: 80, wsPort: 81 },
    ]), 'utf8')
    vi.spyOn(PalcoSlot.prototype, 'prepare').mockResolvedValue(undefined)
    vi.spyOn(PalcoSlot.prototype, 'rebind').mockResolvedValue(undefined)
    vi.spyOn(PalcoSlot.prototype, 'dispose').mockResolvedValue(undefined)
    attachPalcoServer(() => null)
    const manager = getPalcoManager()
    expect(manager.getAllSlots().map((slot: any) => [slot.id, slot.httpPort, slot.wsPort])).toEqual([['0', 47080, 47081], ['7082', 9100, 9101], ['7084', 47084, 47085]])
    const migrated = JSON.parse(readFileSync(path.join(env.root, 'palco-slots.json'), 'utf8'))
    expect(migrated.map((row: any) => [row.id, row.httpPort])).toEqual([['0', 47080], ['7082', 9100], ['7084', 47084]])
    expect(manager.getPrincipal().overlay.theme).toBe('light')

    const created = manager.createSlot('OBS 3')
    expect([created.id, created.httpPort]).toEqual(['47082', 47082])

    const update = env.handlers.get('palco:slot-update')!
    expect(await update({}, { id: '47082', httpPort: 9100 })).toEqual({ ok: false, reason: 'collision' })
    expect(await update({}, { id: '47082', httpPort: 80 })).toEqual({ ok: false, reason: 'range' })
    expect(await update({}, { id: 'nope', httpPort: 9200 })).toEqual({ ok: false, reason: 'not-found' })
    expect(await update({}, { id: '47082', httpPort: 9200, overlay: { position: 'top' } })).toMatchObject({ ok: true })
    expect(manager.getSlot('47082').httpPort).toBe(9200)
    expect(manager.getSlot('47082').overlay.position).toBe('top')
    expect(await update({}, { id: '0', overlay: { layout: 'fullscreen' } })).toMatchObject({ ok: true })

    const saved = JSON.parse(readFileSync(path.join(env.root, 'palco-slots.json'), 'utf8'))
    expect(saved.find((row: any) => row.id === '0')).toMatchObject({ httpPort: 47080, wsPort: 47081, overlay: { theme: 'light', layout: 'fullscreen' } })
    expect(saved.find((row: any) => row.id === '47082')).toMatchObject({ label: 'OBS 3', httpPort: 9200, wsPort: 9201, overlay: { position: 'top' } })

    const setTransmission = env.handlers.get('palco:transmission-set')!
    vi.spyOn(manager.getSlot('7082'), 'running', 'get').mockReturnValue(true)
    expect(await setTransmission({}, { bind: 'local' })).toEqual({ ok: false, reason: 'running' })
    vi.restoreAllMocks()
    vi.spyOn(PalcoSlot.prototype, 'rebind').mockResolvedValue(undefined)
    expect(await setTransmission({}, { bind: 'local' })).toMatchObject({ ok: true, bind: 'local' })
    expect(JSON.parse(readFileSync(path.join(env.root, 'palco-transmission.json'), 'utf8')).bind).toBe('local')
    expect(PalcoSlot.prototype.rebind).toHaveBeenCalledTimes(4)
    const info = await env.handlers.get('palco:transmission-get')!({})
    expect(info).toMatchObject({ bind: 'local', requireToken: true, listenHost: '127.0.0.1', linkHost: '127.0.0.1', missing: false })
    expect(Array.isArray(info.interfaces)).toBe(true)
  })
})
