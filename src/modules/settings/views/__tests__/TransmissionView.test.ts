// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'
import { DEFAULT_OVERLAY_STYLE, type PalcoSlotStatus } from '../../types/transmission'

const session = vi.hoisted(() => ({
  slots: vi.fn(),
  setSlot: vi.fn(),
  turnOn: vi.fn(),
  turnOff: vi.fn(),
  startSlot: vi.fn(),
  stopSlot: vi.fn(),
  createSlot: vi.fn(),
  removeSlot: vi.fn(),
  updateSlot: vi.fn(),
  warmupObs: vi.fn(),
  refreshObs: vi.fn(),
  getConnectionPersistence: vi.fn(),
  setConnectionPersistence: vi.fn(),
}))
vi.mock('../../services/palco-session', () => ({ palcoSession: session }))
vi.mock('../../components/TransmissionAudioOptions.vue', () => ({ default: { template: '<div class="audio-options-stub" />' } }))
vi.mock('../../components/TransmissionNetworkCard.vue', () => ({
  default: { name: 'TransmissionNetworkCard', props: ['locked'], emits: ['changed'], template: '<div class="network-stub" />' },
}))

import TransmissionView from '../TransmissionView.vue'
import TransmissionConnectionCard from '../../components/TransmissionConnectionCard.vue'
import TransmissionQrDialog from '../../components/TransmissionQrDialog.vue'
import { obsConnections } from '../../services/obs-connections'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': { ...ptBR, common: { cancel: 'Cancelar' } } } })
let state: PalcoSlotStatus[]

function slot(id: string, httpPort: number, extra: Partial<PalcoSlotStatus> = {}): PalcoSlotStatus {
  return { id, label: id === '0' ? 'Principal' : `OBS ${(httpPort - 7080) / 2 + 1}`, running: false, clients: 0, httpPort, wsPort: httpPort + 1, overlay: { ...DEFAULT_OVERLAY_STYLE }, ...extra }
}
function setRunning(id: string, running: boolean) {
  state = state.map(item => item.id === id ? { ...item, running, overlayUrl: running ? `http://192.168.0.5:${item.httpPort}/legenda` : null } : item)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  obsConnections.value = []
  document.body.innerHTML = ''
  state = [slot('0', 7080), slot('7082', 7082, { running: true, clients: 3, overlayUrl: 'http://192.168.0.5:7082/legenda', receiverUrl: 'http://192.168.0.5:7082/espelho' })]
  session.slots.mockImplementation(async () => state.map(item => ({ ...item })))
  session.turnOn.mockImplementation(async () => { setRunning('0', true); return true })
  session.turnOff.mockImplementation(async () => { setRunning('0', false) })
  session.startSlot.mockImplementation(async (id: string) => { setRunning(id, true); return true })
  session.stopSlot.mockImplementation(async (id: string) => { setRunning(id, false) })
  session.warmupObs.mockResolvedValue(undefined)
  session.refreshObs.mockResolvedValue(true)
  session.updateSlot.mockResolvedValue({ ok: true })
  session.getConnectionPersistence.mockResolvedValue(false)
  session.setConnectionPersistence.mockImplementation(async (enabled: boolean) => enabled)
})

