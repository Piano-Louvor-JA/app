// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const palco = vi.hoisted(() => ({
  tvs: [] as Array<Record<string, unknown>>,
  changed: null as null | (() => void),
}))
vi.mock('@modules/settings/services/palco-clients', () => ({
  hasPalcoClients: () => true,
  listPalcoTvs: vi.fn(async () => palco.tvs),
  onPalcoClientsChanged: (cb: () => void) => {
    palco.changed = cb
    return () => {}
  },
}))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => ({}),
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join('|')}` : key,
  }),
}))

import ConnectedDevicesButton from '../ConnectedDevicesButton.vue'

describe('ConnectedDevicesButton', () => {
  beforeEach(() => {
    palco.tvs = []
    palco.changed = null
  })

  it('lista as TVs do Palco e conta no círculo', async () => {
    palco.tvs = [
      { uid: 'u1', slotId: '0', slotLabel: 'Palco', ip: '192.168.0.50', platform: 'webos', name: 'TV da entrada' },
      { uid: 'u2', slotId: '0', slotLabel: 'Palco', ip: '192.168.0.51', platform: 'androidtv', name: 'TV do púlpito' },
    ]
    const wrapper = mount(ConnectedDevicesButton)
    await flushPromises()
    expect(wrapper.find('.connected-devices__badge').text()).toBe('2')
    await wrapper.find('.connected-devices__circle').trigger('click')
    const text = wrapper.find('.connected-devices__panel').text()
    expect(text).toContain('connectedDevices.palco')
    expect(text).toContain('TV da entrada')
    expect(text).toContain('192.168.0.50')
    expect(text).toContain('TV do púlpito')
  })

  it('atualiza quando uma TV entra ou sai', async () => {
    const wrapper = mount(ConnectedDevicesButton)
    await flushPromises()
    await wrapper.find('.connected-devices__circle').trigger('click')
    expect(wrapper.find('[data-test="palco-devices"]').text()).toContain('connectedDevices.none')
    palco.tvs = [{ uid: 'u1', slotId: '0', slotLabel: 'Palco', ip: '10.0.0.5', platform: 'tizen', name: 'Samsung' }]
    palco.changed?.()
    await flushPromises()
    expect(wrapper.find('[data-test="palco-devices"]').text()).toContain('Samsung')
    expect(wrapper.find('.connected-devices__badge').text()).toBe('1')
  })
})
