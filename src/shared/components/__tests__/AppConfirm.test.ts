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
})
