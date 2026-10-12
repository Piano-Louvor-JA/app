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

// Refs controláveis expostos para os testes.
type SysDisplay = { id: number; bounds: { x: number; y: number; width: number; height: number }; workArea: { x: number; y: number; width: number; height: number }; scaleFactor: number; isPrimary: boolean }
const mockDisplays = { value: [] as SysDisplay[] }
const mockSettings = { value: { monitorArrangement: [] as unknown[] } }
const identifyMonitorsMock = vi.fn().mockResolvedValue(undefined)
const resetMonitorArrangementMock = vi.fn(() => {
  mockSettings.value = { monitorArrangement: [] }
})

vi.mock('vue', async (importOriginal) => await importOriginal())

vi.mock('../../composables/useProjectionSettings', async () => {
  const { ref } = await import('vue')
  return {
    useProjectionSettings: () => ({
      displays: mockDisplays,
      settings: mockSettings,
      isLoadingDisplays: ref(false),
      isIdentifying: ref(false),
      identifyMonitors: identifyMonitorsMock,
      hasCustomArrangement: {
        get value() { return mockSettings.value.monitorArrangement.length > 0 },
      },
      moveMonitorInArrangement: vi.fn(),
      resetMonitorArrangement: resetMonitorArrangementMock,
    }),
  }
})

import MonitorArrangementCard from '../MonitorArrangementCard.vue'

async function mountCard() {
  const w = mount(MonitorArrangementCard)
  await flushPromises()
  return w
}

describe('MonitorArrangementCard', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    mockDisplays.value = []
    mockSettings.value = { monitorArrangement: [] }
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('sem monitores: mostra estado vazio e identify desabilitado', async () => {
    const w = await mountCard()
    active = w
    expect(w.text()).toContain('settings.projection.monitors.empty')
    const identify = w.find('.monitor-arrangement__identify')
    expect(identify.attributes('disabled')).toBeDefined()
  })

  it('com monitores: renderiza tiles e identify habilitado chama identifyMonitors', async () => {
    mockDisplays.value = [
      { id: 0, isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
      { id: 1, isPrimary: false, bounds: { x: 1920, y: 0, width: 1366, height: 768 }, workArea: { x: 1920, y: 0, width: 1366, height: 728 }, scaleFactor: 1 },
    ]
    const w = await mountCard()
    active = w
    expect(w.findAll('.monitor-tile').length).toBe(2)
    const identify = w.find('.monitor-arrangement__identify')
    expect(identify.attributes('disabled')).toBeUndefined()
    await identify.trigger('click')
    expect(identifyMonitorsMock).toHaveBeenCalled()
  })

  it('arranjo customizado: botão de reset aparece e reseta', async () => {
    mockDisplays.value = [{ id: 0, isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 }]
    mockSettings.value = { monitorArrangement: [{ displayId: 0, x: 10, y: 10 }] }
    const w = await mountCard()
    active = w
    const reset = w.find('.monitor-arrangement__reset')
    expect(reset.exists()).toBe(true)
    await reset.trigger('click')
    expect(resetMonitorArrangementMock).toHaveBeenCalled()
  })

  it('tile primário e estendido recebem classes distintas', async () => {
    mockDisplays.value = [
      { id: 0, isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
      { id: 1, isPrimary: false, bounds: { x: 1920, y: 0, width: 1366, height: 768 }, workArea: { x: 1920, y: 0, width: 1366, height: 728 }, scaleFactor: 1 },
    ]
    const w = await mountCard()
    active = w
    expect(w.find('.monitor-tile--primary').exists()).toBe(true)
    expect(w.find('.monitor-tile--extended').exists()).toBe(true)
  })

  it('eventos de pointer no stage não quebram sem drag ativo', async () => {
    mockDisplays.value = [{ id: 0, isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 }]
    const w = await mountCard()
    active = w
    const stage = w.find('.monitor-arrangement__stage')
    await stage.trigger('pointermove')
    await stage.trigger('pointerup')
    await stage.trigger('pointercancel')
    expect(true).toBe(true)
  })

  it('gaps onda1: arrangement custom (btn reset), tile com pointerdown e zIndex dragging', async () => {
    mockDisplays.value = [
      { id: 1, bounds: { x: 0, y: 0, width: 800, height: 600 }, workArea: { x: 0, y: 0, width: 800, height: 580 }, scaleFactor: 1, isPrimary: true },
      { id: 2, bounds: { x: 800, y: 0, width: 640, height: 480 }, workArea: { x: 800, y: 0, width: 640, height: 460 }, scaleFactor: 1, isPrimary: false },
    ]
    mockSettings.value = { monitorArrangement: [{ id: 1, left: 10, top: 5 }] }
    const w = await mountCard()
    active = w
    expect(w.find('.monitor-arrangement__reset').exists()).toBe(true)
    const tile = w.find('.monitor-tile')
    expect(tile.exists()).toBe(true)
    await tile.trigger('pointerdown', { button: 0, clientX: 0, clientY: 0 })
    await flushPromises()
    const resetBtn = w.find('.monitor-arrangement__reset')
    expect(resetBtn.text()).toContain('settings.projection.monitors.resetLayout')
    await resetBtn.trigger('click')
    await flushPromises()
    expect(resetMonitorArrangementMock).toHaveBeenCalled()
    w.unmount()
    active = null
  })
})
