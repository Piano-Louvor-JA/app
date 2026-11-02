vi.mock('@modules/settings/components/TransmissionAudioOptions.vue', () => ({ default: { template: '<div class="audio-options-stub" />' } }))
vi.mock('@modules/settings/components/StageCustomizationCard.vue', () => ({ default: { props: ['onlyScope'], template: '<div class="stage-custom-stub" :data-scope="onlyScope" />' } }))
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Composable testado à parte: aqui só o contrato tela ↔ minimizar.
const minimizeMock = vi.fn(async () => {})
const prepareMock = vi.fn()
vi.mock('@shared/composables/useMinimizablePage', () => ({
  useMinimizablePage: (options: unknown) => {
    ;(globalThis as any).__minimizeOptions = options
    return { minimize: minimizeMock, prepare: prepareMock, takeRestoredState: () => null }
  },
}))
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const palco = vi.hoisted(() => ({
  getConnectionPersistence: vi.fn().mockResolvedValue(false),
  setConnectionPersistence: vi.fn(async (enabled: boolean) => enabled),
  setSlot: vi.fn(),
  syncObsIdle: vi.fn(),
  refreshObs: vi.fn().mockResolvedValue(true),
  warmupObs: vi.fn().mockResolvedValue(undefined),
  status: vi.fn(),
  slots: vi.fn(async () => []),
  statusSlot: vi.fn(),
  createSlot: vi.fn(),
  removeSlot: vi.fn(),
  startSlot: vi.fn(),
  stopSlot: vi.fn(),
  turnOn: vi.fn(),
  turnOff: vi.fn(),
}))

vi.mock('@modules/settings/services/palco-session', () => ({
  palcoSession: palco,
}))

import ObsView from '../ObsView.vue'
import { obsConnections } from '@modules/settings/services/obs-connections'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      utilities: {
        obsSource: 'Fonte {n}',
        obs: 'Transmitir via OBS',
        obsLead: 'lead',
        obsTransmission: 'Transmissão',
        obsOn: 'No ar — {n} viewer(s)',
        obsOff: 'Desligada',
        obsStart: 'Iniciar transmissão',
        obsStop: 'Encerrar',
        obsUrlLabel: 'URL do Browser Source',
        obsCopy: 'Copiar URL',
        obsCopied: 'Copiada!',
        obsHowTitle: 'No OBS (uma vez só):',
        obsStep1: 'passo 1',
        obsStep2: 'passo 2',
        obsStep3: 'passo 3',
      },
    },
  },
})

function mountView() {
  return mount(ObsView, {
    global: {
      plugins: [i18n],
      mocks: { $router: { back: vi.fn() } },
    },
  })
}

