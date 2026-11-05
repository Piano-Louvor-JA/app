// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'
import TransmissionLinkRow from '../TransmissionLinkRow.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })
const url = 'http://192.168.0.5:7080/legenda?token=AB12C'

function mountRow(primary = false) {
  return mount(TransmissionLinkRow, {
    props: { label: 'Legenda para OBS', hint: 'Só o texto', url, primary },
    global: { plugins: [i18n] },
  })
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it('shows the link and copies it with a short confirmation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  const row = mountRow(true)
  expect(row.classes()).toContain('transmission-link--primary')
  expect(row.get('code').text()).toBe(url)
  await row.get('[data-test="copy"]').trigger('click')
  expect(writeText).toHaveBeenCalledWith(url)
  expect(row.get('[data-test="copy"]').text()).toBe('Copiado')
  vi.advanceTimersByTime(1500)
  await row.get('[data-test="copy"]').trigger('click')
  vi.advanceTimersByTime(1500)
  await row.vm.$nextTick()
  expect(row.get('[data-test="copy"]').text()).toBe('Copiado')
  vi.advanceTimersByTime(500)
  await row.vm.$nextTick()
  expect(row.get('[data-test="copy"]').text()).toBe('Copiar')
})

it('asks for the QR code and opens the link in the system browser', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const row = mountRow()
  expect(row.classes()).not.toContain('transmission-link--primary')
  await row.get('[data-test="qr"]').trigger('click')
  expect(row.emitted('qr')).toEqual([[url]])
  await row.get('[data-test="open"]').trigger('click')
  expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener')
  expect(row.get('[data-test="open"]').attributes('aria-label')).toBe('Abrir no navegador: Legenda para OBS')
  open.mockRestore()
  row.unmount()
})

it('still confirms the copy when the clipboard API is missing', async () => {
  Object.assign(navigator, { clipboard: undefined })
  const row = mountRow()
  await row.get('[data-test="copy"]').trigger('click')
  expect(row.get('[data-test="copy"]').text()).toBe('Copiado')
  row.unmount()
})
