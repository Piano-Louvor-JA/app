// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ptBR from '../../locales/pt-BR'
import type { FoundTv, PalcoClient, PalcoSlotSummary } from '../../services/palco-clients'

const svc = vi.hoisted(() => ({
  available: true,
  tvs: [] as PalcoClient[],
  slots: [] as PalcoSlotSummary[],
  found: { ownIp: '192.168.0.10' as string | null, tvs: [] as FoundTv[] },
  changed: null as null | (() => void),
  unsubscribe: vi.fn(),
  sendPalcoCommand: vi.fn(async () => true),
  setPalcoTvMuted: vi.fn(async () => true),
  wakePalcoTv: vi.fn(async () => true),
}))
vi.mock('../../services/palco-clients', () => ({
  hasPalcoClients: () => svc.available,
  listPalcoTvs: vi.fn(async () => svc.tvs.map(tv => ({ ...tv }))),
  listRunningSlots: vi.fn(async () => svc.slots),
  discoverPalcoTvs: vi.fn(async () => svc.found),
  onPalcoClientsChanged: (cb: () => void) => { svc.changed = cb; return svc.unsubscribe },
  sendPalcoCommand: svc.sendPalcoCommand,
  setPalcoTvMuted: svc.setPalcoTvMuted,
  wakePalcoTv: svc.wakePalcoTv,
}))

import PalcoView from '../PalcoView.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': { ...ptBR, common: { cancel: 'Cancelar' } } } })

