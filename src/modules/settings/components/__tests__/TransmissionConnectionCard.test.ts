// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'
import TransmissionConnectionCard from '../TransmissionConnectionCard.vue'
import TransmissionLinkRow from '../TransmissionLinkRow.vue'
import TransmissionOverlayStyle from '../TransmissionOverlayStyle.vue'
import { DEFAULT_OVERLAY_STYLE, type TransmissionConnection } from '../../types/transmission'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })

function connection(overrides: Partial<TransmissionConnection> = {}): TransmissionConnection {
  return {
    id: '0', name: 'Fonte 1', running: false, clients: 0, receiverIps: [], httpPort: 47080, error: null,
    overlay: { ...DEFAULT_OVERLAY_STYLE }, overlayUrl: null, receiverUrl: null, returnUrl: null, ...overrides,
  }
}
function mountCard(value: TransmissionConnection, extra: Record<string, unknown> = {}) {
  return mount(TransmissionConnectionCard, { props: { connection: value, busy: false, ...extra }, global: { plugins: [i18n] } })
}

it('main source stopped: editable port with the TV warning, no links and no delete', async () => {
  const card = mountCard(connection())
  expect(card.get('.transmission-card__name').text()).toBe('Fonte 1')
  expect(card.text()).toContain('Desligada')
  expect(card.text()).toContain('Inicie a conexão para gerar os links.')
  expect(card.text()).toContain('TVs com o app Palco procuram a porta padrão 47080.')
  expect(card.text()).toContain('WebSocket na porta 47081')
  expect(card.find('[data-test="remove"]').exists()).toBe(false)
  expect(card.find('[data-test="reload"]').exists()).toBe(false)
  expect(card.find('[data-test="nickname"]').exists()).toBe(false)
  expect(card.find('[data-test="port-apply"]').exists()).toBe(false)
  const port = card.get<HTMLInputElement>('[data-test="port"]')
  expect(port.element.value).toBe('47080')
  await port.setValue('7090')
  expect(card.text()).toContain('WebSocket na porta 7091')
  await card.get('[data-test="port-apply"]').trigger('click')
  expect(card.emitted('port')).toEqual([[7090]])
  await port.setValue('80')
  expect(card.text()).toContain('Use uma porta entre 1024 e 65534.')
  expect(card.get('[data-test="port-apply"]').attributes('disabled')).toBeDefined()
  await port.trigger('keydown', { key: 'Enter' })
  expect(card.emitted('port')).toHaveLength(1)
  await port.setValue('7100')
  await port.trigger('keydown', { key: 'Enter' })
  expect(card.emitted('port')).toEqual([[7090], [7100]])
  await card.setProps({ connection: connection({ httpPort: 7100 }) })
  expect(card.find('[data-test="port-apply"]').exists()).toBe(false)
  await card.get('[data-test="toggle"]').trigger('click')
  expect(card.emitted('toggle')).toHaveLength(1)
})

it('extra source on air: both links, reload, delete and a locked port', async () => {
  const card = mountCard(connection({
    id: '7082', name: 'Fonte 2', running: true, clients: 2, receiverIps: ['192.168.0.9', '192.168.0.12'], httpPort: 7082,
    overlayUrl: 'http://192.168.0.5:7082/overlay?token=AB12C', receiverUrl: 'http://192.168.0.5:7082/?token=AB12C',
    returnUrl: 'http://192.168.0.5:7082/retorno?token=AB12C',
  }))
  expect(card.classes()).toContain('transmission-card--on')
  expect(card.text()).toContain('No ar')
  expect(card.text()).toContain('2 dispositivos conectados')
  expect(card.text()).toContain('192.168.0.9, 192.168.0.12')
  expect(card.text()).not.toContain('TVs com o app Palco')
  expect(card.text()).toContain('Encerre a conexão para trocar a porta.')
  expect(card.get('[data-test="port"]').attributes('disabled')).toBeDefined()
  const links = card.findAllComponents(TransmissionLinkRow)
  expect(links.map(link => link.props('url'))).toEqual(['http://192.168.0.5:7082/overlay?token=AB12C', 'http://192.168.0.5:7082/?token=AB12C', 'http://192.168.0.5:7082/retorno?token=AB12C'])
  expect(links[0]!.props('primary')).toBe(true)
  expect(links[2]!.props('label')).toBe('Retorno de palco')
  expect(links[2]!.props('primary')).toBe(false)
  links[2]!.vm.$emit('qr', 'http://192.168.0.5:7082/retorno?token=AB12C')
  expect(card.emitted('qr')).toEqual([['http://192.168.0.5:7082/retorno?token=AB12C', 'Fonte 2 · Retorno de palco']])
  links[1]!.vm.$emit('qr', 'http://192.168.0.5:7082/?token=AB12C')
  expect(card.emitted('qr')![1]).toEqual(['http://192.168.0.5:7082/?token=AB12C', 'Fonte 2 · Réplica do Palco'])
  links[0]!.vm.$emit('qr', 'http://192.168.0.5:7082/overlay?token=AB12C')
  expect(card.emitted('qr')![2]).toEqual(['http://192.168.0.5:7082/overlay?token=AB12C', 'Fonte 2 · Overlay para OBS'])
  const actions = card.findAll('.transmission-card__actions button').map((b) => b.attributes('data-test'))
  expect(actions).toEqual(['reload', 'toggle', 'remove'])
  expect(card.find('.transmission-card__links [data-test="reload"]').exists()).toBe(false)
  await card.get('[data-test="reload"]').trigger('click')
  expect(card.emitted('reload')).toHaveLength(1)
  await card.get('[data-test="remove"]').trigger('click')
  expect(card.emitted('remove')).toHaveLength(1)
  await card.setProps({ connection: connection({ running: true, clients: 1, overlayUrl: 'http://127.0.0.1:7080/overlay' }) })
  expect(card.text()).toContain('1 dispositivo conectado')
  expect(card.findAllComponents(TransmissionLinkRow)).toHaveLength(1)
  await card.setProps({ connection: connection({ running: true, clients: 0 }) })
  expect(card.get('.transmission-card__state').text()).toBe('No ar · Aguardando conexões')
})

