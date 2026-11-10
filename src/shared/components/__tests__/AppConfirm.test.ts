// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppConfirm from '../AppConfirm.vue'

function createWrapper(props: Partial<InstanceType<typeof AppConfirm>['$props']> = {}) {
  return mount(AppConfirm, {
    props: {
      open: true,
      title: 'Confirmar ação',
      message: 'Deseja realmente excluir?',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      ...props,
    },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AppConfirm', () => {
  it('open=false: não renderiza o dialog', () => {
    const wrapper = createWrapper({ open: false })
    expect(document.querySelector('.app-confirm')).toBeNull()
    wrapper.unmount()
  })

  it('renderiza título, mensagem e labels', () => {
    const wrapper = createWrapper()
    const dialog = document.querySelector('.app-confirm')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('Confirmar ação')
    expect(dialog!.textContent).toContain('Deseja realmente excluir?')
    expect(dialog!.textContent).toContain('Excluir')
    expect(dialog!.textContent).toContain('Cancelar')
    wrapper.unmount()
  })

  it('backdrop click: emite cancel', async () => {
    const wrapper = createWrapper()
    ;(document.querySelector('.app-confirm__backdrop') as HTMLElement).click()
    await Promise.resolve()
    expect(wrapper.emitted('cancel')).toBeTruthy()
    wrapper.unmount()
  })

  it('botão cancel: emite cancel', async () => {
    const wrapper = createWrapper()
    const btns = document.querySelectorAll('.app-confirm__btn')
    ;(btns[0] as HTMLElement).click()
    await Promise.resolve()
    expect(wrapper.emitted('cancel')).toBeTruthy()
    wrapper.unmount()
  })

  it('botão confirm com danger: emite confirm', async () => {
    const wrapper = createWrapper({ danger: true })
    const btns = document.querySelectorAll('.app-confirm__btn')
    expect(btns[1].className).toContain('--danger')
    ;(btns[1] as HTMLElement).click()
    await Promise.resolve()
    expect(wrapper.emitted('confirm')).toBeTruthy()
    wrapper.unmount()
  })

  describe('enterConfirms', () => {
    const pressEnter = (target: EventTarget = window) => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event
    }

    it('Enter emite confirm e bloqueia o Enter para o resto da tela', () => {
      const wrapper = createWrapper({ enterConfirms: true })
      const outside = vi.fn()
      window.addEventListener('keydown', outside)
      const button = document.createElement('button')
      document.body.appendChild(button)
      const event = pressEnter(button)
      expect(wrapper.emitted('confirm')).toHaveLength(1)
      expect(event.defaultPrevented).toBe(true)
      expect(outside).not.toHaveBeenCalled()
      window.removeEventListener('keydown', outside)
      wrapper.unmount()
    })

    it('outras teclas e Enter repetido não confirmam', () => {
      const wrapper = createWrapper({ enterConfirms: true })
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }))
      expect(wrapper.emitted('confirm')).toBeUndefined()
      wrapper.unmount()
    })

    it('sem a prop, Enter não confirma (confirms de exclusão seguem só no clique)', () => {
      const wrapper = createWrapper()
      expect(pressEnter().defaultPrevented).toBe(false)
      expect(wrapper.emitted('confirm')).toBeUndefined()
      wrapper.unmount()
    })

    it('fechado ou desmontado, Enter não confirma', async () => {
      const wrapper = createWrapper({ enterConfirms: true, open: false })
      pressEnter()
      expect(wrapper.emitted('confirm')).toBeUndefined()
      await wrapper.setProps({ open: true })
      pressEnter()
      expect(wrapper.emitted('confirm')).toHaveLength(1)
      await wrapper.setProps({ open: false })
      pressEnter()
      expect(wrapper.emitted('confirm')).toHaveLength(1)
      await wrapper.setProps({ open: true })
      wrapper.unmount()
      expect(pressEnter().defaultPrevented).toBe(false)
    })
  })
})
