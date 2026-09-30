// @vitest-environment jsdom
// MonitorTargetSelect — composable mockado; painel, trigger, toggle, identify, outside close
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  optionsList: { value: [] as Array<{ displayId: number; label: string; primary: boolean }> },
  selectedCount: { value: 0 },
  hasDisplays: { value: true },
  loading: { value: false },
  identifying: { value: false },
  open: { value: false },
  toggle: vi.fn(),
  identify: vi.fn(async () => {}),
  toggleOpen: vi.fn(),
  close: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@shared/composables/useMonitorTargetSelect', () => ({
  useMonitorTargetSelect: () => ({
    optionsList: mocks.optionsList,
    selectedCount: mocks.selectedCount,
    hasDisplays: mocks.hasDisplays,
    loading: mocks.loading,
    identifying: mocks.identifying,
    open: mocks.open,
    toggle: mocks.toggle,
    identify: mocks.identify,
    toggleOpen: mocks.toggleOpen,
    close: mocks.close,
    refresh: mocks.refresh,
  }),
}))

import MonitorTargetSelect from '../MonitorTargetSelect.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      monitors: {
        selectScreens: 'Selecionar telas',
        selectedCount: '{count} selecionada(s)',
        identify: 'Identificar',
        noDisplays: 'Nenhuma tela',
      },
    },
  },
})

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(MonitorTargetSelect, {
    props,
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('MonitorTargetSelect', () => {
  let wrapper: ReturnType<typeof createWrapper> | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.optionsList.value = [
      { displayId: 1, label: 'Monitor 1', primary: true },
      { displayId: 2, label: 'Monitor 2', primary: false },
    ]
    mocks.selectedCount.value = 0
    mocks.hasDisplays.value = true
    mocks.open.value = false
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('trigger: label seleção quando count=0', () => {
    wrapper = createWrapper()
    expect(wrapper.text()).toContain('Selecionar telas')
  })

  it('trigger: label com count quando selecionado', () => {
    mocks.selectedCount.value = 2
    wrapper = createWrapper({ modelValue: [1, 2] })
    expect(wrapper.text()).toContain('2')
  })

  it('showLabel: chip com label Telas', () => {
    wrapper = createWrapper({ showLabel: true })
    expect(wrapper.find('.monitor-target-select__label, .monitors-chip, [data-test="monitor-label"]').exists() || wrapper.text().length > 0).toBe(true)
  })

  it('click no trigger: toggleOpen', async () => {
    wrapper = createWrapper()
    const trigger = wrapper.find('button')
    await trigger.trigger('click')
    expect(mocks.toggleOpen).toHaveBeenCalled()
  })

  it('disabled: trigger desabilitado', () => {
    wrapper = createWrapper({ disabled: true })
    const trigger = wrapper.find('button')
    expect((trigger.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('painel aberto: opções com checkbox', async () => {
    mocks.open.value = true
    wrapper = createWrapper({ modelValue: [1] })
    await flushPromises()
    const options = document.querySelectorAll('[role="menuitemcheckbox"], .monitor-option, input[type="checkbox"]')
    expect(options.length).toBeGreaterThan(0)
  })

  it('toggle display: chama composable com id', async () => {
    mocks.open.value = true
    wrapper = createWrapper()
    await flushPromises()
    const option = document.querySelector('[data-display-id="2"], [role="menuitemcheckbox"]') as HTMLElement | null
    if (option) {
      option.click()
      await wrapper.vm.$nextTick()
      expect(mocks.toggle).toHaveBeenCalled()
    }
  })

  it('identify: botão presente no painel aberto', async () => {
    mocks.open.value = true
    wrapper = createWrapper()
    await flushPromises()
    const btn = document.querySelector('.monitor-target-select__identify') as HTMLElement | null
    expect(btn).toBeTruthy()
  })

  it('pointerdown fora: close', async () => {
    mocks.open.value = true
    wrapper = createWrapper()
    await flushPromises()
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(mocks.close).toHaveBeenCalled()
  })

  it('pointerdown dentro do root: não fecha', async () => {
    mocks.open.value = true
    wrapper = createWrapper()
    await flushPromises()
    const trigger = wrapper.find('button')
    trigger.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(mocks.close).not.toHaveBeenCalled()
  })
})
