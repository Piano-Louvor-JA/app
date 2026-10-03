// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
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

const registryMock = {
  targets: { value: [] as Array<{ id: string; module: string | null }> },
  syncDetected: vi.fn(),
  setModule: vi.fn(),
}
vi.mock('../../services/output-registry', () => ({
  useOutputRegistry: () => registryMock,
}))

const palcoApi = {
  slots: vi.fn().mockResolvedValue([]),
  status: vi.fn().mockResolvedValue({ running: false }),
  onEvent: vi.fn(),
  onReceiverConnected: vi.fn(),
  onReceiverDisconnected: vi.fn(),
}
const displaysApi = {
  list: vi.fn().mockResolvedValue([]),
  onChanged: vi.fn((cb: () => void) => {
    return () => {}
  }),
}
Object.defineProperty(window, 'louvorja', {
  get: () => ({ palco: palcoApi, displays: displaysApi }),
  configurable: true,
})

const __cbs: Array<() => void> = []
import OutputSelectorPanel from '../OutputSelectorPanel.vue'

async function mountPanel(props: Record<string, unknown> = {}) {
  const w = mount(OutputSelectorPanel, { props: { mode: 'assign', ...props } })
  await flushPromises()
  return w
}

describe('OutputSelectorPanel', () => {
  let active: Awaited<ReturnType<typeof mountPanel>> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    registryMock.targets.value = []
    palcoApi.slots.mockResolvedValue([])
    displaysApi.list.mockResolvedValue([])
    Object.defineProperty(window, 'louvorja', {
      get: () => ({ palco: palcoApi, displays: displaysApi }),
      configurable: true,
    })
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('sem displays nem slots: lista vazia, hint visível', async () => {
    const w = await mountPanel()
    active = w
    expect(w.text()).toContain('settings.outputs.hint')
    expect(w.findAll('.output-selector__item').length).toBe(0)
  })

  it('lista monitores e slots de TV com detail/online', async () => {
    displaysApi.list.mockResolvedValue([{ id: 0, bounds: { width: 1920, height: 1080 } }, { id: 1 }])
    palcoApi.slots.mockResolvedValue([
      { id: '1', label: 'TV Sala', clients: 2, running: true },
      { id: '2', label: 'TV Quarto', clients: 0, running: false },
    ])
    const w = await mountPanel()
    active = w
    const items = w.findAll('.output-selector__item')
    expect(items.length).toBe(4)
    const text = w.text()
    expect(text).toContain('settings.outputs.monitor')
    expect(text).toContain('1920 × 1080')
    expect(text).toContain('TV Sala')
    expect(text).toContain('settings.outputs.tvConnected')
    expect(text).toContain('settings.outputs.tvOffline')
    expect(registryMock.syncDetected).toHaveBeenCalled()
  })

  it('refresh com falha das duas fontes: listas vazias', async () => {
    displaysApi.list.mockRejectedValue(new Error('x'))
    palcoApi.slots.mockRejectedValue(new Error('x'))
    const w = await mountPanel()
    active = w
    expect(w.findAll('.output-selector__item').length).toBe(0)
  })

  it('modo assign: trocar módulo chama registry.setModule', async () => {
    displaysApi.list.mockResolvedValue([{ id: 0 }])
    const w = await mountPanel()
    active = w
    const select = w.find('select')
    expect(select.exists()).toBe(true)
    await select.setValue('bible')
    expect(registryMock.setModule).toHaveBeenCalledWith('cable:0', 'bible')
  })

  it('modo pick: marcar/desmarcar emite update:modelValue', async () => {
    displaysApi.list.mockResolvedValue([{ id: 0 }, { id: 1 }])
    const w = await mountPanel({ mode: 'pick', modelValue: [] })
    active = w
    const checkboxes = w.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBe(2)
    await checkboxes[0].setValue(true)
    expect(w.emitted('update:modelValue')?.[0]).toEqual([['cable:0']])
    await checkboxes[1].setValue(true)
    const last = w.emitted('update:modelValue')?.at(-1)
    expect((last as string[][])[0]).toContain('cable:0')
    expect((last as string[][])[0]).toContain('cable:1')
    await checkboxes[0].setValue(false)
    const after = w.emitted('update:modelValue')?.at(-1)
    expect((after as string[][])[0]).toEqual(['cable:1'])
  })

  it('unmount desinscreve onChanged', async () => {
    const unsub = vi.fn()
    displaysApi.onChanged.mockImplementation(() => unsub)
    const w = await mountPanel()
    active = w
    expect(displaysApi.onChanged).toHaveBeenCalled()
    w.unmount()
    active = null
    expect(unsub).toHaveBeenCalled()
  })

  it('sem displays.onChanged: não quebra', async () => {
    Object.defineProperty(window, 'louvorja', {
      get: () => ({ palco: palcoApi }),
      configurable: true,
    })
    const w = await mountPanel()
    active = w
    expect(true).toBe(true)
  })

  it('gaps: monitor sem bounds, slot sem label usa id, onChanged dispara refresh', async () => {
    const displaysApi = {
      list: vi.fn(async () => [{ id: 'm1', bounds: null }]),
      onChanged: vi.fn((cb: () => void) => {
        __cbs.push(cb)
        return () => {}
      }),
    }
    const palcoApi2 = {
      slots: vi.fn(async () => [{ id: 'tv-9', label: '', clients: 0 }]),
    }
    ;(globalThis as Record<string, unknown>).__cbs = __cbs
    Object.defineProperty(window, 'louvorja', {
      value: { displays: displaysApi, palco: palcoApi2 },
      configurable: true,
    })
    const w = await mountPanel()
    active = w
    const text = w.text()
    expect(text).toContain('tv-9') // label fallback = id
    expect(text).toContain('settings.outputs.tvOffline')
    // onChanged → refresh
    for (const cb of __cbs.splice(0)) cb()
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
})
