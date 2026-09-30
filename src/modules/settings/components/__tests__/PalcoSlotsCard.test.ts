// @vitest-environment jsdom
// PalcoSlotsCard — slots, add/remove/toggle/select, receiverIps, poll 3s
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const { mockSlots, mockCreateSlot, mockRemoveSlot, mockStart, mockStop, mockSetSlot, mockSlotId, mockIsElectron } = vi.hoisted(() => ({
  mockSlots: vi.fn(),
  mockCreateSlot: vi.fn(),
  mockRemoveSlot: vi.fn(),
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockSetSlot: vi.fn(),
  mockSlotId: { value: '0' },
  mockIsElectron: { value: true },
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('../../services/palco-session', () => ({
  palcoSession: {
    get slotId() { return mockSlotId.value },
    setSlot: mockSetSlot,
    get isElectron() { return mockIsElectron.value },
  },
}))

import PalcoSlotsCard from '../PalcoSlotsCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        palco: {
          tvs: 'TVs',
          tvsHint: 'Slots',
          addTv: 'Adicionar',
          tv: 'TV',
          mainTv: 'TV Principal',
          connected: '{count} conectado(s)',
          waiting: 'Aguardando',
          selected: 'Selecionada',
          stop: 'Parar',
          start: 'Iniciar',
          removeTv: 'Remover',
          moduleHint: 'Dica',
        },
      },
    },
  },
})

function setBridge(slots: unknown[]) {
  Object.assign(window, {
    louvorja: {
      palco: {
        slots: mockSlots.mockResolvedValue(slots),
        createSlot: mockCreateSlot,
        removeSlot: mockRemoveSlot.mockResolvedValue(true),
        start: mockStart.mockResolvedValue(true),
        stop: mockStop.mockResolvedValue(undefined),
      },
    },
  })
}

const slot0 = { id: '0', label: 'Principal', running: true, clients: 2, httpPort: 8080, wsPort: 8081 }
const slot1 = { id: '1', label: 'TV Sala', running: false, clients: 0, httpPort: 8082, wsPort: 8083, receiverIps: ['192.168.0.5'] }

function createWrapper() {
  return mount(PalcoSlotsCard, { global: { plugins: [i18n] } })
}

describe('PalcoSlotsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSlotId.value = '0'
    mockIsElectron.value = true
    setBridge([slot0, slot1])
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renderiza slots com labels, portas e IPs', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    const items = wrapper.findAll('.palco-slot')
    expect(items.length).toBe(2)
    expect(items[0].text()).toContain('TV Principal')
    expect(items[0].text()).toContain(':8080')
    expect(items[0].text()).toContain('2 conectado(s)')
    expect(items[1].text()).toContain('TV Sala')
    expect(items[1].text()).toContain('192.168.0.5')
    expect(items[1].text()).toContain('Aguardando')
  })

  it('dot verde quando running com clients', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(wrapper.find('.palco-slot__dot--on').exists()).toBe(true)
  })

  it('slot 0 não tem botão remover', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(wrapper.findAll('.palco-slot__remove').length).toBe(1)
  })

  it('badge selecionada no slot ativo', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(wrapper.findAll('.palco-slot__badge').length).toBe(1)
  })

  it('selectSlot: troca ativo e persiste na sessão', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    await wrapper.findAll('.palco-slot__select')[1].trigger('click')
    expect(mockSetSlot).toHaveBeenCalledWith('1')
  })

  it('toggleSlot: rodando → stop', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    await wrapper.findAll('.palco-slot__power')[0].trigger('click')
    await flushPromises()
    expect(mockStop).toHaveBeenCalledWith('0')
  })

  it('toggleSlot: parado → start', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    await wrapper.findAll('.palco-slot__power')[1].trigger('click')
    await flushPromises()
    expect(mockStart).toHaveBeenCalledWith('1')
  })

  it('removeSlot: chama api e refresca', async () => {
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    await wrapper.find('.palco-slot__remove').trigger('click')
    await flushPromises()
    expect(mockRemoveSlot).toHaveBeenCalledWith('1')
  })

  it('removeSlot do slot ativo: volta pro 0', async () => {
    mockSlotId.value = '1'
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    await wrapper.find('.palco-slot__remove').trigger('click')
    await flushPromises()
    expect(mockSetSlot).toHaveBeenCalledWith('0')
  })

  it('addSlot: createSlot com label TV N', async () => {
    mockCreateSlot.mockResolvedValue(slot1)
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    await wrapper.find('.palco-slots-card__add').trigger('click')
    await flushPromises()
    expect(mockCreateSlot).toHaveBeenCalledWith('TV 3')
  })

  it('refresh poll a cada 3s', async () => {
    createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    const calls = mockSlots.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(mockSlots.mock.calls.length).toBeGreaterThan(calls)
  })

  it('não electron: não carrega slots', async () => {
    mockIsElectron.value = false
    const wrapper = createWrapper()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(mockSlots).not.toHaveBeenCalled()
  })
})
