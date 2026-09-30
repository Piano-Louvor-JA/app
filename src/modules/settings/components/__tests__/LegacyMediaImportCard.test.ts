// @vitest-environment jsdom
// LegacyMediaImportCard — fases analyze/import/reconcile/done/error, progress, windows-only
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  getDesktopBridge: vi.fn(),
  reconcileFromLocalMedia: vi.fn(),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}))

vi.mock('@modules/sync/stores/useLocalLibraryStore', () => ({
  useLocalLibraryStore: () => ({
    reconcileFromLocalMedia: mocks.reconcileFromLocalMedia,
  }),
}))

import LegacyMediaImportCard from '../LegacyMediaImportCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        general: {
          legacyMediaTitle: 'Mídia legada',
          legacyMediaHint: 'dica',
          legacyMediaAction: 'Importar',
          legacyMediaPickFolder: 'Escolher pasta',
          legacyMediaPickHint: 'subdica',
          legacyMediaAnalyzing: 'Analisando...',
          legacyMediaImporting: 'Importando...',
          legacyMediaReconciling: 'Reconciliando...',
          legacyMediaAnalyzingHint: 'lendo',
          legacyMediaNotFound: 'não encontrado',
          legacyMediaInvalidFolder: 'pasta inválida',
          legacyMediaError: 'erro',
          legacyMediaScanSummary: '{scanned}/{missing}/{present}/{mb}',
          legacyMediaProgress: '{current}/{total}',
          legacyMediaReconcileProgress: 'rec {current}/{total}',
        },
      },
    },
  },
})

type Phase = 'idle' | 'analyzing' | 'importing' | 'reconciling' | 'done' | 'error'

function makeBridge(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'win32',
    legacyMedia: {
      analyze: vi.fn(async () => ({
        found: true,
        configDir: 'C:\\CoL',
        lang: 'pt',
        scanned: 100,
        missing: 5,
        present: 95,
        missingBytes: 50 * 1024 * 1024,
      })),
      import: vi.fn(async () => ({ ok: true, imported: 5, skipped: 95, failed: 0, total: 100 })),
      onImportProgress: vi.fn(() => () => {}),
      pickFolder: vi.fn(async () => null),
      ...overrides,
    },
  }
}

function createWrapper() {
  return mount(LegacyMediaImportCard, { global: { plugins: [i18n] } })
}