describe('ObsView', () => {
  it('preserva apelido em edição durante atualização de conexões', async () => {
    palco.status.mockResolvedValue({ running: false, clients: 0, receiverUrl: null })
    const w = mountView()
    await flushPromises()
    const input = w.get<HTMLInputElement>('.obs-view__nickname')
    input.element.value = 'Transmissão ao vivo'
    await input.trigger('input')
    obsConnections.value = [...obsConnections.value]
    await flushPromises()
    expect(input.element.value).toBe('Transmissão ao vivo')
    await input.trigger('change')
    expect(obsConnections.value.find((item) => item.id === '0')?.nickname).toBe('Transmissão ao vivo')
    w.unmount()
  })
  it('atualiza somente a conexão OBS escolhida', async () => {
    palco.status.mockResolvedValue({ running: true, clients: 1, receiverUrl: 'http://localhost:7080/' })
    palco.refreshObs.mockClear()
    const w = mountView()
    await flushPromises()
    await w.get('.obs-view__refresh').trigger('click')
    await flushPromises()
    expect(palco.refreshObs).toHaveBeenCalledExactlyOnceWith('0')
    w.unmount()
  })
  it('permite apelido em OBS 1 sem substituir sua identificação', async () => {
    palco.status.mockResolvedValue({ running: false, clients: 0, receiverUrl: null })
    const w = mountView()
    await flushPromises()
    const input = w.get('.obs-view__nickname')
    await input.setValue('Mesa de som')
    await input.trigger('change')
    expect(w.find('.audio-options-stub').exists()).toBe(true)
    expect(w.find('.stage-custom-stub').exists()).toBe(false)
    expect(w.get('.obs-view__connection-name').text()).toBe('Fonte 1')
    expect(obsConnections.value.find((item) => item.id === '0')?.nickname).toBe('Mesa de som')
    w.unmount()
  })
  beforeEach(() => {
    obsConnections.value = []
    palco.slots.mockResolvedValue([])
    palco.status.mockReset()
    palco.turnOn.mockReset()
    palco.turnOff.mockReset()
    palco.turnOn.mockResolvedValue(true)
    palco.turnOff.mockResolvedValue(undefined)
  })

  it('excluir pede confirmação; cancelar preserva e confirmar remove somente a conexão escolhida', async () => {
    obsConnections.value = [{ id: '7082', label: 'OBS 2', selected: true }]
    palco.status.mockResolvedValue({ running: false, clients: 0, receiverUrl: null })
    palco.slots.mockResolvedValue([{ id: '7082', running: true, clients: 1 }])
    palco.statusSlot.mockResolvedValue({ running: true, clients: 1, receiverUrl: 'http://localhost:7082/' })
    palco.removeSlot.mockResolvedValue(true)
    palco.removeSlot.mockClear()
    const w = mountView()
    await flushPromises()
    expect(w.findAll('.obs-view__delete')).toHaveLength(1)
    await w.find('.obs-view__delete').trigger('click')
    expect(palco.removeSlot).not.toHaveBeenCalled()
    const dialog = w.findComponent({ name: 'AppConfirm' })
    expect(dialog.props('open')).toBe(true)
    dialog.vm.$emit('cancel')
    await flushPromises()
    expect(obsConnections.value).toHaveLength(1)
    expect(palco.removeSlot).not.toHaveBeenCalled()
    await w.find('.obs-view__delete').trigger('click')
    dialog.vm.$emit('confirm')
    await flushPromises()
    expect(palco.removeSlot).toHaveBeenCalledOnce()
    expect(palco.removeSlot).toHaveBeenCalledWith('7082')
    expect(obsConnections.value).toHaveLength(0)
    expect(w.findAll('.obs-view__connection')).toHaveLength(1)
    expect(w.find('.obs-view__connection-name').text()).toBe('Fonte 1')
    expect(palco.turnOff).not.toHaveBeenCalled()
    w.unmount()
  })

  it('identifica OBS 1 e permite iniciar e encerrar todas as conexões OBS sem tocar outras saídas', async () => {
    let principal = false
    const state: Record<string, boolean> = { '7082': false, '7084': false, '7086': true }
    obsConnections.value = [
      { id: '7082', label: 'OBS 2', selected: true },
      { id: '7084', label: 'OBS 3', selected: true },
    ]
    palco.status.mockImplementation(async () => ({ running: principal, clients: 0, receiverUrl: principal ? 'http://localhost:7080' : null }))
    palco.slots.mockImplementation(async () => Object.entries(state).map(([id, running]) => ({ id, running, clients: 0 })))
    palco.statusSlot.mockImplementation(async (id: string) => ({ running: state[id], clients: 0, receiverUrl: state[id] ? `http://localhost:${id}` : null }))
    palco.turnOn.mockImplementation(async () => { principal = true; return true })
    palco.turnOff.mockImplementation(async () => { principal = false })
    palco.startSlot.mockImplementation(async (id: string) => { state[id] = true; return true })
    palco.stopSlot.mockImplementation(async (id: string) => { state[id] = false })
    palco.startSlot.mockClear()
    palco.stopSlot.mockClear()
    const w = mountView()
    await flushPromises()
    expect(w.find('.obs-view__connection-name').text()).toBe('Fonte 1')
    await w.find('.obs-view__start-all').trigger('click')
    await flushPromises()
    expect(palco.turnOn).toHaveBeenCalledOnce()
    expect(palco.startSlot).toHaveBeenCalledWith('7082')
    expect(palco.startSlot).toHaveBeenCalledWith('7084')
    expect(palco.startSlot).not.toHaveBeenCalledWith('7086')
    expect(palco.warmupObs).toHaveBeenCalledWith('0')
    expect(palco.warmupObs).toHaveBeenCalledWith('7082')
    expect(palco.warmupObs).toHaveBeenCalledWith('7084')
    expect(w.find('.obs-view__start-all').attributes('disabled')).toBeDefined()
    await w.find('.obs-view__stop-all').trigger('click')
    await flushPromises()
    expect(palco.turnOff).toHaveBeenCalledOnce()
    expect(palco.stopSlot).toHaveBeenCalledWith('7082')
    expect(palco.stopSlot).toHaveBeenCalledWith('7084')
    expect(palco.stopSlot).not.toHaveBeenCalledWith('7086')
    expect(state['7086']).toBe(true)
    expect(w.find('.obs-view__stop-all').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('cria nova conexão OBS com URL própria sem trocar a principal', async () => {
    palco.status.mockResolvedValue({ running: false, clients: 0, receiverUrl: null })
    palco.createSlot.mockResolvedValue({ id: '7082', label: 'OBS 2' })
    palco.startSlot.mockResolvedValue(true)
    palco.statusSlot.mockResolvedValue({ running: true, clients: 0, receiverUrl: 'http://localhost:7082/?token=test' })
    palco.slots.mockImplementation(async () => obsConnections.value.map((item) => ({ ...item, running: true, clients: 0 })))
    const w = mountView()
    await flushPromises()
    await w.find('.obs-view__add').trigger('click')
    await flushPromises()
    expect(palco.createSlot).toHaveBeenCalledWith('OBS 2')
    expect(palco.startSlot).toHaveBeenCalledWith('7082')
    expect(w.findAll('.obs-view__connection')[1]!.text()).toContain('http://localhost:7082/?token=test')
    expect(palco.turnOff).not.toHaveBeenCalled()
    w.unmount()
  })

  it('mostra a transmissão desligada e, ao ligar, a URL do Browser Source', async () => {
    palco.status
      .mockResolvedValueOnce({
        running: false,
        clients: 0,
        receiverUrl: null,
      })
      .mockResolvedValueOnce({
        running: true,
        clients: 2,
        receiverUrl: 'http://10.0.0.8:7080/?token=abc',
      })

    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('Desligada')
    expect(w.find('.obs-view__url').exists()).toBe(false)

    await w.get('.obs-view__toggle').trigger('click')
    await flushPromises()

    expect(palco.turnOn).toHaveBeenCalledOnce()
    expect(w.text()).toContain('No ar — 2 viewer(s)')
    expect(w.find('.obs-view__url').text()).toBe(
      'http://10.0.0.8:7080/?token=abc',
    )
    expect(w.findAll('.obs-view__steps li')).toHaveLength(3)
    w.unmount()
  })

  it('copia a URL e encerra a transmissão', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    palco.status
      .mockResolvedValueOnce({
        running: true,
        clients: 1,
        receiverUrl: 'http://10.0.0.8:7080/?token=abc',
      })
      .mockResolvedValueOnce({
        running: false,
        clients: 0,
        receiverUrl: null,
      })

    const w = mountView()
    await flushPromises()
    await w.get('.obs-view__connection .obs-view__copy').trigger('click')
    expect(writeText).toHaveBeenCalledWith('http://10.0.0.8:7080/?token=abc')
    expect(w.text()).toContain('Copiada!')

    await w.get('.obs-view__toggle').trigger('click')
    await flushPromises()
    expect(palco.turnOff).toHaveBeenCalledOnce()
    expect(w.text()).toContain('Desligada')
    w.unmount()
  })
})

describe('ObsView — minimizar página', () => {
  it('– fica abaixo da seta de voltar, minimiza e descreve a tela', async () => {
    minimizeMock.mockClear()
    const w = mountView()
    const stack = w.find('.page-back-stack')
    expect(stack.find('.obs-view__back').exists()).toBe(true)
    await stack.find('.page-back-stack__minimize').trigger('click')
    expect(minimizeMock).toHaveBeenCalledTimes(1)
    const options = (globalThis as any).__minimizeOptions
    expect(options.describe()).toEqual({ title: 'Transmitir via OBS', icon: 'ti-broadcast', summary: '' })
    expect(options.capture()).toBeNull()
    expect(options.fallbackRoute).toEqual({ name: 'settings-appearance' })
    w.unmount()
  })
})

it('saves the preserve-connections preference through the native API', async () => {
  const wrapper = mountView()
  await flushPromises()
  await wrapper.get('[data-test="preserve-connections"]').setValue(true)
  await flushPromises()
  expect(palco.setConnectionPersistence).toHaveBeenCalledWith(true)
  expect((wrapper.get('[data-test="preserve-connections"]').element as HTMLInputElement).checked).toBe(true)
  wrapper.unmount()
})
