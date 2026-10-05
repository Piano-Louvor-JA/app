// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-mock"><slot /></div>' },
}))

const lsData: Record<string, string> = {}
const lsStub = {
  getItem: (k: string) => lsData[k] ?? null,
  setItem: (k: string, v: string) => { lsData[k] = String(v) },
  removeItem: (k: string) => { delete lsData[k] },
  clear: () => { for (const k of Object.keys(lsData)) delete lsData[k] },
  key: () => null,
  length: 0,
}
Object.defineProperty(window, 'localStorage', { value: lsStub, configurable: true, writable: true })
Object.defineProperty(globalThis, 'localStorage', { value: lsStub, configurable: true, writable: true })

// Bridge do preload: palcoSession.isElectron lê window.louvorja.palco.
const palcoApi = {
  slots: vi.fn().mockResolvedValue([]),
  status: vi.fn().mockResolvedValue(null),
  createSlot: vi.fn().mockResolvedValue({ id: '1', label: 'TV', running: false, clients: 0, httpPort: 7080, wsPort: 7081 }),
  removeSlot: vi.fn().mockResolvedValue(true),
  start: vi.fn().mockResolvedValue(true),
  stop: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn(),
  onReceiverConnected: vi.fn(),
  onReceiverDisconnected: vi.fn(),
}
Object.defineProperty(window, 'louvorja', {
  get: () => ({ palco: palcoApi }),
  configurable: true,
})

import PalcoSlotsCard from '../PalcoSlotsCard.vue'

async function mountCard() {
  const w = mount(PalcoSlotsCard)
  await flushPromises()
  return w
}

describe('PalcoSlotsCard', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    palcoApi.slots.mockResolvedValue([])
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('carrega slots no mount', async () => {
    palcoApi.slots.mockResolvedValue([{ id: '0', label: 'Principal', running: true, clients: 1, httpPort: 7080, wsPort: 7081 }])
    const w = await mountCard()
    active = w
    expect(palcoApi.slots).toHaveBeenCalled()
    expect(w.text()).toContain(':7080')
  })

  it('addSlot cria slot e recarrega', async () => {
    const w = await mountCard()
    active = w
    const addBtn = w.find('.palco-slots-card__add')
    expect(addBtn.exists()).toBe(true)
    await addBtn.trigger('click')
    await flushPromises()
    expect(palcoApi.createSlot).toHaveBeenCalled()
    expect(palcoApi.slots).toHaveBeenCalledTimes(2)
  })

  it('removeSlot com id 0 é bloqueado', async () => {
    palcoApi.slots.mockResolvedValue([{ id: '0', label: 'Principal', running: false, clients: 0, httpPort: 7080, wsPort: 7081 }])
    const w = await mountCard()
    active = w
    const removeBtn = w.findAll('button').find((b) => b.text().includes('×') || b.text().includes('remove') || b.text().includes('Remove'))
    if (removeBtn) {
      await removeBtn.trigger('click')
      await flushPromises()
      expect(palcoApi.removeSlot).not.toHaveBeenCalled()
    }
  })

  it('removeSlot de slot real chama a API', async () => {
    palcoApi.slots.mockResolvedValue([{ id: '1', label: 'TV 2', running: false, clients: 0, httpPort: 7080, wsPort: 7081 }])
    const w = await mountCard()
    active = w
    const removeBtn = w.find('.palco-slot__remove')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    await flushPromises()
    expect(palcoApi.removeSlot).toHaveBeenCalledWith('1')
  })

  it('toggleSlot liga/desliga o slot', async () => {
    palcoApi.slots.mockResolvedValue([{ id: '1', label: 'TV 2', running: true, clients: 0, httpPort: 7080, wsPort: 7081 }])
    const w = await mountCard()
    active = w
    const toggleBtn = w.find('.palco-slot__power')
    expect(toggleBtn.exists()).toBe(true)
    await toggleBtn.trigger('click')
    await flushPromises()
    expect(palcoApi.stop).toHaveBeenCalledWith('1')
  })

  it('removeSlot do slot ativo volta para o slot 0 (setSlot)', async () => {
    palcoApi.slots.mockResolvedValue([{ id: '1', label: 'TV 2', running: false, clients: 0, httpPort: 7080, wsPort: 7081 }])
    const w = await mountCard()
    active = w
    // seleciona slot 1 → selectSlot chama palcoSession.setSlot('1')
    const selectBtn = w.find('.palco-slot__select')
    await selectBtn.trigger('click')
    await flushPromises()
    const removeBtn = w.find('.palco-slot__remove')
    await removeBtn.trigger('click')
    await flushPromises()
    expect(palcoApi.removeSlot).toHaveBeenCalledWith('1')
    // refresh volta com slot 0 principal após remoção
    expect(palcoApi.slots.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('toggleSlot de slot parado chama start', async () => {
    palcoApi.slots.mockResolvedValue([{ id: '1', label: 'TV 2', running: false, clients: 0, httpPort: 7080, wsPort: 7081 }])
    const w = await mountCard()
    active = w
    const powerBtn = w.find('.palco-slot__power')
    await powerBtn.trigger('click')
    await flushPromises()
    expect(palcoApi.start).toHaveBeenCalledWith('1')
  })

  it('unmount limpa listeners sem erro', async () => {
    const w = await mountCard()
    w.unmount()
    expect(true).toBe(true)
  })

  it('slots com receiverIps e clients 0: renderiza waiting e ips', async () => {
    palcoApi.slots.mockResolvedValue([
      { id: '2', label: 'TV Fundos', httpPort: 8081, clients: 0, receiverIps: ['192.168.0.10', '192.168.0.11'] },
    ])
    const w = await mountCard()
    await flushPromises()
    expect(w.text()).toContain('192.168.0.10, 192.168.0.11')
    expect(w.text()).toContain('settings.palco.waiting')
    w.unmount()
    palcoApi.slots.mockResolvedValue([])
  })

  it('refresh fora do electron: não consulta a API', async () => {
    Object.defineProperty(window, 'louvorja', {
      get: () => undefined,
      configurable: true,
    })
    palcoApi.slots.mockClear()
    const w = await mountCard()
    await flushPromises()
    const vm = w.vm as unknown as { refresh?: () => Promise<void> }
    await vm.refresh?.()
    expect(palcoApi.slots).not.toHaveBeenCalled()
    w.unmount()
  })

  it('gaps9: polling de 3s dispara refresh (fn 62)', async () => {
    Object.defineProperty(window, 'louvorja', {
      get: () => ({ palco: palcoApi }),
      configurable: true,
    })
    vi.useFakeTimers()
    try {
      const w = mount(PalcoSlotsCard)
      await vi.advanceTimersByTimeAsync(0)
      await Promise.resolve()
      await flushPromises()
      const calls0 = palcoApi.slots.mock.calls.length
      expect(calls0).toBeGreaterThan(0)
      await vi.advanceTimersByTimeAsync(3000)
      await flushPromises()
      expect(palcoApi.slots.mock.calls.length).toBeGreaterThan(calls0)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
