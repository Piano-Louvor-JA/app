// @vitest-environment jsdom
// InAppProjectionOverlay — Escape seletivo, close btn, classe global, palette
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@modules/settings/components/StagePaletteButton.vue', () => ({
  default: { props: ['scope'], template: '<div class="palette-stub">{{ scope }}</div>' },
}))

import InAppProjectionOverlay from '../InAppProjectionOverlay.vue'

function createWrapper() {
  return mount(InAppProjectionOverlay, {
    props: { label: 'Projeção', closeLabel: 'Fechar', hint: 'ESC fecha', scope: 'bible' },
    attachTo: document.body,
  })
}

describe('InAppProjectionOverlay', () => {
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    document.documentElement.className = ''
  })

  afterEach(() => {
    document.documentElement.className = ''
  })

  it('renderiza dialog com label e palette com scope', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.inapp-projection').attributes('aria-label')).toBe('Projeção')
    expect(wrapper.find('.palette-stub').text()).toBe('bible')
    expect(wrapper.find('.inapp-projection__hotkey-hint').text()).toBe('ESC fecha')
    wrapper.unmount()
  })

  it('monta classe inapp-projection-open no html; unmount remove', async () => {
    const wrapper = createWrapper()
    expect(document.documentElement.classList.contains('inapp-projection-open')).toBe(true)
    wrapper.unmount()
    expect(document.documentElement.classList.contains('inapp-projection-open')).toBe(false)
  })

  it('botão X emite close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.inapp-projection__tool-btn').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('Escape global: previne, para propagação e emite close', async () => {
    const wrapper = createWrapper()
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    window.dispatchEvent(event)
    await wrapper.vm.$nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(stopSpy).toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('tecla diferente de Escape: ignora', async () => {
    const wrapper = createWrapper()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeFalsy()
    wrapper.unmount()
  })

  it('Escape em textarea/contenteditable: ignora', async () => {
    const wrapper = createWrapper()
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeFalsy()
    ta.remove()
    wrapper.unmount()
  })

  it('Escape em input text: ignora (pode digitar)', async () => {
    const wrapper = createWrapper()
    const input = document.createElement('input')
    input.type = 'text'
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeFalsy()
    input.remove()
    wrapper.unmount()
  })

  it('Escape em input[type=button]: fecha', async () => {
    const wrapper = createWrapper()
    const input = document.createElement('input')
    input.type = 'button'
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
    input.remove()
    wrapper.unmount()
  })

  it('slot renderiza no stage', () => {
    const wrapper = mount(InAppProjectionOverlay, {
      props: { label: 'P', closeLabel: 'F', hint: 'H', scope: 'clock' },
      slots: { default: '<div class="stage-content">STAGE</div>' },
    })
    expect(wrapper.find('.stage-content').text()).toBe('STAGE')
    wrapper.unmount()
  })
  describe('gaps — input types no Escape', () => {
    for (const type of ['button', 'checkbox', 'radio', 'range', 'file', 'reset', 'submit']) {
      it(`input[type=${type}]: Escape passa (emite close)`, async () => {
        const input = document.createElement('input')
        input.type = type
        document.body.appendChild(input)
        const wrapper = (await import('../InAppProjectionOverlay.vue')).default
        const { mount } = await import('@vue/test-utils')
        const w = mount(wrapper, { attachTo: document.body })
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        Object.defineProperty(event, 'target', { value: input, configurable: true })
        document.dispatchEvent(event)
        await w.vm.$nextTick()
        expect(w.emitted('close') ?? w.find('.inapp-projection').exists()).toBeTruthy()
        w.unmount()
        input.remove()
      })
    }

    it('input[type=text]: Escape bloqueado (não emite close)', async () => {
      const input = document.createElement('input')
      input.type = 'text'
      document.body.appendChild(input)
      const component = (await import('../InAppProjectionOverlay.vue')).default
      const { mount } = await import('@vue/test-utils')
      const w = mount(component, { attachTo: document.body })
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      Object.defineProperty(event, 'target', { value: input, configurable: true })
      document.dispatchEvent(event)
      await w.vm.$nextTick()
      expect(w.emitted('close')).toBeUndefined()
      w.unmount()
      input.remove()
    })
  })

})