const tv = (extra: Partial<PalcoClient> = {}): PalcoClient => ({
  uid: 'u1', slotId: '0', slotLabel: 'Principal', ip: '192.168.0.20', platform: 'webos',
  name: 'TV LG (webOS)', version: '0.3.1', id: 'a', muted: false, ...extra,
})

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/palco', name: 'settings-palco', component: PalcoView },
      { path: '/transmission', name: 'settings-transmission', component: { template: '<div />' } },
    ],
  })
  await router.push('/palco')
  const wrapper = mount(PalcoView, { attachTo: document.body, global: { plugins: [i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="settings-header-aside"></div>'
  svc.available = true
  svc.tvs = [tv(), tv({ uid: 'u2', slotId: '47082', slotLabel: 'TV da sala', ip: '192.168.0.21', platform: 'androidtv', name: 'TV da entrada', id: 'b' })]
  svc.slots = [{ id: '0', label: 'Principal', running: true }, { id: '47082', label: 'TV da sala', running: true }]
  svc.found = { ownIp: '192.168.0.10', tvs: [] }
  svc.changed = null
})
afterEach(() => { document.body.innerHTML = '' })

describe('PalcoView', () => {
  it('fora do app desktop só avisa', async () => {
    svc.available = false
    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('O Palco está disponível no app para computador.')
    expect(svc.changed).toBeNull()
  })

  it('sem transmissão no ar oferece ligar e leva à aba Transmissão', async () => {
    svc.slots = []
    svc.tvs = []
    const { wrapper, router } = await mountView()
    expect(wrapper.text()).toContain('Nenhuma transmissão no ar')
    expect(wrapper.text()).toContain('Ligue uma transmissão para as TVs conectarem.')
    await wrapper.get('[data-test="palco-open-transmission"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('settings-transmission')
  })

  it('lista as TVs com IP, transmissão, versão e marca', async () => {
    svc.tvs[1]!.muted = true
    const { wrapper } = await mountView()
    const rows = wrapper.findAll('.palco-view__row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('192.168.0.20 · Principal · v0.3.1')
    expect(rows[1]!.text()).toContain('na espera')
    expect((wrapper.get('[data-test="palco-check-u2"]').element as HTMLInputElement).checked).toBe(false)

    await wrapper.get('[data-test="palco-check-u1"]').trigger('change')
    await flushPromises()
    expect(svc.setPalcoTvMuted).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), true)
  })

  it('menu: identificar, mover para a outra transmissão e recarregar', async () => {
    const { wrapper } = await mountView()
    await wrapper.get('[data-test="palco-menu-u1"]').trigger('click')
    expect(wrapper.find('[data-test="palco-move-0"]').exists()).toBe(false)
    await wrapper.get('[data-test="palco-identify"]').trigger('click')
    await flushPromises()
    expect(svc.sendPalcoCommand).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), 'identify')
    expect(wrapper.text()).toContain('Olhe as TVs: o nome aparece em TV LG (webOS).')

    await wrapper.get('[data-test="palco-menu-u1"]').trigger('click')
    await wrapper.get('[data-test="palco-move-47082"]').trigger('click')
    await flushPromises()
    expect(svc.sendPalcoCommand).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), 'moveTo', { targetSlotId: '47082' })
    expect(wrapper.text()).toContain('TV LG (webOS) vai para TV da sala.')

    svc.sendPalcoCommand.mockResolvedValueOnce(false)
    await wrapper.get('[data-test="palco-menu-u1"]').trigger('click')
    await wrapper.get('[data-test="palco-reload"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Essa TV saiu da transmissão.')
  })

  it('renomear abre o diálogo e manda o nome novo', async () => {
    const { wrapper } = await mountView()
    await wrapper.get('[data-test="palco-menu-u1"]').trigger('click')
    await wrapper.get('[data-test="palco-rename"]').trigger('click')
    await flushPromises()
    const input = document.querySelector('[data-test="palco-rename-input"]') as HTMLInputElement
    expect(input.value).toBe('TV LG (webOS)')
    input.value = 'TV do púlpito'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(document.querySelector('[data-test="palco-rename-confirm"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(svc.sendPalcoCommand).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), 'rename', { name: 'TV do púlpito' })
    expect(wrapper.text()).toContain('TV renomeada para TV do púlpito.')
    expect(document.querySelector('[data-test="palco-rename-input"]')).toBeNull()
  })

  it('TV sem hello (app antigo) mostra as ações desligadas', async () => {
    svc.tvs = [tv({ version: null })]
    const { wrapper } = await mountView()
    await wrapper.get('[data-test="palco-menu-u1"]').trigger('click')
    expect(wrapper.text()).toContain('Atualize o app Palco nesta TV')
    expect(wrapper.get('[data-test="palco-identify"]').attributes('disabled')).toBeDefined()
  })

  it('detectadas na rede: tira as conectadas e abre o Palco na Android TV', async () => {
    svc.found = {
      ownIp: '192.168.0.10',
      tvs: [
        { ip: '192.168.0.20', name: 'LG', platform: 'webos', canWake: false },
        { ip: '192.168.0.30', name: 'Android TV', platform: 'androidtv', canWake: true },
        { ip: '192.168.0.31', name: 'LG Sala', platform: 'webos', canWake: false },
      ],
    }
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-test="palco-found-192.168.0.20"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="palco-found-192.168.0.31"]').text()).toContain('Abra o app Palco pelo controle')
    await wrapper.get('[data-test="palco-wake-192.168.0.30"]').trigger('click')
    await flushPromises()
    expect(svc.wakePalcoTv).toHaveBeenCalledWith('192.168.0.30')
    expect(wrapper.text()).toContain('Abrindo o Palco em Android TV…')

    svc.wakePalcoTv.mockResolvedValueOnce(false)
    await wrapper.get('[data-test="palco-wake-192.168.0.30"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Abra o app Palco na TV pelo controle remoto.')
  })

  it('mostra e copia o IP do computador; Procurar TVs varre de novo', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const { wrapper } = await mountView()
    expect(wrapper.get('.palco-view__ip').text()).toContain('192.168.0.10')
    await wrapper.get('[data-test="palco-copy-ip"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('192.168.0.10')
    const scanButton = document.querySelector('[data-test="palco-scan"]') as HTMLButtonElement
    expect(scanButton).not.toBeNull()
    scanButton.click()
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhuma outra TV encontrada')
  })

  it('atualiza quando uma TV conecta e para de ouvir ao sair', async () => {
    const { wrapper } = await mountView()
    svc.tvs = [tv()]
    svc.changed?.()
    await flushPromises()
    expect(wrapper.findAll('.palco-view__row')).toHaveLength(1)
    wrapper.unmount()
    expect(svc.unsubscribe).toHaveBeenCalled()
  })
})
