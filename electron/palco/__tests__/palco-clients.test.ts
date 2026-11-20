// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

const env = vi.hoisted(() => ({ root: '', handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({
  app: { getPath: () => env.root },
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => env.handlers.set(name, fn) },
}))
// @ts-ignore Native runtime module.
import { PalcoSlot, parseTarget, setMutedKey, setPinnedKey, setTransmissionState } from '../../palco-server.mjs'
// @ts-ignore Native runtime module.
import { clientFromRequest, commandMessage, muteKey, platformFromUserAgent, sameTv, withHello } from '../palco-clients.mjs'
// @ts-ignore Native runtime module.
import { discoverTvs, parseDial, subnetPrefix } from '../palco-discovery.mjs'

env.root = mkdtempSync(path.join(tmpdir(), 'piano-palco-clients-'))
afterAll(() => rmSync(env.root, { recursive: true, force: true }))

const LG_UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36'

describe('palco-clients', () => {
  it('reconhece a plataforma pelo User-Agent', () => {
    expect(platformFromUserAgent(LG_UA)).toBe('webos')
    expect(platformFromUserAgent('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)')).toBe('tizen')
    expect(platformFromUserAgent('Mozilla/5.0 OBS/30.1')).toBe('obs')
    expect(platformFromUserAgent('Mozilla/5.0 (Linux; Android 12; BRAVIA)')).toBe('androidtv')
    expect(platformFromUserAgent('Mozilla/5.0 (Linux; Android 14) Mobile Safari')).toBe('browser')
    expect(platformFromUserAgent()).toBe('browser')
  })

  it('o hello completa nome, versão e id; sem nome volta ao padrão da plataforma', () => {
    const base = clientFromRequest({ ip: '10.0.0.5', userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' })
    expect(base).toMatchObject({ platform: 'browser', name: 'Navegador', id: null, version: null })
    const tv = withHello(base, { platform: 'palco-androidtv', id: 'a1', version: '0.3.1', name: '  TV da entrada ' })
    expect(tv).toMatchObject({ platform: 'androidtv', name: 'TV da entrada', id: 'a1', version: '0.3.1', uid: base.uid })
    expect(withHello(tv, { name: '' }).name).toBe('Android TV')
  })

  it('a chave da marca usa o id e, sem ele, IP + plataforma', () => {
    const info = clientFromRequest({ ip: '10.0.0.7', userAgent: LG_UA })
    expect(muteKey(info)).toBe('10.0.0.7|webos')
    expect(muteKey(withHello(info, { id: 'z9' }))).toBe('z9')
  })

  it('ids diferentes atrás do mesmo IP são TVs diferentes', () => {
    const a = { ip: '127.0.0.1', platform: 'webos', id: 'p1' }
    expect(sameTv(a, { ...a, id: 'p2' })).toBe(false)
    expect(sameTv(a, { ...a })).toBe(true)
    expect(sameTv({ ...a, id: null }, { ...a, id: 'p2' })).toBe(true)
    expect(sameTv({ ...a, id: null }, { ...a, id: null, platform: 'tizen' })).toBe(false)
  })

  it('monta só comandos válidos', () => {
    expect(commandMessage('rename', { name: '   ' })).toBeNull()
    expect(commandMessage('rename', { name: 'x'.repeat(50) })?.name).toHaveLength(40)
    expect(commandMessage('moveTo', { port: 80 })).toBeNull()
    expect(commandMessage('moveTo', { port: 47083 })).toEqual({ v: 2, type: 'moveTo', port: 47083 })
    expect(commandMessage('reload')).toEqual({ v: 2, type: 'reload' })
    expect(commandMessage('apagar')).toBeNull()
  })
})

describe('palco-discovery', () => {
  it('lê a /24 e ignora loopback', () => {
    expect(subnetPrefix('192.168.0.130')).toBe('192.168.0')
    expect(subnetPrefix('127.0.0.1')).toBeNull()
    expect(subnetPrefix('x')).toBeNull()
    // Só rede privada: IP público não vira varredura de 254 endereços.
    expect(subnetPrefix('10.0.0.7')).toBe('10.0.0')
    expect(subnetPrefix('172.20.1.5')).toBe('172.20.1')
    expect(subnetPrefix('8.8.8.8')).toBeNull()
    expect(subnetPrefix('172.32.0.1')).toBeNull()
    expect(subnetPrefix('192.168.0.300')).toBeNull()
  })

  it('reconhece TV LG pela resposta DIAL', () => {
    expect(parseDial('<root>urn:lge:device:tv:1<friendlyName>Sala</friendlyName></root>')).toBe('Sala')
    expect(parseDial('<root>urn:lge:device:tv:1</root>')).toBe('LG webOS TV')
    expect(parseDial('<root>outro</root>')).toBeNull()
  })

  it('acha LG e Android TV na rede, sem as já conectadas', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.startsWith('http://10.1.2.20:')
      ? new Response('urn:lge:device:tv <friendlyName>LG Púlpito</friendlyName>')
      : new Response('', { status: 404 }))
    const tcpImpl = vi.fn(async (ip: string) => ip === '10.1.2.30' || ip === '10.1.2.40')
    const tvs = await discoverTvs('10.1.2.5', { exclude: ['10.1.2.40'], fetchImpl, tcpImpl })
    expect(tvs).toEqual([
      { ip: '10.1.2.20', name: 'LG Púlpito', platform: 'webos', canWake: false },
      { ip: '10.1.2.30', name: 'Android TV', platform: 'androidtv', canWake: true },
    ])
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('10.1.2.5:'), expect.anything())
  })
})

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

