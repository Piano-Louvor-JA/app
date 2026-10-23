// @vitest-environment jsdom
// Botão de projeção independente: desativado sem estendidos (com tooltip),
// lista de monitores com seleção única, encerrar, preparação do módulo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'

const monitors = ref<Array<{ id: number; index: number; resolutionLabel: string }>>([])
const activeMonitorId = ref<number | null>(null)
const activeMode = ref<'overlay' | 'share' | null>(null)
const project = vi.fn(async (id: number, mode: 'overlay' | 'share' = 'overlay') => {
  activeMonitorId.value = id
  activeMode.value = mode
  return true
})
const stop = vi.fn(() => {
  activeMonitorId.value = null
  activeMode.value = null
})

vi.mock('@shared/composables/useIndependentProjection', () => ({
  useIndependentProjectionControl: () => ({
    monitors,
    available: computed(() => monitors.value.length > 0),
    loaded: ref(true),
    activeMonitorId,
    activeMode,
    project: (id: number, mode?: 'overlay' | 'share') => project(id, mode),
    stop: () => stop(),
  }),
}))

const identifySystemDisplays = vi.fn(async () => true)
vi.mock('@modules/settings/services/display-service', () => ({
  identifySystemDisplays: () => identifySystemDisplays(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && 'index' in params ? `${key}:${params['index']}` : key,
  }),
}))

import IndependentProjectionButton from '../IndependentProjectionButton.vue'

const EXTENDED = [
  { id: 2, index: 2, resolutionLabel: '1920 × 1080' },
  { id: 3, index: 3, resolutionLabel: '1280 × 720' },
]

function mountButton(props: Record<string, unknown> = {}) {
  return mount(IndependentProjectionButton, {
    props: { moduleId: 'clock', ...props },
    attachTo: document.body,
  })
}

function panel() {
  return document.body.querySelector('[data-testid="independent-projection-panel"]')
}

describe('IndependentProjectionButton', () => {
  beforeEach(() => {
    monitors.value = [...EXTENDED]
    activeMonitorId.value = null
    activeMode.value = null
    project.mockClear()
    stop.mockClear()
    identifySystemDisplays.mockClear()
    document.body.innerHTML = ''
  })

  it('sem monitor estendido fica desativado com o aviso no tooltip', async () => {
    monitors.value = []
    const wrapper = mountButton()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('aria-disabled')).toBe('true')
    expect(trigger.attributes('title')).toBe('independentProjection.unavailable')
    await trigger.trigger('click')
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('com estendidos abre a lista só com eles', async () => {
    const wrapper = mountButton()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('aria-disabled')).toBe('false')
    expect(trigger.attributes('title')).toBe('independentProjection.title')
    await trigger.trigger('click')
    const options = panel()!.querySelectorAll('[data-monitor-id]')
    expect([...options].map((el) => el.textContent)).toEqual([
      expect.stringContaining('independentProjection.monitor:2'),
      expect.stringContaining('independentProjection.monitor:3'),
    ])
    expect(panel()!.querySelector('[data-testid="independent-projection-stop"]')).toBeNull()
    wrapper.unmount()
  })

  it('escolher um monitor projeta nele e fecha a lista', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="3"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(project).toHaveBeenCalledWith(3, 'overlay')
    expect(panel()).toBeNull()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.classes()).toContain('independent-projection__trigger--active')
    expect(trigger.attributes('title')).toBe('independentProjection.activeOn:3')
    expect(trigger.text()).toBe('3')
    wrapper.unmount()
  })

  it('falha ao projetar mantém a lista aberta', async () => {
    project.mockResolvedValueOnce(false)
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(panel()).not.toBeNull()
    wrapper.unmount()
  })

  it('beforeProject false cancela a projeção', async () => {
    const beforeProject = vi.fn(() => false)
    const wrapper = mountButton({ beforeProject })
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(beforeProject).toHaveBeenCalled()
    expect(project).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('beforeProject async true segue projetando', async () => {
    const wrapper = mountButton({ beforeProject: async () => true })
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(project).toHaveBeenCalledWith(2, 'overlay')
    wrapper.unmount()
  })

  it('clique duplo enquanto projeta é ignorado', async () => {
    let resolve!: (value: boolean) => void
    project.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const option = panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement
    option.click()
    await flushPromises()
    // Botão desabilitado: o segundo clique chama onSelect direto via evento
    option.dispatchEvent(new MouseEvent('click'))
    expect(project).toHaveBeenCalledTimes(1)
    resolve(true)
    await flushPromises()
    wrapper.unmount()
  })

  it('ativo mostra marcado e permite encerrar', async () => {
    activeMonitorId.value = 2
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const checked = panel()!.querySelector('[data-monitor-id][aria-checked="true"]')
    expect(checked?.getAttribute('data-monitor-id')).toBe('2')
    ;(panel()!.querySelector('[data-testid="independent-projection-stop"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(stop).toHaveBeenCalled()
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('identificar monitores chama o overlay numerado', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('.independent-projection__identify') as HTMLButtonElement).click()
    expect(identifySystemDisplays).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('fecha com clique fora, ESC e ao perder os estendidos', async () => {
    const wrapper = mountButton()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')

    await trigger.trigger('click')
    // Clique dentro do painel não fecha
    panel()!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).toBeNull()

    await trigger.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(panel()).toBeNull()

    await trigger.trigger('click')
    monitors.value = []
    await flushPromises()
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('pointerdown com lista fechada ou alvo não-Node é ignorado', async () => {
    const wrapper = mountButton()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const event = new Event('pointerdown')
    Object.defineProperty(event, 'target', { value: {} })
    document.dispatchEvent(event)
    await flushPromises()
    expect(panel()).not.toBeNull()
    // Clique no próprio botão alterna (fecha)
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('pointerdown')
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('modo compartilhar projeta com share e muda ícone e tooltip', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const overlay = panel()!.querySelector('[data-mode="overlay"]')!
    const share = panel()!.querySelector('[data-mode="share"]') as HTMLButtonElement
    expect(overlay.getAttribute('aria-checked')).toBe('true')
    expect(panel()!.textContent).toContain('independentProjection.hint')
    share.click()
    await flushPromises()
    expect(share.getAttribute('aria-checked')).toBe('true')
    expect(panel()!.textContent).toContain('independentProjection.hintShare')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(project).toHaveBeenCalledWith(2, 'share')
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('title')).toBe('independentProjection.sharedOn:2')
    expect(trigger.find('.ti').classes()).toContain('ti-layout-columns')
    wrapper.unmount()
  })

  it('ao reabrir, o modo começa no modo ativo', async () => {
    activeMonitorId.value = 3
    activeMode.value = 'share'
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    await flushPromises()
    expect(panel()!.querySelector('[data-mode="share"]')!.getAttribute('aria-checked')).toBe('true')
    wrapper.unmount()
  })
})
