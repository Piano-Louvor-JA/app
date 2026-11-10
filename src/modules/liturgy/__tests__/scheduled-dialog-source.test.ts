// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  bridge: vi.fn(),
  catalog: vi.fn(),
  episodes: vi.fn(),
  locale: { value: 'pt-BR' },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: mocks.locale }),
}))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))
vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge: mocks.bridge }))
vi.mock('@shared/services/user-preferences', () => ({ getUserPreference: (_key: string, fallback: unknown) => fallback, setUserPreference: vi.fn() }))
vi.mock('@modules/sync/services/sync-outbox-service', () => ({ enqueueOperatorState: vi.fn(), scheduleOutboxFlush: vi.fn() }))
vi.mock('../services/liturgy-catalog', () => ({ loadLiturgyMusicOptions: mocks.catalog, filterLiturgyMusicOptions: (items: unknown[]) => items }))
vi.mock('../services/provai-e-vede-source', () => ({ extractProvaiEVedeEpisodes: mocks.episodes }))

import Dialog from '../components/LiturgyScheduledDialog.vue'
import { useScheduledStore } from '../stores/useScheduledStore'

let wrapper: VueWrapper
function open() {
  wrapper = mount(Dialog, { props: { open: true }, global: { stubs: { teleport: true } } })
  return wrapper
}
async function clickText(text: string) {
  const button = wrapper.findAll('button').find(b => b.text() === text)
  expect(button, text).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
const pvSourceSelect = () => wrapper.get('.scheduled-dialog__pv-source select')
const fetchButton = () => wrapper.findAll('button').find(b => b.text() === 'liturgy.messages.scheduledFetchProvai')!

async function withRotation() {
  await open()
  await flushPromises()
  await wrapper.get('.scheduled-dialog__new-rot input').setValue('Programação')
  await wrapper.get('.scheduled-dialog__new-rot').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.locale.value = 'pt-BR'
  mocks.bridge.mockReturnValue(null)
  mocks.catalog.mockResolvedValue([])
  mocks.episodes.mockReturnValue([{ dateISO: '2099-10-03', title: 'Episódio', url: 'https://example.org/episode.mp4' }])
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<html />' }))
})

afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('seletor de edição PT/ES no diálogo (RF-03/04/05, ADR-02/04)', () => {
  function createRotation() {
    wrapper.get('.scheduled-dialog__new-rot input').setValue('Programação')
    wrapper.get('.scheduled-dialog__new-rot').trigger('submit')
    return flushPromises()
  }

  it('select tem somente as duas edições oficiais PT e ES (sem opção EN/FR fictícia)', async () => {
    await withRotation()
    const options = pvSourceSelect().findAll('option').map(o => o.element.value)
    expect(options).toEqual(['pt', 'es'])
  })

  it.each([
    ['pt-BR', 'pt'],
    ['en', 'pt'],
    ['es', 'es'],
    ['es-AR', 'es'],
  ])('ao abrir com locale %j, valor inicial é %j', async (locale, expected) => {
    mocks.locale.value = locale
    await withRotation()
    expect(pvSourceSelect().element.value).toBe(expected)
  })

  it('busca usa o trimestre atual do ano corrente resolvido no registry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20))
    const fetchText = vi.fn().mockResolvedValue('<html />')
    mocks.bridge.mockReturnValue({ workspace: { fetchText, downloadToMedia: vi.fn().mockResolvedValue('/m/e.mp4') } })
    try {
      await open(); await flushPromises()
      await clickText('liturgy.messages.scheduledPvOneClick')
      expect(fetchText).toHaveBeenCalledWith(
        'https://downloads.adventistas.org/pt/mordomia-crista/video/provai-e-vede-2026-4o-trimestre',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('trocar o seletor para ES altera a URL buscada e cria rotação Probad y Ved', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20))
    const fetchText = vi.fn().mockResolvedValue('<html />')
    const downloadToMedia = vi.fn().mockResolvedValue('/m/es.mp4')
    mocks.bridge.mockReturnValue({ workspace: { fetchText, downloadToMedia } })
    try {
      await withRotation()
      await pvSourceSelect().setValue('es')
      await clickText('liturgy.messages.scheduledPvOneClick')
      expect(fetchText).toHaveBeenCalledWith(
        'https://downloads.adventistas.org/es/mayordomia-cristiana/video/probad-y-ved-2026-4er-trimestre-2026/',
      )
      const store = useScheduledStore()
      expect(store.categories.find(c => c.name === 'Probad y Ved')).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fonte null (ano/quarter fora do catálogo) não executa fetch nem altera o store', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2027, 0, 10)) // ano 2027 → registry null
    const fetchText = vi.fn().mockResolvedValue('<html />')
    mocks.bridge.mockReturnValue({ workspace: { fetchText, downloadToMedia: vi.fn() } })
    try {
      await open(); await flushPromises()
      await clickText('liturgy.messages.scheduledPvOneClick')
      expect(fetchText).not.toHaveBeenCalled()
      expect(useScheduledStore().items).toHaveLength(0)
      expect(wrapper.text()).toContain('liturgy.messages.scheduledPvUnavailable')
      const button = wrapper.findAll('button').find(b => b.text() === 'liturgy.messages.scheduledPvOneClick')!
      expect(button.attributes('disabled')).toBeUndefined() // busy liberado
    } finally {
      vi.useRealTimers()
    }
  })

  it('busca da lista (fetch provai) também respeita o seletor ES', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10)) // Q2
    const fetchText = vi.fn().mockResolvedValue('<html />')
    mocks.bridge.mockReturnValue({ workspace: { fetchText, downloadToMedia: vi.fn().mockResolvedValue('/m/e.mp4') } })
    try {
      await open(); await flushPromises()
      await createRotation()
      await pvSourceSelect().setValue('es')
      await fetchButton().trigger('click')
      await flushPromises()
      expect(fetchText).toHaveBeenCalledWith(
        'https://downloads.adventistas.org/es/mayordomia-cristiana/video/probad-y-ved-2026-2do-trimestre-2026/',
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
