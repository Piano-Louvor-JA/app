// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'
import TransmissionAddDialog from '../TransmissionAddDialog.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })

function mountDialog(open = true) {
  return mount(TransmissionAddDialog, { props: { open }, global: { plugins: [i18n] }, attachTo: document.body })
}
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)

afterEach(() => { document.body.innerHTML = '' })

it('stays closed until opened', () => {
  const dialog = mountDialog(false)
  expect($('[role="dialog"]')).toBeNull()
  dialog.unmount()
})

it('asks for the name and the type before adding, and focuses the name', async () => {
  const dialog = mountDialog()
  await flushPromises()
  const panel = $('[role="dialog"]')!
  expect(panel.getAttribute('aria-modal')).toBe('true')
  expect(panel.textContent).toContain('Nova conexão')
  expect(panel.textContent).toContain('Digite o nome da conexão')
  const name = $<HTMLInputElement>('[data-test="add-name"]')!
  expect(name.placeholder).toBe('Exemplo: TV Frontal, TV retorno, Projetor…')
  expect(document.activeElement).toBe(name)
  const confirm = $<HTMLButtonElement>('[data-test="add-confirm"]')!
  expect(confirm.disabled).toBe(true)
  name.value = '   '
  name.dispatchEvent(new Event('input'))
  await flushPromises()
  expect(confirm.disabled).toBe(true)
  name.value = 'TV Frontal'
  name.dispatchEvent(new Event('input'))
  await flushPromises()
  expect(confirm.disabled).toBe(true)
  name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  expect(dialog.emitted('confirm')).toBeUndefined()
  const mirror = $<HTMLButtonElement>('[data-test="add-kind-mirror"]')!
  const stageReturn = $<HTMLButtonElement>('[data-test="add-kind-return"]')!
  expect(mirror.textContent).toContain('Espelho do Palco')
  expect(stageReturn.textContent).toContain('Retorno de palco')
  expect(mirror.getAttribute('aria-checked')).toBe('false')
  stageReturn.click()
  await flushPromises()
  expect(stageReturn.getAttribute('aria-checked')).toBe('true')
  expect(confirm.disabled).toBe(false)
  confirm.click()
  expect(dialog.emitted('confirm')).toEqual([['TV Frontal', 'return']])
  mirror.click()
  await flushPromises()
  name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  expect(dialog.emitted('confirm')![1]).toEqual(['TV Frontal', 'mirror'])
  dialog.unmount()
})

it('cancels by button, backdrop or Escape and starts clean when reopened', async () => {
  const dialog = mountDialog()
  await flushPromises()
  const name = $<HTMLInputElement>('[data-test="add-name"]')!
  name.value = 'Projetor'
  name.dispatchEvent(new Event('input'))
  $<HTMLButtonElement>('[data-test="add-kind-mirror"]')!.click()
  $<HTMLButtonElement>('[data-test="add-cancel"]')!.click()
  $<HTMLElement>('.transmission-add__backdrop')!.click()
  $('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(dialog.emitted('cancel')).toHaveLength(3)
  await dialog.setProps({ open: false })
  await dialog.setProps({ open: true })
  await flushPromises()
  expect($<HTMLInputElement>('[data-test="add-name"]')!.value).toBe('')
  expect($('[data-test="add-kind-mirror"]')!.getAttribute('aria-checked')).toBe('false')
  expect($<HTMLButtonElement>('[data-test="add-confirm"]')!.disabled).toBe(true)
  dialog.unmount()
})