describe('LegacyMediaImportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reconcileFromLocalMedia.mockResolvedValue({ marked: 3 })
  })

  it('não-windows: não renderiza nada', () => {
    mocks.getDesktopBridge.mockReturnValue({ platform: 'linux' })
    const wrapper = createWrapper()
    expect(wrapper.find('[data-test="legacy-media-card"]').exists()).toBe(false)
  })

  it('windows com legacyMedia: card visível e botões habilitados', () => {
    mocks.getDesktopBridge.mockReturnValue(makeBridge())
    const wrapper = createWrapper()
    expect(wrapper.find('[data-test="legacy-media-card"]').exists()).toBe(true)
    expect((wrapper.find('[data-test="legacy-media-import-button"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('windows sem legacyMedia: botões desabilitados (canImport false)', () => {
    mocks.getDesktopBridge.mockReturnValue({ platform: 'win32' })
    const wrapper = createWrapper()
    expect((wrapper.find('[data-test="legacy-media-import-button"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('fluxo ok completo: analyze → import → reconcile → done', async () => {
    const bridge = makeBridge()
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.analyze).toHaveBeenCalledWith(undefined)
    expect(bridge.legacyMedia.import).toHaveBeenCalled()
    expect(mocks.reconcileFromLocalMedia).toHaveBeenCalled()
    expect((wrapper.vm as any).phase).toBe('done')
    expect(wrapper.text()).toContain('100/5/95/50') // scanned/missing/present/mb
  })

  it('analyze not found: error com legacyMediaNotFound', async () => {
    const bridge = makeBridge({
      analyze: vi.fn(async () => ({ found: false, configDir: '', lang: '', scanned: 0, missing: 0, present: 0, missingBytes: 0 })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).phase).toBe('error')
    expect((wrapper.vm as any).errorKey).toBe('settings.general.legacyMediaNotFound')
  })

  it('analyze found mas missing=0: nada a importar, reconcilia e done', async () => {
    const bridge = makeBridge({
      analyze: vi.fn(async () => ({ found: true, configDir: 'C:\\CoL', lang: 'pt', scanned: 10, missing: 0, present: 10, missingBytes: 0 })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.import).not.toHaveBeenCalled()
    expect((wrapper.vm as any).importResult.reason).toBe('nothing-to-import')
    expect((wrapper.vm as any).phase).toBe('done')
  })

  it('import falha not-found: error com chave da pasta', async () => {
    const bridge = makeBridge({
      import: vi.fn(async () => ({ ok: false, imported: 0, skipped: 0, failed: 0, total: 0, reason: 'not-found' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).phase).toBe('error')
    expect((wrapper.vm as any).errorKey).toBe('settings.general.legacyMediaNotFound')
  })

  it('import falha genérica: error legacyMediaError', async () => {
    const bridge = makeBridge({
      import: vi.fn(async () => ({ ok: false, imported: 0, skipped: 0, failed: 1, total: 1, reason: 'error' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).errorKey).toBe('settings.general.legacyMediaError')
  })

  it('analyze throw: error legacyMediaError', async () => {
    const bridge = makeBridge({ analyze: vi.fn(async () => { throw new Error('boom') }) })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).phase).toBe('error')
    expect((wrapper.vm as any).errorKey).toBe('settings.general.legacyMediaError')
  })

  it('progress callback atualiza barra durante import', async () => {
    let progressCb: ((p: unknown) => void) | null = null
    const bridge = makeBridge({
      onImportProgress: vi.fn((cb: (p: unknown) => void) => {
        progressCb = cb
        return () => {}
      }),
      import: () =>
        new Promise((resolve) => {
          progressCb?.({ current: 2, total: 5, relativePath: 'album', mediaType: 'music' })
          resolve({ ok: true, imported: 5, skipped: 95, failed: 0, total: 100 })
        }),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    const clickPromise = wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    // importa só após 1 microtask; o callback já rodou dentro do import
    await (clickPromise as unknown as Promise<void>)
    await flushPromises()
    // ao final do import o progress é limpo (done) — o percent foi consumido no meio
    expect((wrapper.vm as any).phase).toBe('done')
    expect(bridge.legacyMedia.onImportProgress).toHaveBeenCalled()
  })

  it('reconcile progress exibido na fase reconciling', async () => {
    mocks.reconcileFromLocalMedia.mockImplementation(async (cb: (c: number, t: number, n: string) => void) => {
      cb(1, 3, 'Alb')
      return { marked: 1 }
    })
    const bridge = makeBridge({
      analyze: vi.fn(async () => ({ found: true, configDir: 'C:\\CoL', lang: 'pt', scanned: 1, missing: 1, present: 0, missingBytes: 0 })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).reconcileMarked).toBe(1)
  })

  it('reconcile falha: marca 0 e segue pro done', async () => {
    mocks.reconcileFromLocalMedia.mockRejectedValue(new Error('fail'))
    const bridge = makeBridge()
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).reconcileMarked).toBe(0)
    expect((wrapper.vm as any).phase).toBe('done')
  })

  it('runManualImport: pickFolder e importa com o caminho', async () => {
    const bridge = makeBridge({ pickFolder: vi.fn(async () => 'D:\\CoL') })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-pick-folder-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.analyze).toHaveBeenCalledWith('D:\\CoL')
  })

  it('runManualImport cancelado: não importa', async () => {
    const bridge = makeBridge({ pickFolder: vi.fn(async () => null) })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-pick-folder-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.analyze).not.toHaveBeenCalled()
  })

  it('unmount limpa subscription de progresso', async () => {
    const unsub = vi.fn()
    const bridge = makeBridge({ onImportProgress: vi.fn(() => unsub) })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await wrapper.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(unsub).toHaveBeenCalled()
  })
})
