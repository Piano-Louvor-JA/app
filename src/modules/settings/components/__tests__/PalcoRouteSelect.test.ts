// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// getPalcoRoute/setPalcoRoute são usados direto do módulo palco-routing
vi.mock('../../services/palco-routing', () => ({
  getPalcoRoute: vi.fn(() => 'mirror'),
  setPalcoRoute: vi.fn(),
}))
import { getPalcoRoute, setPalcoRoute } from '../../services/palco-routing'
import PalcoRouteSelect from '../PalcoRouteSelect.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': {} } })

type Slot = { id: string; label: string; clients?: number }
function setPalcoApi(opts: { slots?: Slot[]; status?: unknown; displays?: unknown[] } = {}) {
  ;(window as any).louvorja = {
    palco: {
      slots: vi.fn().mockResolvedValue(opts.slots ?? []),
      status: vi.fn().mockResolvedValue(opts.status ?? { running: true }),
    },
    displays: opts.displays !== undefined ? { list: vi.fn().mockResolvedValue(opts.displays) } : undefined,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as any).louvorja
})

function mountSelect(props: Partial<{ module: string; compact: boolean }> = {}) {
  return mount(PalcoRouteSelect, {
    props: { module: 'clock', ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('PalcoRouteSelect', () => {
  it('sem window.louvorja.palco: label não renderiza', async () => {
    ;(window as any).louvorja = undefined
    const w = mountSelect()
    await flushPromises()
    expect(w.find('.palco-route').exists()).toBe(false)
    w.unmount()
  })

  it('sender off: não renderiza mesmo com electron', async () => {
    setPalcoApi({ status: { running: false } })
    const w = mountSelect()
    await flushPromises()
    expect(w.find('.palco-route').exists()).toBe(false)
    w.unmount()
  })

  it('sender on: select com mirror + slots + displays', async () => {
    setPalcoApi({
      slots: [{ id: 'tv1', label: 'TV Sala', clients: 2 }],
      displays: [{ id: 'd1', label: 'HDMI', bounds: { width: 1920, height: 1080 } }],
    })
    const w = mountSelect()
    await flushPromises()
    expect(w.find('.palco-route').exists()).toBe(true)
    const options = w.findAll('option').map(o => o.text())
    expect(options.some(t => t.includes('Espelho') || t.includes('mirror'))).toBe(true)
    expect(w.text()).toContain('TV Sala')
    expect(w.text()).toContain('1920×1080')
    w.unmount()
  })

  it('change: atualiza rota persistida', async () => {
    setPalcoApi({ slots: [{ id: 'tv1', label: 'TV Sala' }] })
    const w = mountSelect()
    await flushPromises()
    await w.find('select').setValue('tv1')
    expect(setPalcoRoute).toHaveBeenCalledWith('clock', 'tv1')
    w.unmount()
  })

  it('interval refresh: status polling a cada 4s', async () => {
    setPalcoApi({})
    const w = mountSelect()
    await flushPromises()
    const calls = (window as any).louvorja.palco.status.mock.calls.length
    vi.advanceTimersByTime(4200)
    expect((window as any).louvorja.palco.status.mock.calls.length).toBeGreaterThan(calls)
    w.unmount()
  })

  it('displays.list falha: segue sem optgroup de cabo', async () => {
    ;(window as any).louvorja = {
      palco: { slots: vi.fn().mockResolvedValue([]), status: vi.fn().mockResolvedValue({ running: true }) },
      displays: { list: vi.fn().mockRejectedValue(new Error('fail')) },
    }
    const w = mountSelect()
    await flushPromises()
    expect(w.find('.palco-route').exists()).toBe(true)
    w.unmount()
  })

  describe('catches de API (21/24)', () => {
    it('status() rejeita: senderOn false (21)', async () => {
      ;(window as any).louvorja = {
        palco: { slots: vi.fn().mockResolvedValue([]), status: vi.fn().mockRejectedValue(new Error('boom')) },
      }
      const w = mountSelect()
      await flushPromises()
      expect(w.find('.palco-route').exists()).toBe(false)
      w.unmount()
    })

    it('slots() rejeita: segue com [] (24)', async () => {
      ;(window as any).louvorja = {
        palco: { slots: vi.fn().mockRejectedValue(new Error('boom')), status: vi.fn().mockResolvedValue({ running: true }) },
        displays: { list: vi.fn().mockRejectedValue(new Error('boom')) },
      }
      const w = mountSelect()
      await flushPromises()
      expect(w.find('.palco-route').exists()).toBe(true)
      w.unmount()
    })
  })
})
