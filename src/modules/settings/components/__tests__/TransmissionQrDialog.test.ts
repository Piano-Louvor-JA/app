// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'

const toDataURL = vi.hoisted(() => vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`))
vi.mock('qrcode', () => ({ default: { toDataURL } }))

import TransmissionQrDialog from '../TransmissionQrDialog.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })
const url = 'http://192.168.0.5:7080/?token=AB12C'

afterEach(() => { document.body.innerHTML = '' })

function mountDialog(link: string | null) {
  return mount(TransmissionQrDialog, { props: { url: link, title: 'Fonte 1 · Espelho do Palco' }, global: { plugins: [i18n] }, attachTo: document.body })
}

it('renders the QR code of the full link, token included', async () => {
  const dialog = mountDialog(url)
  await flushPromises()
  const panel = document.querySelector('[role="dialog"]')!
  expect(panel.getAttribute('aria-label')).toBe('Fonte 1 · Espelho do Palco')
  expect(toDataURL).toHaveBeenCalledWith(url, expect.objectContaining({ margin: 1 }))
  expect(document.querySelector<HTMLImageElement>('.transmission-qr__image')!.src).toBe(`data:image/png;base64,${btoa(url)}`)
  expect(panel.textContent).toContain(url)
  dialog.unmount()
})

it('closes by button, backdrop and Escape, and stays hidden without a link', async () => {
  const dialog = mountDialog(url)
  await flushPromises()
  document.querySelector<HTMLButtonElement>('[data-test="qr-close"]')!.click()
  document.querySelector<HTMLElement>('.transmission-qr__backdrop')!.click()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  expect(dialog.emitted('close')).toHaveLength(3)
  await dialog.setProps({ url: null })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(dialog.emitted('close')).toHaveLength(3)
  dialog.unmount()
})

it('drops a QR code that finished after the link changed', async () => {
  let release!: (value: string) => void
  toDataURL.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve }))
  const dialog = mountDialog('http://old/')
  await dialog.setProps({ url })
  await flushPromises()
  release('data:image/png;base64,old')
  await flushPromises()
  expect(document.querySelector<HTMLImageElement>('.transmission-qr__image')!.src).toBe(`data:image/png;base64,${btoa(url)}`)
  dialog.unmount()
})

it('keeps the dialog usable when the QR code cannot be generated', async () => {
  toDataURL.mockRejectedValueOnce(new Error('too long'))
  const dialog = mountDialog(url)
  await flushPromises()
  expect(document.querySelector('.transmission-qr__image')).toBeNull()
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain(url)
  dialog.unmount()
})
