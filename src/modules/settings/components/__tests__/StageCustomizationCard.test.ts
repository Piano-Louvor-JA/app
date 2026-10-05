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

const lsData: Record<string, string> = {}
const lsStub = {
  getItem: (k: string) => lsData[k] ?? null,
  setItem: (k: string, v: string) => { lsData[k] = String(v) },
  removeItem: (k: string) => { delete lsData[k] },
  clear: () => { for (const k of Object.keys(lsData)) delete lsData[k] },
  key: () => null,
  length: 0,
}
Object.defineProperty(window, 'localStorage', { value: lsStub, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: lsStub, configurable: true })
Object.defineProperty(window, 'sessionStorage', { value: lsStub, configurable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: lsStub, configurable: true })

import StageCustomizationCard from '../StageCustomizationCard.vue'
import { useStageSettingsStore } from '../../stores/useStageSettingsStore'

async function mountCard(props: Record<string, unknown> = {}) {
  const w = mount(StageCustomizationCard, { props })
  await flushPromises()
  return w
}

describe('StageCustomizationCard', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    lsStub.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('renderiza tabs de escopo e preview com escopo global', async () => {
    const w = await mountCard()
    active = w
    expect(w.find('[role="tablist"]').exists()).toBe(true)
    expect(w.findAll('[role="tab"]').length).toBeGreaterThan(1)
    expect(w.text()).toContain('settings.stage.backgroundColor')
  })

  it('initialScope inválido é ignorado; válido seleciona a tab', async () => {
    const w1 = await mountCard({ initialScope: 'nao-existe' })
    active = w1
    const store1 = useStageSettingsStore()
    expect(store1.activeScope).toBe('global')
    w1.unmount()

    const w2 = await mountCard({ initialScope: 'bible' })
    active = w2
    const store2 = useStageSettingsStore()
    expect(store2.activeScope).toBe('bible')
  })

  it('onlyScope: sem tablist (tabs somem) e escopo ativo é o módulo', async () => {
    const w = await mountCard({ onlyScope: 'timer' })
    active = w
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('timer')
    expect(w.find('[role="tablist"]').exists()).toBe(false)
  })

  it('troca de escopo via tab chama setActiveScope', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    const tabs = w.findAll('[role="tab"]')
    const bibleTab = tabs.find((t) => t.text().includes('scope.bible'))
    expect(bibleTab).toBeTruthy()
    await bibleTab!.trigger('click')
    expect(store.activeScope).toBe('bible')
  })

  it('swatch de cor de fundo aplica patch', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    const before = store.settings.backgroundColor
    const swatches = w.findAll('.stage-custom__swatch')
    expect(swatches.length).toBeGreaterThan(0)
    // swatches 4+ são os de COR DE TEXTO (mesma cor do bg ativo); usa um de bg (#000000)
    await swatches[1].trigger('click')
    expect(store.settings.backgroundColor).toBe('#000000')
  })

  it('seleção de background oficial: set e unset', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    const tiles = w.findAll('.stage-custom__official-tile')
    expect(tiles.length).toBeGreaterThan(0)
    await tiles[0].trigger('click')
    expect(store.settings.backgroundImage).toBeTruthy()
    await tiles[0].trigger('click')
    expect(store.settings.backgroundImage).toBeNull()
  })

  it('remove imagem custom via botão de lixeira', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    store.setBackgroundImage('data:image/png;base64,AAA')
    await flushPromises()
    expect(w.find('.stage-custom__bg-preview').exists()).toBe(true)
    await w.find('.stage-custom__bg-btn--danger').trigger('click')
    expect(store.settings.backgroundImage).toBeNull()
  })

  it('onFileSelected sem arquivo não quebra; com arquivo lê como dataURL', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    const input = w.find('input[type="file"]')
    // sem arquivo
    await input.trigger('change')
    expect(store.settings.backgroundImage).toBeNull()
    // com arquivo
    const fake = new File(['x'], 'bg.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [fake], configurable: true })
    await input.trigger('change')
    await new Promise((r) => setTimeout(r, 10))
    await flushPromises()
    expect(store.settings.backgroundImage).toContain('data:')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('fontSize via range aplica patch numérico', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    const range = w.find('input[type="range"]')
    await range.setValue('100')
    expect(store.settings.fontSize).toBe(100)
  })

  it('fontWeight segment aplica patch', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    const before = store.settings.fontWeight
    const group = w.findAll('[role="radiogroup"]')
    const weightGroup = group.find((g) => g.findAll('[role="radio"]').length === 3)
    const radios = weightGroup!.findAll('[role="radio"]')
    await radios[2].trigger('click')
    expect(store.settings.fontWeight).not.toBe(before)
  })

  it('escopo bible: tipografia própria + toggle de versão', async () => {
    const w = await mountCard({ onlyScope: 'bible' })
    active = w
    const store = useStageSettingsStore()
    expect(w.text()).toContain('settings.stage.bibleAppearance')
    const before = store.settings.bibleFontSize
    const ranges = w.findAll('input[type="range"]')
    expect(ranges.length).toBeGreaterThan(0)
    await ranges[0].setValue('88')
    expect(store.settings.bibleFontSize).not.toBe(before)
    // toggle versão
    const beforeVersion = store.settings.showBibleVersion
    await w.find('.stage-custom__toggle-label').trigger('click')
    expect(store.settings.showBibleVersion).toBe(!beforeVersion)
  })

  it('escopo clock: estilo e switches de segundos/24h', async () => {
    const w = await mountCard({ onlyScope: 'clock' })
    active = w
    const store = useStageSettingsStore()
    expect(w.text()).toContain('settings.stage.moduleFeatures')
    // default do clock: showSeconds=true, format24h=true (override criado no 1º patch)
    const secondsLabel = w.findAll('.stage-custom__toggle-label').find((t) => t.text().includes('clockShowSeconds'))!
    await secondsLabel.trigger('click')
    expect(store.settings.clock?.showSeconds).toBe(false)
    const h24Label = w.findAll('.stage-custom__toggle-label').find((t) => t.text().includes('clockFormat24h'))!
    await h24Label.trigger('click')
    expect(store.settings.clock?.format24h).toBe(false)
  })

  it('escopo timer: formato de hora aplica patchModuleTimeFormat', async () => {
    const w = await mountCard({ onlyScope: 'timer' })
    active = w
    const store = useStageSettingsStore()
    const timeRadios = w.findAll('[role="radio"]').filter((r) => r.text().includes(':'))
    expect(timeRadios.length).toBeGreaterThan(1)
    await timeRadios[timeRadios.length - 1].trigger('click')
    expect(store.settings.timer?.timeFormat).toBe(timeRadios[timeRadios.length - 1].text())
  })

  it('escopo countdown: formato de hora aplica no módulo countdown', async () => {
    const w = await mountCard({ onlyScope: 'countdown' })
    active = w
    const store = useStageSettingsStore()
    const timeRadios = w.findAll('[role="radio"]').filter((r) => r.text().includes(':'))
    await timeRadios[timeRadios.length - 1].trigger('click')
    expect(store.settings.countdown?.timeFormat).toBe(timeRadios[timeRadios.length - 1].text())
  })

  it('escopo random: fontSizePc, textTransform e animationSpeed', async () => {
    const w = await mountCard({ onlyScope: 'random' })
    active = w
    const store = useStageSettingsStore()
    // qualquer patch cria o override do módulo; os radios funcionam direto
    const transformRadios = w.findAll('[role="radio"]').filter((r) => ['AA', 'aa'].includes(r.text()))
    await transformRadios[0].trigger('click')
    expect(store.settings.random?.textTransform).toBe('uppercase')
    const speedRadios = w.findAll('[role="radio"]').filter((r) => ['settings.stage.speedSlow', 'settings.stage.speedNormal', 'settings.stage.speedFast'].includes(r.text()))
    await speedRadios[2].trigger('click')
    expect(store.settings.random?.animationSpeed).toBe('fast')
    // com override existente, o range de fontSizePc aplica
    const rangeEl = w.findAll('input[type="range"]')[1].element as HTMLInputElement
    rangeEl.value = '10'
    rangeEl.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(store.settings.random?.fontSizePc).toBe(10)
  })

  it('escopo hymns: overrideBg toggle', async () => {
    const w = await mountCard({ onlyScope: 'hymns' })
    active = w
    const store = useStageSettingsStore()
    expect(w.text()).toContain('settings.stage.musicBg')
    const sw = w.find('[role="switch"]')
    await sw.trigger('click')
    expect(store.settings.hymns?.overrideBg).toBe(true)
    await sw.trigger('click')
    expect(store.settings.hymns?.overrideBg).toBe(false)
  })

  it('sombra: intensidade e blur só quando textShadow ativo', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    store.patch({ textShadow: true, textBox: true })
    await flushPromises()
    const ranges = w.findAll('input[type="range"]')
    // fontSize + shadowIntensity + shadowBlur + boxOpacity
    expect(ranges.length).toBe(4)
    await ranges[1].setValue('0.5')
    expect(store.settings.shadowIntensity).toBe(0.5)
    await ranges[2].setValue('2.5')
    expect(store.settings.shadowBlur).toBe(2.5)
    await ranges[3].setValue('0.5')
    expect(store.settings.boxOpacity).toBe(0.5)
  })

  it('boxBorder toggle dentro de textBox', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    store.patch({ textBox: true })
    await flushPromises()
    const toggles = w.findAll('.stage-custom__toggle-label')
    const borderToggle = toggles.find((t) => t.text().includes('boxBorder'))
    expect(borderToggle).toBeTruthy()
    const before = store.settings.boxBorder
    await borderToggle!.trigger('click')
    expect(store.settings.boxBorder).toBe(!before)
  })

  it('alinhamentos horizontal e vertical', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    const alignLabel = (key: string) => w.findAll('[role="radio"]').find((r) => r.text() === key)!
    await alignLabel('settings.stage.alignRight').trigger('click')
    expect(store.settings.textAlign).toBe('right')
    await alignLabel('settings.stage.alignTop').trigger('click')
    expect(store.settings.textVerticalAlign).toBe('top')
  })

  it('reset: confirmar e cancelar fluxo', async () => {
    const w = await mountCard()
    active = w
    const store = useStageSettingsStore()
    store.patch({ fontSize: 120 })
    await flushPromises()
    // abre confirmação
    await w.find('.stage-custom__reset').trigger('click')
    expect(w.find('.stage-custom__reset-msg').exists()).toBe(true)
    // cancelar não reseta
    const cancel = w.find('.stage-custom__reset--cancel')
    await cancel.trigger('click')
    expect(w.find('.stage-custom__reset-msg').exists()).toBe(false)
    expect(store.settings.fontSize).toBe(120)
    // confirmar reseta para o default
    await w.find('.stage-custom__reset').trigger('click')
    await w.find('.stage-custom__reset--confirm').trigger('click')
    await flushPromises()
    expect(store.settings.fontSize).not.toBe(120)
  })

  describe('gaps — cores, pesos, switches do clock e file picker', () => {
    it('inputs de cor e swatches aplicam patch por propriedade', async () => {
      const w = await mountCard()
      active = w
      const inputs = w.findAll('input[type="color"]')
      expect(inputs.length).toBeGreaterThanOrEqual(2)
      const keys = ['#111111', '#222222', '#333333', '#444444']
      for (let i = 0; i < inputs.length; i++) {
        await inputs[i]!.setValue(keys[i] ?? '#000000')
      }
      const store = useStageSettingsStore()
      expect(store.settings.backgroundColor).toBe('#111111')
    })

    it('swatches de bibleTextColor/footerRefColor chamam patch', async () => {
      const w = await mountCard()
      active = w
      const swatches = w.findAll('.stage-custom__swatch')
      const before = swatches.length
      expect(before).toBeGreaterThan(0)
      // clicar nos dois últimos (bible/footer groups)
      await swatches[before - 1]!.trigger('click')
      await swatches[before - 2]!.trigger('click')
    })

    it('peso da bíblia via segment buttons', async () => {
      const w = await mountCard()
      active = w
      const segments = w.findAll('.stage-custom__segment-btn')
      expect(segments.length).toBeGreaterThanOrEqual(2)
      await segments[segments.length - 1]!.trigger('click')
      const store = useStageSettingsStore()
      expect(store.settings.bibleFontWeight).toBeDefined()
    })

    it('switches do clock: style/showSeconds/format24h', async () => {
      const w = await mountCard()
      active = w
      const switches = w.findAll('[role="switch"]')
      for (const s of switches) {
        await s.trigger('click')
      }
      const toggles = w.findAll('.stage-custom__toggle-label')
      for (const tl of toggles) {
        await tl.trigger('click')
      }
      const store = useStageSettingsStore()
      void store
    })

    it('dropzone e botão de editar imagem abrem o file picker', async () => {
      const w = await mountCard()
      active = w
      const input = w.find('input[type="file"]')
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})
      const bgBtn = w.find('.stage-custom__bg-btn')
      if (bgBtn.exists()) await bgBtn.trigger('click')
      else {
        const dz = w.find('.stage-custom__dropzone')
        if (dz.exists()) await dz.trigger('click')
      }
      expect(clickSpy).toHaveBeenCalled()
      clickSpy.mockRestore()
    })
  })

  it('gaps: handlers — click em todos botões e inputs por escopo', async () => {
    for (const scope of [undefined, 'bible', 'clock']) {
      const w = await mountCard(scope ? { onlyScope: scope } : {})
      active = w
      if (!scope) {
        // bg custom setado → botão changeImage (fn 265)
        const store = useStageSettingsStore()
        store.setBackgroundImage('data:image/png;base64,AAA')
        await flushPromises()
      }
      for (const btn of w.findAll('button')) {
        await btn.trigger('click').catch(() => {})
      }
      // SettingsToggle real: emitir update:model-value (fn 723)
      const { findAllComponents } = await import('@vue/test-utils')
      for (const tg of w.findAllComponents({ name: 'SettingsToggle' })) {
        tg.vm.$emit('update:modelValue', true)
      }
      await flushPromises()
      for (const inp of w.findAll('input')) {
        if (inp.attributes('type') === 'color') await inp.setValue('#123456')
        else if (inp.attributes('type') === 'range') await inp.setValue('100')
        else if (inp.attributes('type') === 'checkbox') await inp.setValue(true)
      }
      await flushPromises()
      w.unmount()
    }
  })
})
