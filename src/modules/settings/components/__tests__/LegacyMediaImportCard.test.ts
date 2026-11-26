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

  it('macOS: não renderiza', async () => {
    setBridge({ isElectron: true, platform: 'darwin', legacyMedia: makeBridge().legacyMedia })
    const w = await mountCard()
    active = w
    expect(w.text()).toBe('')
  })

  it('Linux: mostra só a escolha da pasta extraída do arquivo do site', async () => {
    setBridge({ isElectron: true, platform: 'linux', legacyMedia: makeBridge().legacyMedia })
    const w = await mountCard()
    active = w
    expect(w.find('[data-test="legacy-media-card"]').exists()).toBe(true)
    // Sem instalação do Windows para procurar: sem o botão automático.
    expect(w.find('[data-test="legacy-media-import-button"]').exists()).toBe(false)
    const pick = w.find('[data-test="legacy-media-pick-folder-button"]')
    expect(pick.exists()).toBe(true)
    expect(pick.classes()).toContain('general-settings__btn--primary')
    expect(w.text()).toContain('settings.general.legacyMediaHintLinux')
    expect(w.text()).toContain('settings.general.legacyMediaPickHintLinux')
    expect(w.text()).not.toContain('settings.general.legacyMediaPickHint ')
  })

  it('Linux: escolher a pasta analisa e importa o caminho escolhido', async () => {
    const bridge = { isElectron: true, platform: 'linux', legacyMedia: makeBridge().legacyMedia }
    bridge.legacyMedia.pickFolder.mockResolvedValue('/home/user/Downloads/midias-louvorja')
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="legacy-media-pick-folder-button"]').trigger('click')
    await flushPromises()
    expect(bridge.legacyMedia.analyze).toHaveBeenCalledWith('/home/user/Downloads/midias-louvorja')
    expect(bridge.legacyMedia.import).toHaveBeenCalledWith('/home/user/Downloads/midias-louvorja')
    expect(reconcileFromLocalMediaMock).toHaveBeenCalled()
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
  it('onImportProgress: registrado durante o import', async () => {
    const bridge = makeBridge()
    let progressCb: ((p: unknown) => void) | null = null
    bridge.legacyMedia.onImportProgress = vi.fn((cb: (p: unknown) => void) => {
      progressCb = cb
      return () => {}
    })
    // import lento pra manter phase=importing
    bridge.legacyMedia.import = vi.fn(() => new Promise((res) => setTimeout(() => res({ ok: true, imported: 1, skipped: 0, failed: 0, total: 1 }), 50)))
    setBridge(bridge)
    const w = await mountCard()
    await w.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(progressCb).not.toBeNull()
    progressCb?.({ current: 5, total: 10, relativePath: 'album', mediaType: 'music' })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 60))
    await flushPromises()
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

  it('gaps: reconciling com progress no render, analyze com lang, cliques forçados durante busy', async () => {
    // t1: reconcileFromLocalMedia pendente chamando cb → phase
    // reconciling + progress no template (L256 arm0, cb L70/72)
    let cbProgress!: (c: number, t2: number, a: string) => void
    let releaseReconcile!: (v: { marked: number }) => void
    reconcileFromLocalMediaMock.mockImplementationOnce(
      (cb: typeof cbProgress) => {
        cb(1, 10, 'Album X')
        return new Promise((r) => (releaseReconcile = r))
      },
    )
    const b1 = makeBridge()
    setBridge(b1)
    const { analyze } = b1.legacyMedia as { analyze: ReturnType<typeof vi.fn> }
    analyze.mockResolvedValue({ found: true, present: 10, missing: 5, missingBytes: 5 * 1024 * 1024, lang: 'PT', configDir: 'D:\\x' })
    const w1 = await mountCard()
    await w1.find('[data-test="legacy-media-import-button"]').trigger('click')
    await flushPromises()
    expect(w1.text()).toContain('settings.general.legacyMediaReconcileProgress')
    releaseReconcile({ marked: 3 })
    await flushPromises()
    // L287 arm0: lang presente no done
    expect(w1.text()).toContain('PT')
    w1.unmount()

    // t2: busy: import pendente + dispatch manual nos 2 botões
    let releaseImport!: (v: unknown) => void
    const b2 = makeBridge()
    ;(b2.legacyMedia as { import: ReturnType<typeof vi.fn> }).import
      .mockImplementationOnce(() => new Promise((r) => (releaseImport = r)))
    setBridge(b2)
    const w2 = await mountCard()
    const importBtn = w2.find('[data-test="legacy-media-import-button"]')
    await importBtn.trigger('click')
    await flushPromises()
    ;(importBtn.element as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    const pickBtn = w2.find('[data-test="legacy-media-pick-folder-button"]')
    ;(pickBtn.element as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await flushPromises()
    releaseImport({ ok: true, imported: 5, skipped: 10, failed: 0, total: 15 })
    await flushPromises()
    expect((b2.legacyMedia as { import: ReturnType<typeof vi.fn> }).import).toHaveBeenCalledTimes(1)
    w2.unmount()
    setBridge(originalLouvorja)
  })


  describe('pausar, continuar e parar', () => {
    function slowImportBridge(result = { ok: true, imported: 3, skipped: 0, failed: 0, total: 10 }) {
      const bridge = makeBridge() as ReturnType<typeof makeBridge> & {
        legacyMedia: ReturnType<typeof makeBridge>['legacyMedia'] & Record<string, ReturnType<typeof vi.fn>>
      }
      let finish: (value: unknown) => void = () => {}
      let progressCb: ((p: unknown) => void) | null = null
      bridge.legacyMedia.import = vi.fn(() => new Promise((res) => { finish = res }))
      bridge.legacyMedia.onImportProgress = vi.fn((cb: (p: unknown) => void) => {
        progressCb = cb
        return () => {}
      })
      bridge.legacyMedia.pause = vi.fn().mockResolvedValue(true)
      bridge.legacyMedia.resume = vi.fn().mockResolvedValue(true)
      bridge.legacyMedia.cancel = vi.fn().mockResolvedValue(true)
      return { bridge, finish: () => finish(result), progress: (p: unknown) => progressCb?.(p) }
    }

    it('mostra a porcentagem e pausa/continua a importação', async () => {
      const { bridge, finish, progress } = slowImportBridge()
      setBridge(bridge)
      const w = await mountCard()
      active = w
      await w.find('[data-test="legacy-media-import-button"]').trigger('click')
      await flushPromises()
      progress({ current: 26, total: 100, relativePath: 'pt/x.mp3', mediaType: 'music' })
      await flushPromises()
      expect(w.find('[data-test="legacy-media-percent"]').text()).toBe('26%')

      await w.find('[data-test="legacy-media-pause"]').trigger('click')
      await flushPromises()
      expect(bridge.legacyMedia.pause).toHaveBeenCalled()
      expect(w.find('[data-test="legacy-media-pause"]').exists()).toBe(false)
      expect(w.text()).toContain('settings.general.legacyMediaPaused')

      await w.find('[data-test="legacy-media-resume"]').trigger('click')
      await flushPromises()
      expect(bridge.legacyMedia.resume).toHaveBeenCalled()
      expect(w.find('[data-test="legacy-media-pause"]').exists()).toBe(true)

      finish()
      await flushPromises()
      expect(w.find('[data-test="legacy-media-pause"]').exists()).toBe(false)
    })

    it('parar: encerra, atualiza a Central de Mídia e avisa quantos foram copiados', async () => {
      const { bridge, finish } = slowImportBridge({ ok: true, imported: 3, skipped: 0, failed: 0, total: 10, reason: 'cancelled' } as never)
      setBridge(bridge)
      const w = await mountCard()
      active = w
      await w.find('[data-test="legacy-media-import-button"]').trigger('click')
      await flushPromises()
      await w.find('[data-test="legacy-media-stop"]').trigger('click')
      await flushPromises()
      expect(bridge.legacyMedia.cancel).toHaveBeenCalled()
      finish()
      await flushPromises()
      expect(reconcileFromLocalMediaMock).toHaveBeenCalled()
      expect(w.find('[data-test="legacy-media-done"]').text()).toContain('settings.general.legacyMediaCancelled')
    })

    it('build antigo sem pausar: os controles não aparecem', async () => {
      const bridge = makeBridge()
      bridge.legacyMedia.import = vi.fn(() => new Promise(() => {}))
      setBridge(bridge)
      const w = await mountCard()
      active = w
      await w.find('[data-test="legacy-media-import-button"]').trigger('click')
      await flushPromises()
      expect(w.find('[data-test="legacy-media-pause"]').exists()).toBe(false)
      expect(w.find('[data-test="legacy-media-stop"]').exists()).toBe(false)
    })
  })

  describe('sair da página e voltar', () => {
    it('a importação continua; ao voltar mostra o progresso e termina com a Central atualizada', async () => {
      const bridge = makeBridge() as ReturnType<typeof makeBridge> & {
        legacyMedia: ReturnType<typeof makeBridge>['legacyMedia'] & Record<string, ReturnType<typeof vi.fn>>
      }
      let finish: (value: unknown) => void = () => {}
      let progressCb: ((p: unknown) => void) | null = null
      bridge.legacyMedia.import = vi.fn(() => new Promise((res) => { finish = res }))
      bridge.legacyMedia.onImportProgress = vi.fn((cb: (p: unknown) => void) => {
        progressCb = cb
        return () => {}
      })
      bridge.legacyMedia.pause = vi.fn().mockResolvedValue(true)
      setBridge(bridge)

      const first = await mountCard()
      await first.find('[data-test="legacy-media-import-button"]').trigger('click')
      await flushPromises()
      progressCb?.({ current: 10, total: 100, relativePath: 'pt/a.mp3', mediaType: 'music' })
      await flushPromises()
      first.unmount() // saiu da página

      // Enquanto fora, o main segue mandando progresso.
      progressCb?.({ current: 40, total: 100, relativePath: 'pt/b.mp3', mediaType: 'music' })
      const back = await mountCard() // voltou
      active = back
      expect(back.find('[data-test="legacy-media-percent"]').text()).toBe('40%')
      expect(back.find('[data-test="legacy-media-pause"]').exists()).toBe(true)
      // Não começa outra importação por cima.
      expect(bridge.legacyMedia.analyze).toHaveBeenCalledTimes(1)

      finish({ ok: true, imported: 100, skipped: 0, failed: 0, total: 100, reason: 'done' })
      await flushPromises()
      expect(reconcileFromLocalMediaMock).toHaveBeenCalledTimes(1)
      expect(back.find('[data-test="legacy-media-done"]').exists()).toBe(true)
    })

    it('termina mesmo com a página fechada: a Central de Mídia é atualizada igual', async () => {
      const bridge = makeBridge()
      let finish: (value: unknown) => void = () => {}
      bridge.legacyMedia.import = vi.fn(() => new Promise((res) => { finish = res }))
      setBridge(bridge)
      const w = await mountCard()
      await w.find('[data-test="legacy-media-import-button"]').trigger('click')
      await flushPromises()
      w.unmount()
      finish({ ok: true, imported: 5, skipped: 0, failed: 0, total: 5, reason: 'done' })
      await flushPromises()
      expect(reconcileFromLocalMediaMock).toHaveBeenCalledTimes(1)
      const back = await mountCard()
      active = back
      expect(back.find('[data-test="legacy-media-done"]').exists()).toBe(true)
    })
  })

  describe('arquivo compactado do site (.tar.gz)', () => {
    function archiveBridge(platform = 'linux') {
      const bridge = makeBridge() as ReturnType<typeof makeBridge> & {
        platform: string
        legacyMedia: ReturnType<typeof makeBridge>['legacyMedia'] & Record<string, ReturnType<typeof vi.fn>>
      }
      bridge.platform = platform
      let finish: (value: unknown) => void = () => {}
      let progressCb: ((p: unknown) => void) | null = null
      bridge.legacyMedia.pickArchive = vi.fn().mockResolvedValue('/home/Dados/Downloads/LouvorJA-PIANO.tar.gz')
      bridge.legacyMedia.analyze = vi.fn().mockResolvedValue({
        found: true, archive: true, scanned: 0, missing: 1, present: 0,
        totalBytes: 16 * 1024 ** 3, missingBytes: 16 * 1024 ** 3,
      })
      bridge.legacyMedia.import = vi.fn(() => new Promise((res) => { finish = res }))
      bridge.legacyMedia.onImportProgress = vi.fn((cb: (p: unknown) => void) => {
        progressCb = cb
        return () => {}
      })
      return { bridge, finish: (v: unknown) => finish(v), progress: (p: unknown) => progressCb?.(p) }
    }

    it('Linux: escolher o arquivo baixado importa direto dele, com progresso em GB', async () => {
      const { bridge, finish, progress } = archiveBridge()
      setBridge(bridge)
      const w = await mountCard()
      active = w
      const pick = w.find('[data-test="legacy-media-pick-archive-button"]')
      expect(pick.exists()).toBe(true)
      expect(pick.classes()).toContain('general-settings__btn--primary')
      await pick.trigger('click')
      await flushPromises()
      expect(bridge.legacyMedia.analyze).toHaveBeenCalledWith('/home/Dados/Downloads/LouvorJA-PIANO.tar.gz')
      expect(bridge.legacyMedia.import).toHaveBeenCalledWith('/home/Dados/Downloads/LouvorJA-PIANO.tar.gz')
      expect(w.text()).toContain('settings.general.legacyMediaArchiveSummary')

      progress({ current: 4 * 1024 ** 3, total: 16 * 1024 ** 3, relativePath: 'pt/a.mp3', mediaType: 'music', unit: 'bytes' })
      await flushPromises()
      expect(w.find('[data-test="legacy-media-percent"]').text()).toBe('25%')
      expect(w.text()).toContain('settings.general.legacyMediaProgressBytes')

      finish({ ok: true, imported: 4779, skipped: 73, failed: 0, total: 4852, reason: 'done' })
      await flushPromises()
      expect(reconcileFromLocalMediaMock).toHaveBeenCalled()
      expect(w.find('[data-test="legacy-media-done"]').exists()).toBe(true)
    })

    it('arquivo sem mídias: erro próprio', async () => {
      const { bridge } = archiveBridge()
      bridge.legacyMedia.analyze = vi.fn().mockResolvedValue({ found: false, archive: true, scanned: 0, missing: 0, present: 0, totalBytes: 0, missingBytes: 0 })
      setBridge(bridge)
      const w = await mountCard()
      active = w
      await w.find('[data-test="legacy-media-pick-archive-button"]').trigger('click')
      await flushPromises()
      expect(w.text()).toContain('settings.general.legacyMediaInvalidArchive')
      expect(bridge.legacyMedia.import).not.toHaveBeenCalled()
    })

    it('Windows também aceita o arquivo; cancelar a escolha não faz nada', async () => {
      const { bridge } = archiveBridge('win32')
      bridge.legacyMedia.pickArchive = vi.fn().mockResolvedValue(null)
      setBridge(bridge)
      const w = await mountCard()
      active = w
      await w.find('[data-test="legacy-media-pick-archive-button"]').trigger('click')
      await flushPromises()
      expect(bridge.legacyMedia.analyze).not.toHaveBeenCalled()
    })
  })

  describe('Central de Mídia atualizada durante a importação', () => {
    it('com músicas novas, atualiza a Central a cada 30 s; mostra gravadas e já existentes', async () => {
      const bridge = makeBridge()
      let progressCb: ((p: unknown) => void) | null = null
      let finish: (value: unknown) => void = () => {}
      bridge.legacyMedia.import = vi.fn(() => new Promise((res) => { finish = res }))
      bridge.legacyMedia.onImportProgress = vi.fn((cb: (p: unknown) => void) => {
        progressCb = cb
        return () => {}
      })
      setBridge(bridge)
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
      const w = await mountCard()
      active = w
      await w.find('[data-test="legacy-media-import-button"]').trigger('click')
      await flushPromises()

      // Só já existentes: nada a atualizar ainda.
      progressCb?.({ current: 1, total: 10, relativePath: 'a', mediaType: 'music', imported: 0, skipped: 3 })
      await flushPromises()
      expect(reconcileFromLocalMediaMock).not.toHaveBeenCalled()

      progressCb?.({ current: 2, total: 10, relativePath: 'b', mediaType: 'music', imported: 5, skipped: 3 })
      await flushPromises()
      expect(reconcileFromLocalMediaMock).toHaveBeenCalledTimes(1)
      expect(w.find('[data-test="legacy-media-live"]').text()).toContain('settings.general.legacyMediaLiveCounts')

      now.mockReturnValue(1_000_000 + 10_000)
      progressCb?.({ current: 3, total: 10, relativePath: 'c', mediaType: 'music', imported: 8, skipped: 3 })
      await flushPromises()
      expect(reconcileFromLocalMediaMock).toHaveBeenCalledTimes(1)

      now.mockReturnValue(1_000_000 + 31_000)
      progressCb?.({ current: 4, total: 10, relativePath: 'd', mediaType: 'music', imported: 9, skipped: 3 })
      await flushPromises()
      expect(reconcileFromLocalMediaMock).toHaveBeenCalledTimes(2)

      finish({ ok: true, imported: 9, skipped: 3, failed: 0, total: 12, reason: 'done' })
      await flushPromises()
      // E a atualização final de sempre.
      expect(reconcileFromLocalMediaMock).toHaveBeenCalledTimes(3)
      now.mockRestore()
    })
  })
})
