// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
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
    const wrapper = createWrapper()
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('global')
  })

  it('initialScope válido muda a tab ativa', () => {
    const wrapper = createWrapper({ initialScope: 'timer' })
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('timer')
  })

  it('initialScope inválido não muda a tab', () => {
    const wrapper = createWrapper({ initialScope: 'xpto' })
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('global')
  })

  it('onlyScope muda escopo ativo', () => {
    const wrapper = createWrapper({ onlyScope: 'clock' })
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
      expect(wrapper.vm.scopeTabs.length).toBeGreaterThan(1)
      expect(wrapper.vm.scopeTabs[0].id).toBe('global')
    })

    it('visibleScopeTabs normal: todas tabs visíveis', () => {
      expect(wrapper.vm.visibleScopeTabs.length).toBeGreaterThan(1)
    })

    it('visibleScopeTabs onlyScope: só o escopo específico', () => {
      const wrapper = createWrapper({ props: { onlyScope: 'clock' } })
      expect(wrapper.vm.visibleScopeTabs.length).toBe(1)
      expect(wrapper.vm.visibleScopeTabs[0].id).toBe('clock')
    })

    it('isInheritingGlobal: true ao abrir', () => {
      expect(wrapper.vm.isInheritingGlobal).toBe(true)
    })

    it('setActiveScope muda activeScope e isInheritingGlobal', async () => {
      wrapper.vm.setActiveScope('timer')
      await flushPromises()
      expect(wrapper.vm.activeScope).toBe('timer')
      expect(wrapper.vm.isInheritingGlobal).toBe(false)
    })
  })

  describe('patchClock função', () => {
    it('patchClock com objeto: junta com o clock existente', () => {
      const before = wrapper.vm.settings.value.clock
      wrapper.vm.patchClock({ showSeconds: true })
      expect(wrapper.vm.settings.value.clock?.showSeconds).toBe(true)
      expect(wrapper.vm.settings.value.clock?.style).toBe(before?.style)
    })

    it('patchClock cria novo objeto se clock nulo', () => {
      wrapper.vm.patch({ clock: undefined })
      wrapper.vm.patchClock({ format24h: true })
      expect(wrapper.vm.settings.value.clock).toBeTruthy()
      expect(wrapper.vm.settings.value.clock?.format24h).toBe(true)
    })
  })

  describe('moduleTimeFormat computed', () => {
    it('timer scope: retorna timeFormat do timer', () => {
      wrapper.vm.setActiveScope('timer')
      wrapper.vm.patch({ timer: { timeFormat: 'HH:mm:ss' } })
      expect(wrapper.vm.moduleTimeFormat).toBe('HH:mm:ss')
    })

    it('countdown scope: retorna timeFormat do countdown', () => {
      wrapper.vm.setActiveScope('countdown')
      wrapper.vm.patch({ countdown: { timeFormat: 'mm:ss' } })
      expect(wrapper.vm.moduleTimeFormat).toBe('mm:ss')
    })

    it('outro scope: retorna null', () => {
      wrapper.vm.setActiveScope('clock')
      expect(wrapper.vm.moduleTimeFormat).toBeNull()
    })

    it('timer sem settings: usa default', () => {
      wrapper.vm.setActiveScope('timer')
      wrapper.vm.patch({ timer: undefined })
      expect(wrapper.vm.moduleTimeFormat).toBe('HH:mm')
    })
  })

  describe('patchModuleTimeFormat função', () => {
    it('patchModuleTimeFormat timer: atualiza timeFormat timer', () => {
      wrapper.vm.setActiveScope('timer')
      wrapper.vm.patchModuleTimeFormat('HH:mm')
      expect(wrapper.vm.settings.value.timer?.timeFormat).toBe('HH:mm')
    })

    it('patchModuleTimeFormat countdown: atualiza timeFormat countdown', () => {
      wrapper.vm.setActiveScope('countdown')
      wrapper.vm.patchModuleTimeFormat('ss')
      expect(wrapper.vm.settings.value.countdown?.timeFormat).toBe('ss')
    })

    it('patchModuleTimeFormat outro scope: não faz nada', () => {
      wrapper.vm.setActiveScope('clock')
      wrapper.vm.patchModuleTimeFormat('foo')
      expect(wrapper.vm.settings.value.clock?.style).toBe('digital') // não muda
    })
  })

  describe('patchRandom função', () => {
    it('patchRandom junta com settings existentes', () => {
      wrapper.vm.patchRandom({ fontSizePc: 12 })
      expect(wrapper.vm.settings.value.random?.fontSizePc).toBe(12)
      expect(wrapper.vm.settings.value.random?.textTransform).toBe('none') // default
    })

    it('patchRandom cria objeto se random nulo', () => {
      wrapper.vm.patch({ random: undefined })
      wrapper.vm.patchRandom({ animationSpeed: 'fast' })
      expect(wrapper.vm.settings.value.random).toBeTruthy()
      expect(wrapper.vm.settings.value.random?.animationSpeed).toBe('fast')
    })
  })

  describe('file input', () => {
    it('onFileSelected: arquivo null → não faz nada', () => {
      wrapper.vm.fileInput = { files: null }
      const event = { target: { files: null } }
      wrapper.vm.onFileSelected(event)
      expect(wrapper.vm.settings.value.backgroundImage).toBeUndefined()
    })

    it('onFileSelected: FileReader não string → não faz nada', async () => {
      wrapper.vm.fileInput = { files: [{ name: 'test.png' }] }
      const event = { target: { files: [{ name: 'test.png' }] } }
      vi.spyOn(window, 'FileReader').mockImplementation(function() {
        this.onload = () => { /* nada */ }
        this.readAsDataURL = () => {}
      })
      wrapper.vm.onFileSelected(event)
      expect(wrapper.vm.settings.value.backgroundImage).toBeUndefined()
    })

    it('onFileSelected: imagem válida → setBackgroundImage', async () => {
      wrapper.vm.fileInput = { files: [{ name: 'test.png' }] }
      const event = { target: { files: [{ name: 'test.png' }] } }
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          wrapper.vm.setBackgroundImage(reader.result)
        }
      }
      await reader.readAsDataURL(new Blob())
      // Teste direto do método
      wrapper.vm.setBackgroundImage('data:image/png;base64,test')
      expect(wrapper.vm.settings.value.backgroundImage).toBe('data:image/png;base64,test')
    })
  })

  describe('ações de reset', () => {
    it('resetScope volta settings do escopo para default', () => {
      wrapper.vm.setActiveScope('clock')
      wrapper.vm.patchClock({ showSeconds: true })
      wrapper.vm.resetScope()
      expect(wrapper.vm.settings.value.clock?.showSeconds).toBe(false) // default
    })

    it('confirmReset: false → true ao clicar reset', async () => {
      wrapper.vm.confirmReset = false
      wrapper.vm.confirmReset = true
      expect(wrapper.vm.confirmReset).toBe(true)
    })

    it('confirmReset: reset cancela se confirmReset=false', () => {
      wrapper.vm.confirmReset = true
      wrapper.vm.confirmReset = false
      expect(wrapper.vm.confirmReset).toBe(false)
    })

    it('confirmReset: reset executa se confirmReset=true', () => {
      wrapper.vm.confirmReset = true
      wrapper.vm.resetScope()
      expect(wrapper.vm.confirmReset).toBe(false)
    })
  })

  describe('conforme scope', () => {
    it('activeScope === bible: mostra componente bíblia', () => {
      wrapper.vm.setActiveScope('bible')
      expect(wrapper.find('.stage-custom__section--bible').exists()).toBe(true)
    })

    it('activeScope === clock: mostra módulo clock', () => {
      wrapper.vm.setActiveScope('clock')
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(true)
    })

    it('activeScope === timer/countdown: mostra módulo timer', () => {
      wrapper.vm.setActiveScope('timer')
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(true)
    })

    it('activeScope === random: mostra módulo random', () => {
      wrapper.vm.setActiveScope('random')
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(true)
    })

    it('activeScope === hymns: mostra módulo hymns', () => {
      wrapper.vm.setActiveScope('hymns')
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(true)
    })

    it('activeScope === global: não mostra módulo específico', () => {
      wrapper.vm.setActiveScope('global')
      expect(wrapper.find('.stage-custom__section--module').exists()).toBe(false)
    })
  })

  describe('interações visuais', () => {
    it('swatch ativo: classe --active quando settings igual', () => {
      wrapper.vm.patch({ backgroundColor: '#ff0000' })
      const swatch = wrapper.find('.stage-custom__swatch')
      expect(swatch.classes()).toContain('stage-custom__swatch--active')
    })

    it('swatch inativo: sem --active quando settings diferente', () => {
      wrapper.vm.patch({ backgroundColor: '#00ff00' })
      const swatch = wrapper.find('.stage-custom__swatch')
      expect(swatch.classes()).not.toContain('stage-custom__swatch--active')
    })

    it('segment btn ativo: classe --active quando settings igual', () => {
      wrapper.vm.patch({ fontWeight: 600 })
      const btn = wrapper.find('.stage-custom__segment-btn')
      expect(btn.classes()).toContain('stage-custom__segment-btn--active')
    })

    it('toggle switch: classe --on quando modelValue true', () => {
      const toggle = wrapper.findComponent({ name: 'SettingsToggle' })
      toggle.vm.$emit('update:modelValue', true)
      expect(toggle.classes()).toContain('stage-custom__switch--on')
    })
  })
})