it('explains a busy port and offers the suggested one, plus generic failures', async () => {
  const card = mountCard(connection({ id: '7082', name: 'Fonte 2', httpPort: 9100, error: { code: 'port-in-use', port: 9100, suggestedPort: 9102 } }), { notice: 'Essa porta já pertence a outra conexão.' })
  expect(card.text()).toContain('A porta 9100 está em uso por outro programa.')
  expect(card.get('[role="alert"]').text()).toContain('Essa porta já pertence a outra conexão.')
  await card.get('[data-test="port-suggest"]').trigger('click')
  expect(card.emitted('port')).toEqual([[9102]])
  await card.setProps({ connection: connection({ error: { code: 'port-in-use', port: 7080, suggestedPort: null } }), notice: '' })
  expect(card.find('[data-test="port-suggest"]').exists()).toBe(false)
  expect(card.find('[role="alert"]').exists()).toBe(true)
  await card.setProps({ connection: connection({ error: { code: 'start-failed', port: 7080 } }) })
  expect(card.text()).toContain('Não foi possível iniciar a conexão.')
  await card.setProps({ connection: connection(), busy: true })
  expect(card.find('[role="alert"]').exists()).toBe(false)
  expect(card.get('[data-test="toggle"]').attributes('disabled')).toBeDefined()
  await card.setProps({ notice: 'Não foi possível salvar a aparência.' })
  expect(card.get('[role="alert"]').text()).toBe('Não foi possível salvar a aparência.')
})

it('keeps the nickname being typed through refreshes and saves it on change', async () => {
  const extra = (overrides: Partial<TransmissionConnection> = {}) => connection({ id: '47082', name: 'Fonte 2', ...overrides })
  const card = mountCard(extra({ nickname: 'Mesa' }))
  const input = card.get<HTMLInputElement>('[data-test="nickname"]')
  expect(input.element.value).toBe('Mesa')
  input.element.value = 'Mesa de som'
  await input.trigger('input')
  await card.setProps({ connection: extra({ nickname: 'Mesa', clients: 0 }) })
  expect(input.element.value).toBe('Mesa de som')
  await input.trigger('change')
  expect(card.emitted('nickname')).toEqual([['Mesa de som']])
  await card.setProps({ connection: extra({ nickname: 'Mesa de som' }) })
  expect(input.element.value).toBe('Mesa de som')
  input.element.focus()
  await input.trigger('keydown', { key: 'Enter' })
  expect(document.activeElement).not.toBe(input.element)
  await card.setProps({ connection: extra({ httpPort: null }) })
  expect(card.get<HTMLInputElement>('[data-test="port"]').element.value).toBe('')
  expect(card.text()).not.toContain('WebSocket na porta')
})

it('shows the overlay appearance inside the overlay link box, and still offers it while stopped', async () => {
  const card = mountCard(connection({ running: true, clients: 1, overlayUrl: 'http://127.0.0.1:47080/overlay', receiverUrl: 'http://127.0.0.1:47080/' }))
  const boxes = card.findAll('.transmission-link')
  expect(boxes[0]!.find('[data-test="style-toggle"]').exists()).toBe(true)
  expect(boxes[1]!.find('[data-test="style-toggle"]').exists()).toBe(false)
  expect(card.findAll('[data-test="style-toggle"]')).toHaveLength(1)
  await boxes[0]!.get('[data-test="style-toggle"]').trigger('click')
  expect(boxes[0]!.findComponent(TransmissionOverlayStyle).exists()).toBe(true)
  await card.setProps({ connection: connection() })
  expect(card.findAll('[data-test="style-toggle"]')).toHaveLength(1)
  expect(card.findComponent(TransmissionOverlayStyle).exists()).toBe(true)
})

it('opens the overlay appearance editor and forwards the chosen style', async () => {
  const card = mountCard(connection())
  const toggle = card.get('[data-test="style-toggle"]')
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(card.findComponent(TransmissionOverlayStyle).exists()).toBe(false)
  await toggle.trigger('click')
  expect(toggle.attributes('aria-expanded')).toBe('true')
  const editor = card.getComponent(TransmissionOverlayStyle)
  expect(editor.props('name')).toBe('Fonte 1')
  editor.vm.$emit('update:modelValue', { ...DEFAULT_OVERLAY_STYLE, theme: 'light' })
  expect(card.emitted('style')).toEqual([[{ ...DEFAULT_OVERLAY_STYLE, theme: 'light' }]])
})
