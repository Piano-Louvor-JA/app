// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  discoverPalcoTvs,
  hasPalcoClients,
  isTvClient,
  listPalcoTvs,
  listRunningSlots,
  onPalcoClientsChanged,
  sendPalcoCommand,
  setPalcoTvMuted,
  wakePalcoTv,
  setPalcoTvPinned,
  palcoTvKey,
  palcoTvTarget,
  type PalcoClient,
} from '../palco-clients'

const tv = (extra: Partial<PalcoClient> = {}): PalcoClient => ({
  uid: 'u1', slotId: '0', slotLabel: 'Principal', ip: '10.0.0.5', platform: 'webos',
  name: 'TV LG (webOS)', version: '0.3.1', id: 'a', muted: false, ...extra,
})

function install(palco: Record<string, unknown> | undefined) {
  ;(window as unknown as { louvorja?: unknown }).louvorja = palco ? { palco } : undefined
}

afterEach(() => install(undefined))

describe('palco-clients sem o app desktop', () => {
  it('devolve listas vazias e falso sem quebrar', async () => {
    expect(hasPalcoClients()).toBe(false)
    expect(await listPalcoTvs()).toEqual([])
    expect(await listRunningSlots()).toEqual([])
    expect(await sendPalcoCommand(tv(), 'reload')).toBe(false)
    expect(await setPalcoTvMuted(tv(), true)).toBe(false)
    expect(await discoverPalcoTvs()).toEqual({ ownIp: null, tvs: [] })
    expect(await wakePalcoTv('10.0.0.9')).toBe(false)
    expect(await setPalcoTvPinned(tv(), true)).toBe(false)
    expect(typeof onPalcoClientsChanged(() => {})).toBe('function')
    expect(palcoTvKey(tv())).toBe('a')
    expect(palcoTvKey(tv({ id: null }))).toBe('10.0.0.5|webos')
    expect(palcoTvTarget(tv())).toBe('0#u1')
  })
})

describe('palco-clients no app desktop', () => {
  it('lista só TVs e só transmissões no ar', async () => {
    install({
      clients: vi.fn(async () => [tv(), tv({ uid: 'u2', platform: 'browser' }), tv({ uid: 'u3', platform: 'obs' })]),
      slots: vi.fn(async () => [
        { id: '0', label: 'Principal', running: true, clients: 2 },
        { id: '47082', label: 'Retorno', running: false, clients: 0 },
      ]),
    })
    expect(hasPalcoClients()).toBe(true)
    expect((await listPalcoTvs()).map(c => c.uid)).toEqual(['u1'])
    expect(await listRunningSlots()).toEqual([{ id: '0', label: 'Principal', running: true }])
    expect(isTvClient({ platform: 'androidtv' })).toBe(true)
    expect(isTvClient({ platform: 'obs' })).toBe(false)
  })

  it('repassa comandos, marca, descoberta e wake', async () => {
    const palco = {
      clients: vi.fn(),
      clientCommand: vi.fn(async () => true),
      setClientMuted: vi.fn(async () => true),
      setClientPinned: vi.fn(async () => true),
      discover: vi.fn(async () => ({ ownIp: '10.0.0.2', tvs: [] })),
      wakeTv: vi.fn(async () => true),
      onClientsChanged: vi.fn(() => () => {}),
    }
    install(palco)
    expect(await sendPalcoCommand(tv(), 'moveTo', { targetSlotId: '47082' })).toBe(true)
    expect(palco.clientCommand).toHaveBeenCalledWith('0', 'u1', 'moveTo', { targetSlotId: '47082' })
    expect(await setPalcoTvMuted(tv(), true)).toBe(true)
    expect(palco.setClientMuted).toHaveBeenCalledWith('0', 'u1', true)
    expect(await setPalcoTvPinned(tv(), true)).toBe(true)
    expect(palco.setClientPinned).toHaveBeenCalledWith('0', 'u1', true)
    expect(await discoverPalcoTvs()).toEqual({ ownIp: '10.0.0.2', tvs: [] })
    expect(await wakePalcoTv('10.0.0.9')).toBe(true)
    const cb = () => {}
    onPalcoClientsChanged(cb)
    expect(palco.onClientsChanged).toHaveBeenCalledWith(cb)
  })

  it('erro do IPC vira resposta neutra', async () => {
    const fail = vi.fn(async () => { throw new Error('ipc') })
    install({ clients: fail, slots: fail, clientCommand: fail, setClientMuted: fail, setClientPinned: fail, discover: fail, wakeTv: fail })
    expect(await listPalcoTvs()).toEqual([])
    expect(await listRunningSlots()).toEqual([])
    expect(await sendPalcoCommand(tv(), 'identify')).toBe(false)
    expect(await setPalcoTvMuted(tv(), false)).toBe(false)
    expect(await setPalcoTvPinned(tv(), false)).toBe(false)
    expect(await discoverPalcoTvs()).toEqual({ ownIp: null, tvs: [] })
    expect(await wakePalcoTv('x')).toBe(false)
  })
})
