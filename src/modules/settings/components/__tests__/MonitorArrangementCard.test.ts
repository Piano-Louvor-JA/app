// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const identifyMock = vi.fn()
const resetMock = vi.fn()
const pointerMocks = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onPointerCancel: vi.fn(),
}

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-stub"><slot /></div>' },
}))

vi.mock('../../composables/useProjectionSettings', async () => {
  const { ref } = await import('vue')
  return {
    useProjectionSettings: () => ({
      isLoadingDisplays: ref(false),
      isIdentifying: ref(false),
      identifyMonitors: identifyMock,
    }),
  }
})

vi.mock('../../composables/useMonitorArrangement', async () => {
  const { ref } = await import('vue')
  return {
    useMonitorArrangement: () => ({
      tiles: ref([
        { id: 'm1', label: 'Monitor 1', isPrimary: true, x: 0, y: 0, w: 100, h: 80 },
        { id: 'm2', label: 'Monitor 2', isPrimary: false, x: 110, y: 0, w: 100, h: 80 },
      ]),
      draggingId: ref<string | null>(null),
      hasCustomArrangement: ref(false),
      ...pointerMocks,
      resetLayout: resetMock,
    }),
  }
})

import MonitorArrangementCard from '../MonitorArrangementCard.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': {} } })

function createWrapper() {
  return mount(MonitorArrangementCard, { global: { plugins: [i18n] } })
}

describe('MonitorArrangementCard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza tiles de monitores', () => {
    const wrapper = createWrapper()
    const tiles = wrapper.findAll('.monitor-tile')
    expect(tiles.length).toBe(2)
    expect(tiles[0].classes()).toContain('monitor-tile--primary')
    expect(tiles[1].classes()).toContain('monitor-tile--extended')
  })

  it('identify: botão habilitado e chama identifyMonitors', async () => {
    const wrapper = createWrapper()
    const btn = wrapper.find('.monitor-arrangement__identify')
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
    await btn.trigger('click')
    expect(identifyMock).toHaveBeenCalled()
  })

  it('sem custom arrangement: botão reset não aparece', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.monitor-arrangement__reset').exists()).toBe(false)
  })

  it('stage: pointermove/up/cancel propagam handlers', async () => {
    const wrapper = createWrapper()
    const stage = wrapper.find('.monitor-arrangement__stage')
    await stage.trigger('pointermove')
    await stage.trigger('pointerup')
    await stage.trigger('pointercancel')
    expect(pointerMocks.onPointerMove).toHaveBeenCalled()
    expect(pointerMocks.onPointerUp).toHaveBeenCalled()
    expect(pointerMocks.onPointerCancel).toHaveBeenCalled()
  })

  it('tile: pointerdown handler ligado', async () => {
    const wrapper = createWrapper()
    const tile = wrapper.find('.monitor-tile')
    await tile.trigger('pointerdown')
    expect(pointerMocks.onPointerDown).toHaveBeenCalled()
  })
})
