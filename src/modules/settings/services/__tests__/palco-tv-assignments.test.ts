// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'

const pin = vi.hoisted(() => vi.fn(async () => true))
const share = vi.hoisted(() => vi.fn())
vi.mock('../palco-session', () => ({ palcoSession: { syncTvShare: (...args: unknown[]) => share(...(args as [])) } }))
vi.mock('../palco-clients', () => ({
  palcoTvTarget: (tv: { slotId: string; uid: string }) => `${tv.slotId}#${tv.uid}`,
  setPalcoTvPinned: (...args: unknown[]) => pin(...(args as [])),
  palcoTvKey: (tv: { id?: string | null; ip: string; platform: string }) => tv.id ? tv.id : `${tv.ip}|${tv.platform}`,
}))

import { assignPalcoTv, clearPalcoTvModule, tvAssignmentModes, tvAssignments } from '../palco-tv-assignments'
import type { PalcoClient } from '../palco-clients'

const tv = (extra: Partial<PalcoClient> = {}): PalcoClient => ({
  uid: 'u1', slotId: '0', slotLabel: 'Principal', ip: '10.0.0.5', platform: 'webos',
  name: 'TV', version: '0.3.1', id: 'a', muted: false, ...extra,
})

beforeEach(() => { tvAssignments.value = {}; tvAssignmentModes.value = {}; pin.mockClear(); share.mockClear() })

it('marca a TV no módulo, fixa no servidor e avisa a ponte', async () => {
  const changed = vi.fn()
  window.addEventListener('obs-connections-changed', changed)
  await assignPalcoTv(tv(), 'bible')
  expect(tvAssignments.value).toEqual({ a: 'bible' })
  expect(pin).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), true)
  expect(changed).toHaveBeenCalled()
  await assignPalcoTv(tv({ id: null }), 'clock')
  expect(tvAssignments.value).toEqual({ a: 'bible', '10.0.0.5|webos': 'clock' })
  window.removeEventListener('obs-connections-changed', changed)
})

it('encerrar o módulo solta só as TVs dele', async () => {
  tvAssignments.value = { a: 'clock', b: 'bible' }
  await clearPalcoTvModule('clock', [tv(), tv({ uid: 'u2', id: 'b' })])
  expect(tvAssignments.value).toEqual({ b: 'bible' })
  expect(pin).toHaveBeenCalledTimes(1)
  expect(pin).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), false)
})

it('compartilhar não tira a TV da transmissão; ao soltar, volta a tela inteira', async () => {
  await assignPalcoTv(tv(), 'bible', 'share')
  expect(tvAssignmentModes.value).toEqual({ a: 'share' })
  expect(pin).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), false)
  expect(share).not.toHaveBeenCalled()
  await assignPalcoTv(tv(), null)
  expect(tvAssignmentModes.value).toEqual({})
  expect(share).toHaveBeenCalledWith('0#u1', false)
})
