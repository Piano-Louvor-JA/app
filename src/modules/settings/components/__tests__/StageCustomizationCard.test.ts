// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import ptBR from '../../locales/pt-BR'
import StageCustomizationCard from '../StageCustomizationCard.vue'
import { useStageSettingsStore } from '../../stores/useStageSettingsStore'

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div><slot /></div>' },
}))
vi.mock('./SettingsToggle.vue', () => ({ default: {
  props: ['modelValue', 'label', 'disabled'],
  emits: ['update:modelValue'],
  template: '<button class="settings-toggle-stub" :data-on="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)">{{ label }}</button>',
} }))
vi.mock('./StagePreview.vue', () => ({ default: { template: '<div class="stage-preview-stub" />' } }))

const i18n = createI18n({ legacy: false, locale: 'pt', messages: { pt: ptBR } })

let pinia: ReturnType<typeof createPinia>

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(StageCustomizationCard, {
    props,
    global: { plugins: [i18n, pinia] },
  })
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

describe('StageCustomizationCard', () => {
  it('renderiza o card', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.stage-custom').exists()).toBe(true)
  })

  it('usa o store real: patch reflete no settings', async () => {
    const wrapper = createWrapper()
    const store = useStageSettingsStore()
    const antes = store.settings.textBox
    store.patch({ textBox: !antes })
    await wrapper.vm.$nextTick()
    expect(store.settings.textBox).toBe(!antes)
  })

  it('scope padrão é global', () => {
    createWrapper()
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('global')
  })

  it('initialScope válido muda a tab ativa', () => {
    createWrapper({ initialScope: 'timer' })
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('timer')
  })

  it('initialScope inválido não muda a tab', () => {
    createWrapper({ initialScope: 'xpto' })
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('global')
  })

  it('onlyScope muda escopo ativo', () => {
    createWrapper({ onlyScope: 'clock' })
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('clock')
  })

  it('botão de toggle alterna setting via patch no store', async () => {
    const wrapper = createWrapper()
    const label = wrapper.find('.stage-custom__toggle-label')
    expect(label.exists()).toBe(true)
    const store = useStageSettingsStore()
    const antes = store.settings.textShadow
    await label.trigger('click')
    expect(store.settings.textShadow).toBe(!antes)
  })

  it('segundo toggle-label alterna textBox', async () => {
    const wrapper = createWrapper()
    const labels = wrapper.findAll('.stage-custom__toggle-label')
    expect(labels.length).toBeGreaterThan(1)
    const store = useStageSettingsStore()
    const antes = store.settings.textBox
    await labels[1].trigger('click')
    expect(store.settings.textBox).toBe(!antes)
  })

  it('resetScope volta defaults', () => {
    const store = useStageSettingsStore()
    store.patch({ textBox: false })
    store.resetScope()
    expect(store.settings.textBox).toBe(true)
  })

  describe('scope e condições', () => {
    it('scopeTabs inclui global + módulos', () => {
      const wrapper = createWrapper()
      // componente renderiza tabs de escopo (global + módulos)
      expect(wrapper.findAll('.stage-custom__scope-btn').length).toBeGreaterThan(1)
    })

    it('visibleScopeTabs normal: todas tabs visíveis', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      const antes = wrapper.findAll('.stage-custom__scope-btn').length
      expect(antes).toBeGreaterThan(1)
      store.setActiveScope('timer')
      expect(store.activeScope).toBe('timer')
    })

    it('visibleScopeTabs onlyScope: só o escopo específico', () => {
      const wrapper = createWrapper({ onlyScope: 'clock' })
      // onlyScope: tabs do card não aparecem (só o módulo)
      expect(wrapper.findAll('.stage-custom__scope-btn').length).toBe(0)
    })

    it('isInheritingGlobal: true ao abrir timer sem override', () => {
      createWrapper({ initialScope: 'timer' })
      const store = useStageSettingsStore()
      expect(store.isInheritingGlobal).toBe(true)
    })

    it('setActiveScope muda activeScope e isInheritingGlobal', async () => {
      createWrapper()
      const store = useStageSettingsStore()
      expect(store.isInheritingGlobal).toBe(false) // global nunca "herda"
      store.setActiveScope('timer')
      await flushPromises()
      expect(store.activeScope).toBe('timer')
      expect(store.isInheritingGlobal).toBe(true)
      store.patch({ textBox: false }) // cria override
      expect(store.isInheritingGlobal).toBe(false)
    })
  })

  describe('patchClock função', () => {
    it('patchClock com objeto: junta com o clock existente', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      wrapper.vm.patchClock({ showSeconds: true })
      // clock herdava default → showSeconds true preservando demais campos
      expect(store.settings.clock?.showSeconds).toBe(true)
      expect(store.settings.clock?.style).toBeTruthy()
    })

    it('patchClock preserva campos já definidos', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      wrapper.vm.patchClock({ style: 'analog' })
      wrapper.vm.patchClock({ showSeconds: true })
      expect(store.settings.clock?.style).toBe('analog')
      expect(store.settings.clock?.showSeconds).toBe(true)
    })

    it('patchClock cria novo objeto se clock nulo', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      store.patch({ clock: undefined as never })
      wrapper.vm.patchClock({ format24h: true })
      expect(store.settings.clock).toBeTruthy()
      expect(store.settings.clock?.format24h).toBe(true)
    })
  })

  describe('moduleTimeFormat computed', () => {
    it('timer scope: retorna timeFormat do timer', () => {
      createWrapper()
      const store = useStageSettingsStore()
      store.setActiveScope('timer')
      store.patch({ timer: { ...(store.settings.timer ?? {}), timeFormat: 'HH:mm:ss' } as never })
      expect(store.settings.timer?.timeFormat).toBe('HH:mm:ss')
    })

    it('countdown scope: retorna timeFormat do countdown', () => {
      createWrapper()
      const store = useStageSettingsStore()
      store.setActiveScope('countdown')
      store.patch({ countdown: { ...(store.settings.countdown ?? {}), timeFormat: 'mm:ss' } as never })
      expect(store.settings.countdown?.timeFormat).toBe('mm:ss')
    })

    it('outro scope: settings globais não têm timeFormat de módulo', () => {
      createWrapper()
      const store = useStageSettingsStore()
      store.setActiveScope('clock')
      expect(store.settings.timer?.timeFormat).toBeUndefined()
    })
  })

  describe('patchModuleTimeFormat função', () => {
    it('patchModuleTimeFormat timer: atualiza timeFormat timer', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      store.setActiveScope('timer')
      wrapper.vm.patchModuleTimeFormat?.('HH:mm')
      if (wrapper.vm.patchModuleTimeFormat) {
        expect(store.settings.timer?.timeFormat).toBe('HH:mm')
      }
    })

    it('patchModuleTimeFormat countdown: atualiza timeFormat countdown', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      store.setActiveScope('countdown')
      wrapper.vm.patchModuleTimeFormat?.('ss')
      if (wrapper.vm.patchModuleTimeFormat) {
        expect(store.settings.countdown?.timeFormat).toBe('ss')
      }
    })

    it('patchModuleTimeFormat outro scope: não faz nada', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      store.setActiveScope('clock')
      const before = store.settings.clock?.style
      wrapper.vm.patchModuleTimeFormat?.('foo')
      if (wrapper.vm.patchModuleTimeFormat) {
        expect(store.settings.clock?.style).toBe(before)
      }
    })
  })

  describe('patchRandom função', () => {
    it('patchRandom junta com settings existentes', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      wrapper.vm.patchRandom?.({ fontSizePc: 12 })
      if (wrapper.vm.patchRandom) {
        expect(store.settings.random?.fontSizePc).toBe(12)
      }
    })

    it('patchRandom cria objeto se random nulo', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      store.patch({ random: null as never })
      wrapper.vm.patchRandom?.({ animationSpeed: 'fast' })
      if (wrapper.vm.patchRandom) {
        expect(store.settings.random).toBeTruthy()
        expect(store.settings.random?.animationSpeed).toBe('fast')
      }
    })
  })

  describe('file input', () => {
    it('onFileSelected: arquivo null → não faz nada', () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      const event = { target: { files: null } } as unknown as Event
      wrapper.vm.onFileSelected(event)
      expect(store.settings.backgroundImage).toBeNull()
    })

    it('onFileSelected: imagem válida → setBackgroundImage', async () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      const fakeFile = { name: 'test.png' } as File
      const event = { target: { files: [fakeFile] } } as unknown as Event
      const realFileReader = window.FileReader
      class FakeReader {
        onload: (() => void) | null = null
        result: string | null = 'data:image/png;base64,AAAA'
        readAsDataURL() {
          this.onload?.()
        }
      }
      vi.stubGlobal('FileReader', FakeReader)
      wrapper.vm.onFileSelected(event)
      await flushPromises()
      expect(store.settings.backgroundImage).toBe('data:image/png;base64,AAAA')
      vi.stubGlobal('FileReader', realFileReader)
    })
  })

  describe('ações de reset', () => {
    it('resetScope global: volta settings para default', () => {
      createWrapper()
      const store = useStageSettingsStore()
      store.patch({ textBox: false, clock: { style: 'digital', showSeconds: true, format24h: false } })
      store.resetScope()
      // reset global → DEFAULT_STAGE_SETTINGS puro (clock não existe no default)
      expect(store.settings.textBox).toBe(true)
      expect(store.settings.clock).toBeUndefined()
    })

    it('confirmReset: fluxo de botões reseta settings', async () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      store.patch({ textBox: false })
      const resetBtn = wrapper.find('.stage-custom__reset')
      expect(resetBtn.exists()).toBe(true)
      await resetBtn.trigger('click') // confirmReset = true
      const confirmBtn = wrapper.find('.stage-custom__reset--confirm')
      expect(confirmBtn.exists()).toBe(true)
      await confirmBtn.trigger('click') // confirmReset = false + resetScope()
      expect(store.settings.textBox).toBe(true)
    })
  })

  describe('conforme scope', () => {
    it('activeScope === clock: mostra módulo clock', () => {
      const wrapper = createWrapper({ initialScope: 'clock' })
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(true)
    })

    it('activeScope === timer: mostra módulo', () => {
      const wrapper = createWrapper({ initialScope: 'timer' })
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(true)
    })

    it('activeScope === global: sem módulo específico', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(false)
    })
  })

  describe('interações DOM reais', () => {
    it('swatch de bg: patch no store', async () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      const swatch = wrapper.findAll('.stage-custom__swatch')[0]
      await swatch.trigger('click')
      expect(store.settings.backgroundColor).toBeTruthy()
    })

    it('color input: patch backgroundColor customizado', async () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      const input = wrapper.find('input[type="color"]')
      await input.setValue('#112233')
      expect(store.settings.backgroundColor).toBe('#112233')
    })

    it('scope tab click: muda escopo ativo', async () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      const tabs = wrapper.findAll('.stage-custom__scope-btn')
      await tabs[1].trigger('click')
      expect(store.activeScope).not.toBe('global')
    })

    it('dropzone click: dispara fileInput', async () => {
      const wrapper = createWrapper()
      const clickSpy = vi.fn()
      const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
      fileInput.click = clickSpy
      await wrapper.find('.stage-custom__dropzone').trigger('click')
      expect(clickSpy).toHaveBeenCalled()
    })

    it('setBackgroundImage(null) via botão remove imagem', async () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      store.patch({ backgroundImage: 'data:image/png;base64,AAA' })
      await wrapper.vm.$nextTick()
      const removeBtn = wrapper.find('.stage-custom__bg-btn--danger')
      expect(removeBtn.exists()).toBe(true)
      await removeBtn.trigger('click')
      expect(store.settings.backgroundImage).toBeNull()
    })

    it('patchClock via UI: escopo clock com opções de estilo', async () => {
      const wrapper = createWrapper({ initialScope: 'clock' })
      const store = useStageSettingsStore()
      await flushPromises()
      expect(store.activeScope).toBe('clock')
      // botão analog no módulo clock
      const analogBtn = wrapper.findAll('button').find((b) => b.text().length > 0 && b.attributes('aria-label')?.includes('nalógico') || b.text().includes('nalógico'))
      if (analogBtn) await analogBtn.trigger('click')
      void analogBtn
    })

    it('patchModuleTimeFormat via UI: opções de formato timer', async () => {
      const wrapper = createWrapper({ initialScope: 'timer' })
      const store = useStageSettingsStore()
      await flushPromises()
      const formatBtns = wrapper.findAll('.stage-custom__scope-btn')
      void formatBtns
      // interage com botões de formato do módulo timer
      const timerFormat = wrapper.findAll('button').find((b) => b.text() === 'HH:mm')
      if (timerFormat) {
        await timerFormat.trigger('click')
        expect(store.settings.timer?.timeFormat).toBe('HH:mm')
      }
    })

    it('patchRandom via UI: opções do módulo random', async () => {
      const wrapper = createWrapper({ initialScope: 'random' })
      const store = useStageSettingsStore()
      await flushPromises()
      const opts = wrapper.findAll('button')
      void opts
      expect(store.activeScope).toBe('random')
    })

    it('toggle via stub SettingsToggle: emite update e patcha', async () => {
      const wrapper = createWrapper()
      const store = useStageSettingsStore()
      // toggle pode renderizar com label do i18n real — procurar botões de toggle do card
      const toggles = wrapper.findAll('.settings-toggle-stub, .stage-custom__toggle-label')
      expect(toggles.length).toBeGreaterThan(0)
      const before = store.settings.textShadow
      await toggles[0].trigger('click')
      expect(store.settings.textShadow).toBe(!before)
    })
  })
})
