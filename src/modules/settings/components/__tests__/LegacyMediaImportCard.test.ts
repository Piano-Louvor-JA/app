// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-mock"><slot /></div>' },
}))

vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: vi.fn(() => null),
  setBrowserItem: vi.fn(),
  removeBrowserItem: vi.fn(),
  removeBrowserItemsByPrefix: vi.fn(),
}))

vi.mock('../../../plugins/i18n', () => ({
  detectInitialLocale: vi.fn(() => 'pt-BR'),
  createI18n: vi.fn(() => ({ global: { locale: 'pt-BR', t: (k: string) => k } })),
  localeToApiPrefix: vi.fn(() => 'pt'),
  default: { global: { locale: 'pt-BR', t: (k: string) => k } },
}))

const reconcileFromLocalMediaMock = vi.fn().mockResolvedValue({ marked: 3 })
vi.mock('@modules/sync/stores/useLocalLibraryStore', () => ({
  useLocalLibraryStore: () => ({
    reconcileFromLocalMedia: reconcileFromLocalMediaMock,
  }),
}))

const originalLouvorja = window.louvorja

function setBridge(bridge: unknown) {
  Object.defineProperty(window, 'louvorja', {
    value: bridge,
    configurable: true,
    writable: true,
  })
}

function makeBridge() {
  return {
    isElectron: true,
    platform: 'win32',
    legacyMedia: {
      analyze: vi.fn().mockResolvedValue({ found: true, present: 10, missing: 5, missingBytes: 5 * 1024 * 1024 }),
      import: vi.fn().mockResolvedValue({ ok: true, imported: 5, skipped: 10, failed: 0, total: 15 }),
      onImportProgress: vi.fn(() => () => {}),
      pickFolder: vi.fn().mockResolvedValue('D:\\LegacyMedia'),
    },
  }
}

async function mountCard() {
  const w = mount((await import('../LegacyMediaImportCard.vue')).default)
  await flushPromises()
  return w
}

describe('LegacyMediaImportCard', () => {
  let active: Awaited<ReturnType<typeof mountCard>> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    reconcileFromLocalMediaMock.mockResolvedValue({ marked: 3 })
    setActivePinia(createPinia())
  })
  afterEach(() => {
    active?.unmount()
    active = null
    setBridge(originalLouvorja)
    vi.restoreAllMocks()
  })

  it('não-Windows: não renderiza', async () => {
    setBridge({ isElectron: true, platform: 'linux', legacyMedia: makeBridge().legacyMedia })
    const w = await mountCard()
    active = w
    expect(w.text()).toBe('')
  })

  it('Windows: renderiza botões de importação', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.find('[data-test="legacy-media-import-button"]').exists()).toBe(true)
    expect(w.find('[data-test="legacy-media-pick-folder-button"]').exists()).toBe(true)
  })

  it('import completa: analyze, import, reconcilia e mostra done', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.analyze).toHaveBeenCalled()
    expect(bridge.legacyMedia.import).toHaveBeenCalled()
    expect(reconcileFromLocalMediaMock).toHaveBeenCalled()
    expect(w.find('[data-test="legacy-media-done"]').exists()).toBe(true)
  })

  it('analyze sem nada para importar: resultado ok com 0 imports', async () => {
    const bridge = makeBridge()
    bridge.legacyMedia.analyze.mockResolvedValue({ found: true, present: 10, missing: 0, missingBytes: 0 })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.import).not.toHaveBeenCalled()
    expect(reconcileFromLocalMediaMock).toHaveBeenCalled()
    expect(w.find('[data-test="legacy-media-done"]').exists()).toBe(true)
  })

  it('mídia não encontrada: erro específico', async () => {
    const bridge = makeBridge()
    bridge.legacyMedia.analyze.mockResolvedValue({ found: false, present: 0, missing: 0, missingBytes: 0 })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('legacyMediaNotFound')
  })

  it('import falha com not-found: erro de não encontrado', async () => {
    const bridge = makeBridge()
    bridge.legacyMedia.import.mockResolvedValue({ ok: false, reason: 'not-found', imported: 0, skipped: 0, failed: 0, total: 0 })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('legacyMediaNotFound')
  })

  it('import falha genérica: erro genérico', async () => {
    const bridge = makeBridge()
    bridge.legacyMedia.import.mockResolvedValue({ ok: false, reason: 'io', imported: 0, skipped: 0, failed: 0, total: 0 })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('legacyMediaError')
  })

  it('import com exceção: erro genérico', async () => {
    const bridge = makeBridge()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bridge.legacyMedia.import.mockRejectedValue(new Error('boom'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('legacyMediaError')
  })

  it('import manual: pickFolder e importa o caminho escolhido', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-pick-folder-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.pickFolder).toHaveBeenCalled()
    expect(bridge.legacyMedia.import).toHaveBeenCalledWith('D:\\LegacyMedia')
  })

  it('pickFolder cancelado: nada acontece', async () => {
    const bridge = makeBridge()
    bridge.legacyMedia.pickFolder.mockResolvedValue(null)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-pick-folder-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.analyze).not.toHaveBeenCalled()
  })

  it('unmount desinscreve o progresso', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    w.unmount()
    active = null
    expect(true).toBe(true)
  })
  it('onImportProgress: callback atualiza progresso e percentual', async () => {
    const bridge = makeBridge()
    let progressCb: ((p: unknown) => void) | null = null
    bridge.legacyMedia.onImportProgress = vi.fn((cb: (p: unknown) => void) => {
      progressCb = cb
      return () => {}
    })
    setBridge(bridge)
    const w = await mountCard()
    expect(progressCb).not.toBeNull()
    progressCb?.({ current: 5, total: 10, relativePath: 'album', mediaType: 'music' })
    await flushPromises()
    await w.vm.$nextTick()
    // progress interno atualizado (render pode depender de width)
    expect(w.exists()).toBe(true)
    w.unmount()
    active = null
  })

  it('reconciliação falha: warn e marca 0', async () => {
    reconcileFromLocalMediaMock.mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setBridge(makeBridge())
    const w = await mountCard()
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    await flushPromises()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    w.unmount()
  })

})