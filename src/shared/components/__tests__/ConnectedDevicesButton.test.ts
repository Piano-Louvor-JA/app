// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const palco = vi.hoisted(() => ({
  tvs: [] as Array<Record<string, unknown>>,
  sources: [] as Array<Record<string, unknown>>,
  changed: null as null | (() => void),
}))
vi.mock('@modules/settings/services/palco-clients', () => ({
  hasPalcoClients: () => true,
  listPalcoTvs: vi.fn(async () => palco.tvs),
  listTransmissionClients: vi.fn(async () => palco.sources),
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
    palco.sources = []
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

  it('agrupa as Transmissões por conexão e página, com abas, OBS/navegador e IPs', async () => {
    palco.sources = [
      { uid: 's1', slotId: '0', slotLabel: 'Principal', ip: '192.168.0.60', platform: 'obs', name: 'OBS', page: 'espelho' },
      { uid: 's2', slotId: '0', slotLabel: 'Principal', ip: '192.168.0.61', platform: 'browser', name: 'Navegador', page: 'espelho' },
      { uid: 's3', slotId: '0', slotLabel: 'Principal', ip: '192.168.0.61', platform: 'browser', name: 'Navegador', page: 'espelho' },
      { uid: 's4', slotId: '47082', slotLabel: 'Telão', ip: '192.168.0.62', platform: 'browser', name: 'Navegador', page: 'retorno' },
      { uid: 's5', slotId: '0', slotLabel: 'Principal', ip: '192.168.0.63', platform: 'obs', name: 'OBS' },
    ]
    const wrapper = mount(ConnectedDevicesButton)
    await flushPromises()
    // o círculo conta cada aba
    expect(wrapper.find('.connected-devices__badge').text()).toBe('5')
    await wrapper.find('.connected-devices__circle').trigger('click')
    const mirror = wrapper.find('[data-test="transmission-0|espelho"]').text()
    expect(mirror).toContain('Principal|connectedDevices.pages.espelho|connectedDevices.tabs:3')
    expect(mirror).toContain('connectedDevices.inObs:1connectedDevices.andconnectedDevices.inBrowser:2 · 192.168.0.60, 192.168.0.61')
    const back = wrapper.find('[data-test="transmission-47082|retorno"]').text()
    expect(back).toContain('Telão|connectedDevices.pages.retorno|connectedDevices.tabs:1')
    expect(back).toContain('connectedDevices.inBrowser:1 · 192.168.0.62')
    // aba antiga, sem página informada
    expect(wrapper.find('[data-test="transmission-0|"]').text()).toContain('connectedDevices.pages.other')
  })
})
