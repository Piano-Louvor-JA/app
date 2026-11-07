// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'
import type { TransmissionInfo } from '../../types/transmission'

const session = vi.hoisted(() => ({
  transmission: vi.fn(),
  setTransmission: vi.fn(),
  resetToken: vi.fn(),
}))
vi.mock('../../services/palco-session', () => ({ palcoSession: session }))

import TransmissionNetworkCard from '../TransmissionNetworkCard.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })
let info: TransmissionInfo

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  info = {
    bind: 'all', requireToken: true, listenHost: '0.0.0.0', linkHost: '192.168.0.5', missing: false, token: 'AB12C',
    interfaces: [{ name: 'Wi-Fi', address: '192.168.0.5', virtual: false }, { name: 'docker0', address: '172.17.0.1', virtual: true }],
  }
  session.transmission.mockImplementation(async () => ({ ...info }))
  session.setTransmission.mockImplementation(async (changes: Partial<TransmissionInfo>) => { Object.assign(info, changes); return { ok: true, bind: info.bind, requireToken: info.requireToken } })
  session.resetToken.mockImplementation(async () => { info.token = 'ZZ99Q'; return 'ZZ99Q' })
})

function mountCard(locked = false) {
  return mount(TransmissionNetworkCard, { props: { locked }, global: { plugins: [i18n] }, attachTo: document.body })
}

it('lists every network of the computer and switches the bind when nothing is on air', async () => {
  const card = mountCard()
  await flushPromises()
  const select = card.get<HTMLSelectElement>('[data-test="bind"]')
  expect(select.findAll('option').map(option => option.text())).toEqual(['Todas as redes', 'Somente este computador', 'Wi-Fi · 192.168.0.5', 'docker0 · 172.17.0.1'])
  expect(select.element.value).toBe('all')
  await select.setValue('local')
  await flushPromises()
  expect(session.setTransmission).toHaveBeenCalledWith({ bind: 'local' })
  expect(card.text()).toContain('TVs e celulares não vão conseguir conectar.')
  expect(card.emitted('changed')).toHaveLength(1)
  card.unmount()
})

it('locks the network choice while a connection is on air', async () => {
  const card = mountCard(true)
  await flushPromises()
  expect(card.get('[data-test="bind"]').attributes('disabled')).toBeDefined()
  expect(card.text()).toContain('Encerre as conexões para trocar a rede.')
  card.unmount()
})

it('warns when the saved network disappeared and when the main refuses the change', async () => {
  info.bind = '10.8.0.2'
  info.missing = true
  session.setTransmission.mockResolvedValueOnce({ ok: false, reason: 'running' })
  const card = mountCard()
  await flushPromises()
  expect(card.text()).toContain('A rede escolhida não existe mais neste computador. Usando todas as redes.')
  expect(card.get<HTMLSelectElement>('[data-test="bind"]').element.value).toBe('all')
  await card.get('[data-test="bind"]').setValue('192.168.0.5')
  await flushPromises()
  expect(card.get('[role="alert"]').text()).toBe('Encerre as conexões para trocar a rede.')
  session.setTransmission.mockResolvedValueOnce(null)
  await card.get('[data-test="bind"]').setValue('local')
  await flushPromises()
  expect(card.get('[role="alert"]').text()).toBe('Não foi possível salvar a configuração de rede.')
  session.setTransmission.mockRejectedValueOnce(new Error('ipc'))
  await card.get('[data-test="bind"]').setValue('local')
  await flushPromises()
  expect(card.get('[role="alert"]').text()).toBe('Não foi possível salvar a configuração de rede.')
  card.unmount()
})

it('turns the network token off and on, hiding the token while it is not required', async () => {
  const card = mountCard()
  await flushPromises()
  expect(card.get('[data-test="token"]').text()).toBe('AB12C')
  await card.get('[role="switch"]').trigger('click')
  await flushPromises()
  expect(session.setTransmission).toHaveBeenCalledWith({ requireToken: false })
  expect(card.find('[data-test="token"]').exists()).toBe(false)
  expect(card.get('[role="switch"]').attributes('aria-checked')).toBe('false')
  await card.get('[role="switch"]').trigger('click')
  await flushPromises()
  expect(session.setTransmission).toHaveBeenLastCalledWith({ requireToken: true })
  expect(card.emitted('changed')).toHaveLength(2)
  card.unmount()
})

it('generates a new token only after confirmation', async () => {
  const card = mountCard()
  await flushPromises()
  await card.get('[data-test="new-token"]').trigger('click')
  const dialog = card.findComponent({ name: 'AppConfirm' })
  expect(dialog.props('open')).toBe(true)
  expect(dialog.props('message')).toBe('Dispositivos da rede serão desconectados e precisarão do link novo.')
  dialog.vm.$emit('cancel')
  await flushPromises()
  expect(session.resetToken).not.toHaveBeenCalled()
  await card.get('[data-test="new-token"]').trigger('click')
  dialog.vm.$emit('confirm')
  await flushPromises()
  expect(session.resetToken).toHaveBeenCalledOnce()
  expect(card.get('[data-test="token"]').text()).toBe('ZZ99Q')
  expect(card.emitted('changed')).toHaveLength(1)
  session.resetToken.mockResolvedValueOnce(null)
  await card.get('[data-test="new-token"]').trigger('click')
  dialog.vm.$emit('confirm')
  await flushPromises()
  expect(card.get('[role="alert"]').text()).toBe('Não foi possível salvar a configuração de rede.')
  session.resetToken.mockRejectedValueOnce(new Error('ipc'))
  session.transmission.mockRejectedValueOnce(new Error('ipc'))
  await card.get('[data-test="new-token"]').trigger('click')
  dialog.vm.$emit('confirm')
  await flushPromises()
  expect(card.get('[role="alert"]').text()).toBe('Não foi possível salvar a configuração de rede.')
  expect(card.get('[data-test="token"]').text()).toBe('ZZ99Q')
  card.unmount()
})

it('stays hidden outside the desktop app', async () => {
  session.transmission.mockResolvedValueOnce(null)
  const card = mountCard()
  await flushPromises()
  expect(card.find('.transmission-network').exists()).toBe(false)
  card.unmount()
})