async function mountView() {
  const wrapper = mount(TransmissionView, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const cards = (wrapper: Awaited<ReturnType<typeof mountView>>) => wrapper.findAllComponents(TransmissionConnectionCard)

it('lists the main source first through the same card and summarizes what is on air', async () => {
  obsConnections.value = [{ id: '9999', label: 'Antiga', selected: true }]
  const view = await mountView()
  expect(cards(view).map(card => card.props('connection').name)).toEqual(['OBS', 'Fonte 2'])
  expect(cards(view)[0]!.props('connection')).toMatchObject({ id: '0', httpPort: 7080, running: false })
  const order = [...view.element.querySelectorAll('.transmission-view__cards, .transmission-view__actions, .network-stub')]
    .map(element => element.className.split(' ')[0])
  expect(order).toEqual(['transmission-view__actions', 'transmission-view__cards', 'network-stub'])
  expect(view.get('.transmission-view__status').text()).toBe('No ar · 3 dispositivos conectados')
  expect(view.get('.transmission-view__summary').text()).toBe('1 de 2 no ar')
  expect(view.findAll('h2').map(title => title.text())).toEqual(['Áudio e comportamento', 'Como usar no OBS'])
  expect(view.findAll('.transmission-view__steps li')).toHaveLength(4)
  expect(view.getComponent({ name: 'TransmissionNetworkCard' }).props('locked')).toBe(true)
  expect(view.find('.audio-options-stub').exists()).toBe(true)
  view.unmount()
})

it('shows the on-air status beside the settings title when the header has room for it', async () => {
  const aside = document.createElement('div')
  aside.id = 'settings-header-aside'
  document.body.appendChild(aside)
  const view = await mountView()
  expect(aside.querySelector('.transmission-view__status')?.textContent).toBe('No ar · 3 dispositivos conectados')
  expect(aside.querySelector('.transmission-view__summary')?.textContent).toBe('1 de 2 no ar')
  expect(view.find('.transmission-view__bar .transmission-view__status').exists()).toBe(false)
  view.unmount()
  expect(aside.childElementCount).toBe(0)
})

it('starts the main source with the stage greeting and stops the others directly', async () => {
  const view = await mountView()
  cards(view)[0]!.vm.$emit('toggle')
  await flushPromises()
  expect(session.turnOn).toHaveBeenCalledOnce()
  expect(session.warmupObs).toHaveBeenCalledWith('0')
  expect(cards(view)[0]!.props('connection').running).toBe(true)
  cards(view)[1]!.vm.$emit('toggle')
  await flushPromises()
  expect(session.stopSlot).toHaveBeenCalledWith('7082')
  expect(view.get('.transmission-view__summary').text()).toBe('1 de 2 no ar')
  cards(view)[0]!.vm.$emit('toggle')
  await flushPromises()
  expect(session.turnOff).toHaveBeenCalledOnce()
  expect(view.get('.transmission-view__status').text()).toBe('Desligada')
  expect(view.getComponent({ name: 'TransmissionNetworkCard' }).props('locked')).toBe(false)
  view.unmount()
})

it('ignores new actions while one is running and survives a failed start', async () => {
  let release!: (value: boolean) => void
  session.turnOn.mockImplementationOnce(() => new Promise<boolean>((resolve) => { release = resolve }))
  session.warmupObs.mockRejectedValueOnce(new Error('no source'))
  const view = await mountView()
  cards(view)[0]!.vm.$emit('toggle')
  await flushPromises()
  expect(cards(view)[1]!.props('busy')).toBe(true)
  cards(view)[1]!.vm.$emit('toggle')
  cards(view)[1]!.vm.$emit('reload')
  cards(view)[1]!.vm.$emit('port', 9000)
  await view.get('[data-test="add"]').trigger('click')
  expect(session.stopSlot).not.toHaveBeenCalled()
  expect(session.refreshObs).not.toHaveBeenCalled()
  expect(session.createSlot).not.toHaveBeenCalled()
  release(false)
  await flushPromises()
  expect(session.warmupObs).not.toHaveBeenCalled()
  expect(cards(view)[1]!.props('busy')).toBe(false)
  session.stopSlot.mockRejectedValueOnce(new Error('ipc'))
  cards(view)[1]!.vm.$emit('toggle')
  await flushPromises()
  expect(view.get('.transmission-view__error').text()).toBe('Não foi possível alterar a conexão. Tente novamente.')
  view.unmount()
})

it('saves port and appearance in the main and explains each refusal on the card', async () => {
  const view = await mountView()
  cards(view)[0]!.vm.$emit('port', 7090)
  await flushPromises()
  expect(session.updateSlot).toHaveBeenCalledWith('0', { httpPort: 7090 })
  expect(cards(view)[0]!.props('notice')).toBe('')
  const reasons: Array<[string, string]> = [
    ['range', 'Use uma porta entre 1024 e 65534.'],
    ['collision', 'Essa porta já pertence a outra conexão.'],
    ['running', 'Encerre a conexão para trocar a porta.'],
    ['port-in-use', 'A porta 7090 está em uso por outro programa.'],
    ['not-found', 'Não foi possível alterar a conexão. Tente novamente.'],
  ]
  for (const [reason, message] of reasons) {
    session.updateSlot.mockResolvedValueOnce({ ok: false, reason })
    cards(view)[0]!.vm.$emit('port', 7090)
    await flushPromises()
    expect(cards(view)[0]!.props('notice')).toBe(message)
  }
  session.updateSlot.mockRejectedValueOnce(new Error('ipc'))
  cards(view)[0]!.vm.$emit('port', 7090)
  await flushPromises()
  expect(cards(view)[0]!.props('notice')).toBe('Não foi possível alterar a conexão. Tente novamente.')
  const style = { ...DEFAULT_OVERLAY_STYLE, layout: 'fullscreen' as const }
  cards(view)[1]!.vm.$emit('style', style)
  await flushPromises()
  expect(session.updateSlot).toHaveBeenLastCalledWith('7082', { overlay: style })
  session.updateSlot.mockResolvedValueOnce({ ok: false, reason: 'not-found' })
  cards(view)[1]!.vm.$emit('style', style)
  await flushPromises()
  expect(cards(view)[1]!.props('notice')).toBe('Não foi possível salvar a aparência.')
  session.updateSlot.mockRejectedValueOnce(new Error('ipc'))
  cards(view)[1]!.vm.$emit('style', style)
  await flushPromises()
  expect(cards(view)[1]!.props('notice')).toBe('Não foi possível salvar a aparência.')
  view.unmount()
})

it('adds a numbered connection, starts it and reports failures', async () => {
  session.createSlot.mockImplementation(async (label: string) => { state = [...state, slot('7084', 7084, { label })]; return { id: '7084', label, httpPort: 7084, wsPort: 7085 } })
  const view = await mountView()
  await view.get('[data-test="add"]').trigger('click')
  await flushPromises()
  expect(session.createSlot).toHaveBeenCalledWith('OBS 3')
  expect(session.startSlot).toHaveBeenCalledWith('7084')
  expect(session.warmupObs).toHaveBeenCalledWith('7084')
  expect(cards(view).map(card => card.props('connection').name)).toEqual(['OBS', 'Fonte 2', 'Fonte 3'])
  obsConnections.value = obsConnections.value.map(item => item.id === '7084' ? { ...item, label: 'Telão' } : item)
  session.createSlot.mockResolvedValueOnce({ id: '7086', label: 'OBS 3', httpPort: 7086, wsPort: 7087 })
  session.startSlot.mockResolvedValueOnce(false)
  await view.get('[data-test="add"]').trigger('click')
  await flushPromises()
  expect(session.createSlot).toHaveBeenLastCalledWith('OBS 3')
  expect(session.warmupObs).not.toHaveBeenCalledWith('7086')
  expect(view.get('.transmission-view__error').text()).toBe('Não foi possível alterar a conexão. Tente novamente.')
  session.createSlot.mockResolvedValueOnce(null)
  await view.get('[data-test="add"]').trigger('click')
  await flushPromises()
  expect(view.get('.transmission-view__error').text()).toBe('Não foi possível alterar a conexão. Tente novamente.')
  view.unmount()
})

it('starts and stops every connection, keeping the failures visible', async () => {
  const view = await mountView()
  await view.get('[data-test="start-all"]').trigger('click')
  await flushPromises()
  expect(session.turnOn).toHaveBeenCalledOnce()
  expect(session.startSlot).not.toHaveBeenCalled()
  expect(view.get('[data-test="start-all"]').attributes('disabled')).toBeDefined()
  session.stopSlot.mockRejectedValueOnce(new Error('ipc'))
  await view.get('[data-test="stop-all"]').trigger('click')
  await flushPromises()
  expect(session.turnOff).toHaveBeenCalledOnce()
  expect(view.get('.transmission-view__error').text()).toBe('Algumas conexões não mudaram de estado. Confira e tente novamente.')
  await view.get('[data-test="stop-all"]').trigger('click')
  await flushPromises()
  session.turnOn.mockResolvedValueOnce(false)
  await view.get('[data-test="start-all"]').trigger('click')
  await flushPromises()
  expect(view.get('.transmission-view__error').text()).toBe('Algumas conexões não mudaram de estado. Confira e tente novamente.')
  view.unmount()
})

it('deletes a connection only after confirmation', async () => {
  session.removeSlot.mockImplementation(async (id: string) => { state = state.filter(item => item.id !== id); return true })
  const view = await mountView()
  cards(view)[1]!.vm.$emit('remove')
  await flushPromises()
  const dialog = view.findComponent({ name: 'AppConfirm' })
  expect(dialog.props('title')).toBe('Excluir Fonte 2?')
  dialog.vm.$emit('cancel')
  await flushPromises()
  expect(session.removeSlot).not.toHaveBeenCalled()
  cards(view)[1]!.vm.$emit('remove')
  dialog.vm.$emit('confirm')
  await flushPromises()
  expect(session.removeSlot).toHaveBeenCalledWith('7082')
  expect(obsConnections.value.map(item => item.id)).toEqual(['0'])
  expect(cards(view)).toHaveLength(1)
  dialog.vm.$emit('confirm')
  await flushPromises()
  expect(session.removeSlot).toHaveBeenCalledOnce()
  view.unmount()
})

it('reports a delete the main refused', async () => {
  session.removeSlot.mockResolvedValue(false)
  const view = await mountView()
  cards(view)[1]!.vm.$emit('remove')
  view.findComponent({ name: 'AppConfirm' }).vm.$emit('confirm')
  await flushPromises()
  expect(view.get('.transmission-view__error').text()).toBe('Não foi possível excluir a conexão. Tente novamente.')
  expect(obsConnections.value.map(item => item.id)).toContain('7082')
  view.unmount()
})

it('reloads open sources, saves nicknames and shows the QR code of a link', async () => {
  const view = await mountView()
  cards(view)[1]!.vm.$emit('reload')
  await flushPromises()
  expect(session.refreshObs).toHaveBeenCalledWith('7082')
  session.refreshObs.mockResolvedValueOnce(false)
  cards(view)[1]!.vm.$emit('reload')
  await flushPromises()
  expect(cards(view)[1]!.props('notice')).toBe('Não foi possível recarregar as fontes abertas.')
  cards(view)[1]!.vm.$emit('nickname', 'Telão')
  await flushPromises()
  expect(obsConnections.value.find(item => item.id === '7082')?.nickname).toBe('Telão')
  expect(cards(view)[1]!.props('connection').nickname).toBe('Telão')
  cards(view)[1]!.vm.$emit('qr', 'http://192.168.0.5:7082/legenda', 'Fonte 2 · Legenda para OBS')
  await flushPromises()
  const qr = view.getComponent(TransmissionQrDialog)
  expect(qr.props()).toEqual({ url: 'http://192.168.0.5:7082/legenda', title: 'Fonte 2 · Legenda para OBS' })
  qr.vm.$emit('close')
  await flushPromises()
  expect(qr.props('url')).toBeNull()
  view.unmount()
})

it('keeps a custom connection name and refreshes the list after a network change', async () => {
  state = [slot('0', 7080), slot('7082', 7082, { label: 'Telão lateral' })]
  const view = await mountView()
  expect(cards(view)[1]!.props('connection')).toMatchObject({ name: 'Fonte 2', nickname: 'Telão lateral' })
  obsConnections.value = obsConnections.value.map(item => item.id === '7082' ? { ...item, label: 'Telão' } : item)
  await flushPromises()
  expect(cards(view)[1]!.props('connection').name).toBe('Telão')
  const calls = session.slots.mock.calls.length
  view.getComponent({ name: 'TransmissionNetworkCard' }).vm.$emit('changed')
  await flushPromises()
  expect(session.slots.mock.calls.length).toBeGreaterThan(calls)
  view.unmount()
})

it('saves the restart preference and no longer offers the black background option', async () => {
  const view = await mountView()
  expect(session.getConnectionPersistence).toHaveBeenCalledOnce()
  const preserve = view.get('[data-test="preserve-connections"]')
  expect(preserve.attributes('aria-checked')).toBe('false')
  await preserve.trigger('click')
  await flushPromises()
  expect(session.setConnectionPersistence).toHaveBeenCalledWith(true)
  expect(preserve.attributes('aria-checked')).toBe('true')
  session.setConnectionPersistence.mockRejectedValueOnce(new Error('ipc'))
  await preserve.trigger('click')
  await flushPromises()
  expect(preserve.attributes('aria-checked')).toBe('true')
  expect(view.get('.transmission-view__error').text()).toBe('Não foi possível salvar a preferência das conexões.')
  expect(view.find('[data-test="black-idle"]').exists()).toBe(false)
  expect(view.text()).not.toContain('Ignorar fundo personalizado')
  view.unmount()
})

it('keeps the restart switch off when the preference cannot be read', async () => {
  session.getConnectionPersistence.mockRejectedValueOnce(new Error('ipc'))
  const view = await mountView()
  expect(view.get('[data-test="preserve-connections"]').attributes('aria-checked')).toBe('false')
  expect(view.text()).toContain('Ao abrir o app, religa as fontes que estavam no ar.')
  view.unmount()
})
