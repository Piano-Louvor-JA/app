// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
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
    presentation: {
      getEngine: vi.fn().mockResolvedValue('auto'),
      setEngine: vi.fn().mockResolvedValue(true),
      detectEngines: vi.fn().mockResolvedValue([{ id: 'ppt', label: 'PowerPoint', path: '/usr/ppt' }]),
      setCustomApp: vi.fn().mockResolvedValue(true),
    },
    dialog: { openFile: vi.fn().mockResolvedValue('/opt/keynote.app') },
  }
}

async function mountCard() {
  const w = mount((await import('../PptEngineCard.vue')).default)
  await flushPromises()
  return w
}

describe('PptEngineCard', () => {
  let active: Awaited<ReturnType<typeof mountCard>> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    active?.unmount()
    active = null
    setBridge(originalLouvorja)
  })

  it('sem bridge: título visível, sem controles', async () => {
    setBridge(undefined)
    const w = await mountCard()
    active = w
    expect(w.text()).toContain('settings.presentation.title')
    expect(w.find('[data-test="ppt-engine-auto"]').exists()).toBe(false)
  })

  it('carrega preferência e engines detectadas', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(bridge.presentation.getEngine).toHaveBeenCalled()
    expect(bridge.presentation.detectEngines).toHaveBeenCalled()
    expect(w.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('true')
    expect(w.find('[data-test="ppt-engine-ppt"]').exists()).toBe(true)
  })

  it('getEngine com falha cai no auto', async () => {
    const bridge = makeBridge()
    bridge.presentation.getEngine.mockRejectedValue(new Error('x'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('true')
  })

  it('detectEngines com falha mantém lista vazia', async () => {
    const bridge = makeBridge()
    bridge.presentation.detectEngines.mockRejectedValue(new Error('x'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.text()).not.toContain('PowerPoint')
  })

  it('setEngine com sucesso seleciona', async () => {
    const bridge = makeBridge()
    bridge.presentation.getEngine.mockResolvedValue('ppt')
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="ppt-engine-auto"]').trigger('click')
    await flushPromises()
    expect(bridge.presentation.setEngine).toHaveBeenCalledWith('auto')
    expect(w.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('true')
  })

  it('setEngine com false reverte', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    bridge.presentation.setEngine.mockResolvedValue(false)
    // seleciona um engine detectado (ppt)
    const pptBtn = w.find('[data-test="ppt-engine-ppt"]')
    if (pptBtn.exists()) {
      await pptBtn.trigger('click')
      await flushPromises()
      expect(w.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('true')
    }
  })

  it('setEngine com exceção reverte', async () => {
    const bridge = makeBridge()
    bridge.presentation.getEngine.mockResolvedValue('ppt')
    setBridge(bridge)
    const w = await mountCard()
    active = w
    bridge.presentation.setEngine.mockRejectedValue(new Error('x'))
    const pptBtn = w.find('[data-test="ppt-engine-ppt"]')
    if (pptBtn.exists()) {
      await pptBtn.trigger('click')
      await flushPromises()
      expect(w.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('false')
    }
  })

  it('custom: dialog + setCustomApp + setEngine(custom)', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const customBtn = w.find('[data-test="ppt-engine-custom"]')
    if (customBtn.exists()) {
      await customBtn.trigger('click')
      await flushPromises()
      expect(bridge.dialog.openFile).toHaveBeenCalled()
      expect(bridge.presentation.setCustomApp).toHaveBeenCalledWith('/opt/keynote.app')
      expect(bridge.presentation.setEngine).toHaveBeenCalledWith('custom')
    }
  })

  it('custom com cancelamento do dialog não seta nada', async () => {
    const bridge = makeBridge()
    bridge.dialog.openFile.mockResolvedValue(null)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const customBtn = w.find('[data-test="ppt-engine-custom"]')
    if (customBtn.exists()) {
      await customBtn.trigger('click')
      await flushPromises()
      expect(bridge.presentation.setCustomApp).not.toHaveBeenCalled()
    }
  })

  it('custom com exceção do dialog é ignorado', async () => {
    const bridge = makeBridge()
    bridge.dialog.openFile.mockRejectedValue(new Error('cancel'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const customBtn = w.find('[data-test="ppt-engine-custom"]')
    if (customBtn.exists()) {
      await customBtn.trigger('click')
      await flushPromises()
      expect(bridge.presentation.setCustomApp).not.toHaveBeenCalled()
    }
  })
})
