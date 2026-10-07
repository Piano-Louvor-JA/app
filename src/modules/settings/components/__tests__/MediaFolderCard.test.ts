// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-mock"><slot /></div>' },
}))

import MediaFolderCard from '../MediaFolderCard.vue'

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
    mediaFolder: {
      status: vi.fn().mockResolvedValue({ currentPath: 'C:\\Musicas', defaultPath: 'C:\\Musicas', isCustom: false }),
      pick: vi.fn().mockResolvedValue('D:\\NovaPasta'),
      migrate: vi.fn().mockResolvedValue({ ok: true, path: 'D:\\NovaPasta' }),
    },
  }
}

async function mountCard() {
  const w = mount(MediaFolderCard)
  await flushPromises()
  return w
}

function btn(w: ReturnType<typeof mount>, dataTest: string) {
  return w.find(`[data-test="${dataTest}"]`)
}

describe('MediaFolderCard', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    active?.unmount()
    active = null
    setBridge(originalLouvorja)
    vi.restoreAllMocks()
  })

  it('não-Windows: não renderiza nada', async () => {
    setBridge({ isElectron: true, platform: 'linux', mediaFolder: makeBridge().mediaFolder })
    const w = await mountCard()
    active = w
    expect(w.text()).toBe('')
  })

  it('Windows com mediaFolder: renderiza e carrega status', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(bridge.mediaFolder.status).toHaveBeenCalled()
    expect(w.find('[data-test="media-folder-current-path"]').exists()).toBe(true)
    expect(w.text()).toContain('C:\\Musicas')
  })

  it('sem mediaFolder no bridge: card visível mas sem ações funcionais', async () => {
    setBridge({ isElectron: true, platform: 'win32' })
    const w = await mountCard()
    active = w
    expect(w.find('[data-test="media-folder-card"]').exists()).toBe(true)
    expect(w.find('[data-test="media-folder-current-path"]').exists()).toBe(false)
  })

  it('escolher e migrar com sucesso mostra caminho e done', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-move-button').trigger('click')
    await flushPromises()
    expect(bridge.mediaFolder.pick).toHaveBeenCalled()
    expect(bridge.mediaFolder.migrate).toHaveBeenCalledWith('D:\\NovaPasta')
    expect(w.text()).toContain('mediaFolderMoved')
    expect(bridge.mediaFolder.status).toHaveBeenCalledTimes(2)
  })

  it('pick cancelado (null): nada acontece', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.pick.mockResolvedValue(null)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-move-button').trigger('click')
    await flushPromises()
    expect(bridge.mediaFolder.migrate).not.toHaveBeenCalled()
  })

  it('migrate falha com dest-inside-source mostra erro específico', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.migrate.mockResolvedValue({ ok: false, reason: 'dest-inside-source' })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-move-button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('mediaFolderDestInside')
  })

  it('migrate falha com persist-failed mostra erro específico', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.migrate.mockResolvedValue({ ok: false, reason: 'persist-failed' })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-move-button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('mediaFolderPersistError')
  })

  it('migrate falha genérica mostra erro genérico', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.migrate.mockResolvedValue({ ok: false, reason: 'other' })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-move-button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('mediaFolderError')
  })

  it('migrate com exceção mostra erro genérico', async () => {
    const bridge = makeBridge()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bridge.mediaFolder.migrate.mockRejectedValue(new Error('boom'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-move-button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('mediaFolderError')
  })

  it('restaurar padrão migra para defaultPath', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.status.mockResolvedValue({ currentPath: 'D:\\Custom', defaultPath: 'C:\\Musicas', isCustom: true })
    bridge.mediaFolder.migrate.mockResolvedValue({ ok: true, path: 'C:\\Musicas' })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-restore-button').trigger('click')
    await flushPromises()
    expect(bridge.mediaFolder.migrate).toHaveBeenCalledWith('C:\\Musicas')
    expect(w.text()).toContain('mediaFolderMoved')
  })

  it('restaurar padrão com falha mostra erro', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.status.mockResolvedValue({ currentPath: 'D:\\Custom', defaultPath: 'C:\\Musicas', isCustom: true })
    bridge.mediaFolder.migrate.mockResolvedValue({ ok: false, reason: 'other' })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-restore-button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('mediaFolderError')
  })

  it('restaurar padrão com exceção mostra erro', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.status.mockResolvedValue({ currentPath: 'D:\\Custom', defaultPath: 'C:\\Musicas', isCustom: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bridge.mediaFolder.migrate.mockRejectedValue(new Error('boom'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await btn(w, 'media-folder-restore-button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('mediaFolderError')
  })

  it('status null: sem caminho atual nem botão de restaurar', async () => {
    const bridge = makeBridge()
    bridge.mediaFolder.status.mockResolvedValue(null)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.find('[data-test="media-folder-current-path"]').exists()).toBe(false)
    expect(w.find('[data-test="media-folder-restore-button"]').exists()).toBe(false)
    expect(bridge.mediaFolder.migrate).not.toHaveBeenCalled()
  })
})