const settle = () => new Promise(resolve => setTimeout(resolve, 80))

describe('PalcoSlot: TVs conectadas', () => {
  let slot: any
  const sockets: WebSocket[] = []

  beforeEach(async () => {
    setTransmissionState({ bind: 'local', requireToken: false })
    slot = new PalcoSlot('t', 'Principal', await freePort(), await freePort(), () => null)
    await slot.start()
  })
  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.close()
    await slot.dispose()
    setTransmissionState({ bind: 'all', requireToken: true })
  })

  async function receiver(hello?: Record<string, unknown>, ua = LG_UA) {
    const ws = new WebSocket(`ws://127.0.0.1:${slot.wsPort}/palco`, { headers: { 'User-Agent': ua } })
    sockets.push(ws)
    const got: any[] = []
    ws.on('message', raw => {
      const m = JSON.parse(String(raw))
      if (!['youare', 'overlayStyle'].includes(m.type)) got.push(m)
    })
    await new Promise(resolve => ws.once('open', resolve))
    if (hello) ws.send(JSON.stringify({ v: 2, type: 'hello', role: 'tv', ...hello }))
    await settle()
    return { ws, got }
  }

  it('/status libera CORS: a TV (página file://) precisa ler para achar o computador', async () => {
    const res = await fetch(`http://127.0.0.1:${slot.httpPort}/status`, { headers: { Origin: 'null' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toMatchObject({ unlocked: true, wsPort: slot.wsPort })
  })

  it('lista as TVs com o hello e troca a conexão antiga da mesma TV', async () => {
    await receiver({ platform: 'webos', id: 'x1', version: '0.3.1', name: 'TV do púlpito' })
    await receiver({ platform: 'webos', id: 'x1', version: '0.3.1' })
    await receiver({ platform: 'webos', id: 'x2' })
    await settle()
    const list = slot.clients()
    expect(list.map((c: any) => c.id).sort()).toEqual(['x1', 'x2'])
    expect(list.find((c: any) => c.id === 'x1')).toMatchObject({ platform: 'webos', version: '0.3.1', muted: false })
  })

  it('manda comando só para a TV escolhida e renomeia na lista', async () => {
    const a = await receiver({ platform: 'webos', id: 'a' })
    const b = await receiver({ platform: 'tizen', id: 'b' }, 'Mozilla/5.0 (Tizen 6.0)')
    const uid = slot.clients().find((c: any) => c.id === 'a').uid
    expect(slot.sendToClient(uid, 'rename', { name: 'TV da entrada' })).toBe(true)
    expect(slot.sendToClient(uid, 'identify')).toBe(true)
    expect(slot.sendToClient('nao-existe', 'reload')).toBe(false)
    await settle()
    expect(a.got.map(m => m.type)).toEqual(['rename', 'identify'])
    expect(a.got[1]).toMatchObject({ name: 'TV da entrada', slotLabel: 'Principal' })
    expect(b.got).toEqual([])
    expect(slot.clients().find((c: any) => c.id === 'a').name).toBe('TV da entrada')
  })

  it('TV desmarcada vai para a espera e, remarcada, recebe a cena atual', async () => {
    const a = await receiver({ platform: 'webos', id: 'm1' })
    const b = await receiver({ platform: 'webos', id: 'm2' })
    const uid = slot.clients().find((c: any) => c.id === 'm1').uid
    setMutedKey('m1', true)
    slot.applyMute(uid)
    slot.send({ v: 2, type: 'projection', text: 'Maranata' })
    await settle()
    expect(a.got.map(m => m.type)).toEqual(['idle'])
    expect(b.got.map(m => m.type)).toEqual(['projection'])
    expect(slot.clients().find((c: any) => c.id === 'm1').muted).toBe(true)

    setMutedKey('m1', false)
    slot.applyMute(uid)
    await settle()
    expect(a.got.at(-1)).toMatchObject({ type: 'projection', text: 'Maranata' })
  })

  it('projeção independente: a TV fixada sai da transmissão e recebe só o que vier para ela', async () => {
    const a = await receiver({ platform: 'webos', id: 'p1' })
    const b = await receiver({ platform: 'webos', id: 'p2' })
    const uid = slot.clients().find((c: any) => c.id === 'p1').uid
    slot.send({ v: 2, type: 'projection', text: 'Hino' })
    setPinnedKey('p1', true)
    expect(slot.clients().find((c: any) => c.id === 'p1').pinned).toBe(true)
    slot.send({ v: 2, type: 'projection', text: 'Outro hino' })
    expect(slot.send({ v: 2, type: 'projection', scope: 'bible', text: 'Gn 1:1' }, uid)).toBe(true)
    expect(slot.send({ v: 2, type: 'projection', text: 'x' }, 'sumiu')).toBe(false)
    await settle()
    expect(a.got.map(m => m.text)).toEqual(['Hino', 'Gn 1:1'])
    expect(b.got.map(m => m.text)).toEqual(['Hino', 'Outro hino'])

    setPinnedKey('p1', false)
    slot.applyMute(uid)
    await settle()
    expect(a.got.at(-1)).toMatchObject({ text: 'Outro hino' })
  })

  it('alvo "slot#uid" separa a transmissão da TV', () => {
    expect(parseTarget('47082#c9')).toEqual({ slotId: '47082', uid: 'c9' })
    expect(parseTarget('0')).toEqual({ slotId: '0', uid: null })
    expect(parseTarget(undefined)).toEqual({ slotId: '0', uid: null })
  })

  it('navegador/OBS não entram na marca nem na troca de conexão', async () => {
    await receiver(undefined, 'Mozilla/5.0 (X11; Linux) Chrome')
    await receiver(undefined, 'Mozilla/5.0 (X11; Linux) Chrome')
    const list = slot.clients()
    expect(list).toHaveLength(2)
    setMutedKey(muteKey(list[0]), true)
    expect(slot.clients().every((c: any) => c.muted === false)).toBe(true)
    setMutedKey(muteKey(list[0]), false)
  })
})
