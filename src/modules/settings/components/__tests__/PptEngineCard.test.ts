// @vitest-environment jsdom
// PptEngineCard — engine auto/custom/detectado, set/fallback, pick custom app
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const bridgeMock = {
  isElectron: true,
  presentation: {
    getEngine: vi.fn(),
    setEngine: vi.fn(),
    detectEngines: vi.fn(),
    setCustomApp: vi.fn(),
    openExternal: vi.fn(),
    detectOffice: vi.fn(),
  },
  dialog: { openFile: vi.fn() },
}

vi.stubGlobal('window', Object.assign(window, { louvorja: bridgeMock }))

import PptEngineCard from '../PptEngineCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        presentation: {
          title: 'Apresentação',
          description: 'Engine de slides',
          engine: { auto: 'Automático' },
          custom: 'Personalizado...',
          customActive: 'Personalizado ativo',
          detect: 'Detectar',
          detecting: 'Detectando...',
          detectFound: 'Encontrados:',
          detectEmpty: 'Nenhum',
          customAppTitle: 'Escolher app',
          desktopOnly: 'Só desktop',
          hint: 'Dica',
        },
      },
    },
  },
})

function createWrapper() {
  return mount(PptEngineCard, { global: { plugins: [i18n] } })
}

describe('PptEngineCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bridgeMock.presentation.getEngine.mockResolvedValue('auto')
    bridgeMock.presentation.setEngine.mockResolvedValue(true)
    bridgeMock.presentation.detectEngines.mockResolvedValue([])
    bridgeMock.presentation.setCustomApp.mockResolvedValue(true)
    bridgeMock.dialog.openFile.mockResolvedValue(undefined)
  })

  it('renderiza com auto selecionado por default', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    const auto = wrapper.find('[data-test="ppt-engine-auto"]')
    expect(auto.exists()).toBe(true)
    expect(auto.attributes('aria-checked')).toBe('true')
  })

  it('detect sem engines: detectEmpty', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum')
  })

  it('detect com engines: lista opções', async () => {
    bridgeMock.presentation.detectEngines.mockResolvedValue([
      { id: 'powerpoint', label: 'PowerPoint' },
      { id: 'libreoffice', label: 'LibreOffice' },
    ])
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-test="ppt-engine-powerpoint"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="ppt-engine-libreoffice"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Encontrados')
  })

  it('clicar engine detectado: setEngine e seleciona', async () => {
    bridgeMock.presentation.detectEngines.mockResolvedValue([{ id: 'powerpoint', label: 'PowerPoint' }])
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="ppt-engine-powerpoint"]').trigger('click')
    await flushPromises()
    expect(bridgeMock.presentation.setEngine).toHaveBeenCalledWith('powerpoint')
    expect(wrapper.find('[data-test="ppt-engine-powerpoint"]').attributes('aria-checked')).toBe('true')
  })

  it('setEngine falha: volta pro anterior', async () => {
    bridgeMock.presentation.detectEngines.mockResolvedValue([{ id: 'powerpoint', label: 'PowerPoint' }])
    bridgeMock.presentation.setEngine.mockResolvedValue(false)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="ppt-engine-powerpoint"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('true')
  })

  it('setEngine throw: volta pro anterior', async () => {
    bridgeMock.presentation.detectEngines.mockResolvedValue([{ id: 'powerpoint', label: 'PowerPoint' }])
    bridgeMock.presentation.setEngine.mockRejectedValue(new Error('ipc'))
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="ppt-engine-powerpoint"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('true')
  })

  it('clicar custom: abre dialog e configura app', async () => {
    bridgeMock.dialog.openFile.mockResolvedValue('/opt/wps')
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="ppt-engine-custom"]').trigger('click')
    await flushPromises()
    expect(bridgeMock.dialog.openFile).toHaveBeenCalled()
    expect(bridgeMock.presentation.setCustomApp).toHaveBeenCalledWith('/opt/wps')
    expect(bridgeMock.presentation.setEngine).toHaveBeenCalledWith('custom')
    expect(wrapper.find('[data-test="ppt-engine-custom"]').attributes('aria-checked')).toBe('true')
  })

  it('pick cancelado: não configura', async () => {
    bridgeMock.dialog.openFile.mockResolvedValue(null)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="ppt-engine-custom"]').trigger('click')
    await flushPromises()
    expect(bridgeMock.presentation.setCustomApp).not.toHaveBeenCalled()
  })

  it('setCustomApp falha: não troca engine', async () => {
    bridgeMock.dialog.openFile.mockResolvedValue('/opt/wps')
    bridgeMock.presentation.setCustomApp.mockResolvedValue(false)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="ppt-engine-custom"]').trigger('click')
    await flushPromises()
    expect(bridgeMock.presentation.setEngine).not.toHaveBeenCalled()
  })

  it('getEngine falha: fallback auto', async () => {
    bridgeMock.presentation.getEngine.mockRejectedValue(new Error('fail'))
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-test="ppt-engine-auto"]').attributes('aria-checked')).toBe('true')
  })

  it('detectEngines throw: lista vazia, sem quebrar', async () => {
    bridgeMock.presentation.detectEngines.mockRejectedValue(new Error('fail'))
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum')
  })

  it('detectar de novo: botão re-executa', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(bridgeMock.presentation.detectEngines).toHaveBeenCalledTimes(1)
    await wrapper.find('[data-test="ppt-engine-detect"]').trigger('click')
    await flushPromises()
    expect(bridgeMock.presentation.detectEngines).toHaveBeenCalledTimes(2)
  })
})
