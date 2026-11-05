// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const session = vi.hoisted(() => ({
  slots: vi.fn(),
  turnOn: vi.fn(async () => true),
  turnOff: vi.fn(async () => {}),
  startSlot: vi.fn(async () => true),
  stopSlot: vi.fn(async () => {}),
  setSlot: vi.fn(),
}))
vi.mock('../../services/palco-session', () => ({ palcoSession: session }))

import { refreshObsConnections, startObsConnection, stopObsConnection, useObsConnections } from '../useObsConnections'
import { obsConnections, OBS_CONNECTIONS_KEY } from '../../services/obs-connections'

const overlay = { layout: 'fullscreen', theme: 'light', position: 'bottom', textScale: 110, showHeading: true, accentColor: '#FFD54A' }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  obsConnections.value = []
})

it('lists the main source first with port, style, links and error from the main process', async () => {
  session.slots.mockResolvedValue([
    { id: '7082', label: 'OBS 2', running: false, clients: 0, httpPort: 9100, wsPort: 9101, error: { code: 'port-in-use', port: 9100, suggestedPort: 9102 } },
    { id: '0', label: 'Principal', running: true, clients: 2, httpPort: 7080, wsPort: 7081, overlay, overlayUrl: 'http://192.168.0.5:7080/overlay?token=AB12C', receiverUrl: 'http://192.168.0.5:7080/?token=AB12C', receiverIps: ['192.168.0.9'] },
  ])
  let state!: ReturnType<typeof useObsConnections>
  const wrapper = mount(defineComponent({ setup() { state = useObsConnections(); return () => h('div') } }))
  await refreshObsConnections()
  await nextTick()
  const [main, extra] = state.connections.value
  expect(main).toMatchObject({ id: '0', label: 'OBS 1', running: true, clients: 2, httpPort: 7080, overlay, overlayUrl: 'http://192.168.0.5:7080/overlay?token=AB12C', receiverUrl: 'http://192.168.0.5:7080/?token=AB12C', receiverIps: ['192.168.0.9'], error: null })
  expect(main).not.toHaveProperty('nickname')
  expect(extra).toMatchObject({ id: '7082', label: 'OBS 2', running: false, httpPort: 9100, error: { code: 'port-in-use', suggestedPort: 9102 }, overlayUrl: null })
  expect(extra.overlay).toMatchObject({ layout: 'lower-third', theme: 'dark' })
  wrapper.unmount()
})

it('keeps a nickname the operator already saved for the main source', async () => {
  localStorage.setItem(OBS_CONNECTIONS_KEY, JSON.stringify([{ id: '0', label: 'OBS 1', selected: true, nickname: 'Principal' }]))
  vi.resetModules()
  const fresh = await import('../../services/obs-connections')
  expect(fresh.obsConnections.value[0]).toMatchObject({ nickname: 'Principal' })
})

it('starts and stops the main source with its stage greeting and the others directly', async () => {
  expect(await startObsConnection('0')).toBe(true)
  expect(session.setSlot).toHaveBeenCalledWith('0')
  expect(session.turnOn).toHaveBeenCalledOnce()
  expect(await startObsConnection('7082')).toBe(true)
  expect(session.startSlot).toHaveBeenCalledWith('7082')
  await stopObsConnection('0')
  expect(session.turnOff).toHaveBeenCalledOnce()
  await stopObsConnection('7082')
  expect(session.stopSlot).toHaveBeenCalledWith('7082')
})
