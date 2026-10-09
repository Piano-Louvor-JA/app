// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

import LiturgyCustomDialog from '../LiturgyCustomDialog.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': {} } })

describe('LiturgyCustomDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mountDlg(props: Record<string, unknown> = {}) {
    return mount(LiturgyCustomDialog, {
      props: { open: true, name: '', ...props },
      attachTo: document.body,
      global: { plugins: [i18n] },
    })
  }

  it('input dispara update:name', async () => {
    const w = mountDlg()
    await w.vm.$nextTick()
    const input = document.querySelector<HTMLInputElement>('.liturgy-dialog input[type="text"]')
    expect(input).not.toBeNull()
    input!.value = 'Culto'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.emitted('update:name')).toEqual([['Culto']])
    w.unmount()
  })

  it('keydown.enter no input emite create (48)', async () => {
    const w = mountDlg({ name: 'X' })
    await w.vm.$nextTick()
    const input = document.querySelector<HTMLInputElement>('.liturgy-dialog input[type="text"]')
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await w.vm.$nextTick()
    expect(w.emitted('create')).toBeTruthy()
    w.unmount()
  })

  it('botão cancelar emite close (56)', async () => {
    const w = mountDlg()
    await w.vm.$nextTick()
    const ghost = document.querySelector<HTMLButtonElement>('.liturgy-dialog__btn--ghost')
    expect(ghost).not.toBeNull()
    ghost!.click()
    await w.vm.$nextTick()
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })

  it('botão criar desabilitado sem nome (64)', async () => {
    const w = mountDlg({ name: '  ' })
    await w.vm.$nextTick()
    const btns = document.querySelectorAll<HTMLButtonElement>('.liturgy-dialog__btn')
    const create = btns[btns.length - 1]
    expect(create.disabled).toBe(true)
    w.unmount()
  })

  it('botão criar com nome emite create (64)', async () => {
    const w = mountDlg({ name: 'Nome' })
    await w.vm.$nextTick()
    const btns = document.querySelectorAll<HTMLButtonElement>('.liturgy-dialog__btn')
    const create = btns[btns.length - 1]
    expect(create.disabled).toBe(false)
    create.click()
    await w.vm.$nextTick()
    expect(w.emitted('create')).toBeTruthy()
    w.unmount()
  })
})
