// @vitest-environment jsdom
// StageCustomizationDialog — open/close, Escape, backdrop, card only-scope
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('../StageCustomizationCard.vue', () => ({
  default: { props: ['onlyScope'], template: '<div class="stage-card-stub">{{ onlyScope }}</div>' },
}))

import StageCustomizationDialog from '../StageCustomizationDialog.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: { stage: { title: 'Personalizar Palco' } },
      common: { cancel: 'Cancelar' },
    },
  },
})

function createWrapper(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(StageCustomizationDialog, {
    props: { open: true, scope: 'clock', ...props },
    global: { plugins: [i18n, pinia] },
    attachTo: document.body,
  })
}

describe('StageCustomizationDialog', () => {
  it('open=false: não renderiza', () => {
    const wrapper = createWrapper({ open: false })
    expect(document.querySelector('.stage-shortcut')).toBeNull()
    wrapper.unmount()
  })

  it('open=true: dialog com role e card na tab do scope', () => {
    const wrapper = createWrapper()
    const dialog = document.querySelector('.stage-shortcut')
    expect(dialog).toBeTruthy()
    expect(dialog!.getAttribute('role')).toBe('dialog')
    expect(dialog!.getAttribute('aria-modal')).toBe('true')
    expect(document.querySelector('.stage-card-stub')!.textContent!.trim()).toBe('clock')
    wrapper.unmount()
  })

  it('botão X emite close', async () => {
    const wrapper = createWrapper()
    ;(document.querySelector('.stage-shortcut__close') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('clique no backdrop emite close', async () => {
    const wrapper = createWrapper()
    ;(document.querySelector('.stage-shortcut__backdrop') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('clique no painel não fecha (não propaga)', async () => {
    const wrapper = createWrapper()
    ;(document.querySelector('.stage-shortcut__panel') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeFalsy()
    wrapper.unmount()
  })

  it('Escape emite close', async () => {
    const wrapper = createWrapper()
    const dialog = document.querySelector('.stage-shortcut') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    // handler está no div do dialog via @keydown — jsdom dispara se o elemento tem foco,
    // mas o dispatch direto no elemento aciona o listener do Vue
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('tecla diferente de Escape não fecha', async () => {
    const wrapper = createWrapper()
    const dialog = document.querySelector('.stage-shortcut') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeFalsy()
    wrapper.unmount()
  })

  it('scope dinâmico repassa pro card', () => {
    const wrapper = createWrapper({ scope: 'timer' })
    expect(document.querySelector('.stage-card-stub')!.textContent!.trim()).toBe('timer')
    wrapper.unmount()
  })
})
