// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-mock"><slot /></div>' },
}))

vi.mock('./SettingsToggle.vue', () => ({
  default: { name: 'SettingsToggle', props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', ($event.target as HTMLInputElement).checked)" />' },
}))

const lsData: Record<string, string> = {}
const lsStub = {
  getItem: (k: string) => lsData[k] ?? null,
  setItem: (k: string, v: string) => { lsData[k] = String(v) },
  removeItem: (k: string) => { delete lsData[k] },
  clear: () => { for (const k of Object.keys(lsData)) delete lsData[k] },
  key: () => null,
  length: 0,
}
Object.defineProperty(window, 'localStorage', { value: lsStub, configurable: true, writable: true })
Object.defineProperty(globalThis, 'localStorage', { value: lsStub, configurable: true, writable: true })

const mockSettings = {
  lyricAlign: 'center' as string,
  showSongTitle: true,
  customTextFormat: false,
  customBackground: false,
  fontSizePercent: 100,
  fontColor: '#FFFFFF',
  fontWeight: 400,
  backgroundColor: '#000000',
  backgroundImage: null as string | null,
}

const setters = {
  setLyricAlign: vi.fn(),
  setShowSongTitle: vi.fn(),
  setCustomTextFormat: vi.fn(),
  setCustomBackground: vi.fn(),
  setFontSizePercent: vi.fn(),
  setFontColor: vi.fn(),
  setFontWeight: vi.fn(),
  setBackgroundColor: vi.fn(),
  setBackgroundImageFromFile: vi.fn().mockResolvedValue(undefined),
  clearBackgroundImage: vi.fn(),
}

vi.mock('../../composables/useProjectionSettings', () => ({
  useProjectionSettings: () => ({
    settings: mockSettings,
    ...setters,
  }),
}))

import LyricCustomizationCard from '../LyricCustomizationCard.vue'
import { useProjectionSettings } from '../../composables/useProjectionSettings'

describe('LyricCustomizationCard', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    setters.setBackgroundImageFromFile.mockResolvedValue(undefined)
    Object.assign(mockSettings, {
      lyricAlign: 'center',
      showSongTitle: true,
      customTextFormat: false,
      customBackground: false,
      fontSizePercent: 100,
      fontColor: '#FFFFFF',
      fontWeight: 400,
      backgroundColor: '#000000',
      backgroundImage: null,
    })
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('renderiza título e grupos de alinhamento', async () => {
    const w = mount(LyricCustomizationCard)
    await flushPromises()
    active = w
    expect(w.text()).toContain('settings.projection.lyrics.title')
    expect(w.findAll('.lyric-custom__align-btn').length).toBe(3)
  })

  it('clique no alinhamento chama setLyricAlign', async () => {
    const w = mount(LyricCustomizationCard)
    await flushPromises()
    active = w
    await w.findAll('.lyric-custom__align-btn')[0].trigger('click')
    expect(setters.setLyricAlign).toHaveBeenCalledWith('top')
  })

  it('toggles de features chamam os setters', async () => {
    const w = mount(LyricCustomizationCard)
    await flushPromises()
    active = w
    const labels = w.findAll('.lyric-custom__toggle-label')
    expect(labels.length).toBe(3)
    await labels[0].trigger('click')
    expect(setters.setShowSongTitle).toHaveBeenCalledWith(false)
    await labels[1].trigger('click')
    expect(setters.setCustomTextFormat).toHaveBeenCalledWith(true)
    await labels[2].trigger('click')
    expect(setters.setCustomBackground).toHaveBeenCalledWith(true)
  })

  it('tamanho e cor de fonte aplicam pelos inputs', async () => {
    mockSettings.customTextFormat = true
    const w = mount(LyricCustomizationCard)
    await flushPromises()
    active = w
    // v-slider do vuetify não renderiza em jsdom sem plugin; aplica via swatches de cor
    const swatches = w.findAll('.lyric-custom__swatch')
    expect(swatches.length).toBeGreaterThan(0)
    await swatches[0].trigger('click')
    expect(setters.setFontColor).toHaveBeenCalledWith('#FFFFFF')
    const color = w.find('input[type="color"]')
    expect(color.exists()).toBe(true)
    await color.setValue('#FF0000')
    expect(setters.setFontColor).toHaveBeenLastCalledWith('#ff0000')
  })

  it('seleção de imagem de fundo chama setBackgroundImageFromFile', async () => {
    mockSettings.customBackground = true
    const w = mount(LyricCustomizationCard)
    await flushPromises()
    active = w
    const input = w.find('input[type="file"]')
    expect(input.exists()).toBe(true)
    const fake = new File(['x'], 'bg.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [fake], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(setters.setBackgroundImageFromFile).toHaveBeenCalledWith(fake)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('seleção sem arquivo passa null', async () => {
    mockSettings.customBackground = true
    const w = mount(LyricCustomizationCard)
    await flushPromises()
    active = w
    const input = w.find('input[type="file"]')
    await input.trigger('change')
    await flushPromises()
    expect(setters.setBackgroundImageFromFile).toHaveBeenCalledWith(null)
  })

  it('sem background: não mostra botão de remover', async () => {
    const w = mount(LyricCustomizationCard)
    await flushPromises()
    active = w
    const store = useProjectionSettings()
    void store
    // backgroundImage null no mock → botão remove ausente
    const removeBtn = w.findAll('button').find((b) => b.classes().some((c) => c.includes('remove') || c.includes('clear')))
    expect(removeBtn).toBeUndefined()
  })
})
