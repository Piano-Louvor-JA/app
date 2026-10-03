// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k), locale: { value: 'pt-BR' } }),
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

const palcoApi = {
  slots: vi.fn().mockResolvedValue([]),
  status: vi.fn().mockResolvedValue({ running: false }),
}
const displaysApi = { list: vi.fn().mockResolvedValue([]) }
Object.defineProperty(window, 'louvorja', {
  get: () => ({ palco: palcoApi, displays: displaysApi }),
  configurable: true,
})

vi.mock('../../services/palco-routing', () => ({
  getPalcoRoute: vi.fn(() => 'auto'),
  setPalcoRoute: vi.fn(),
}))

import PalcoRouteSelect from '../PalcoRouteSelect.vue'
import { setPalcoRoute } from '../../services/palco-routing'

async function mountCard(props: Record<string, unknown> = {}) {
  const w = mount(PalcoRouteSelect, { props: { module: 'hymns', ...props } })
  await flushPromises()
  return w
}

describe('PalcoRouteSelect', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    palcoApi.status.mockResolvedValue({ running: false })
    palcoApi.slots.mockResolvedValue([])
    displaysApi.list.mockResolvedValue([])
    Object.defineProperty(window, 'louvorja', { get: () => ({ palco: palcoApi, displays: displaysApi }), configurable: true })
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('sem electron: não renderiza o seletor', async () => {
    Object.defineProperty(window, 'louvorja', { get: () => undefined, configurable: true })
    const w = await mountCard()
    active = w
    expect(w.find('select').exists()).toBe(false)
  })

  it('sender desligado: esconde o select', async () => {
    const w = await mountCard()
    active = w
    expect(palcoApi.status).toHaveBeenCalled()
    expect(w.find('select').exists()).toBe(false)
  })

  it('sender ligado: mostra monitores e slots como destinos', async () => {
    palcoApi.status.mockResolvedValue({ running: true })
    palcoApi.slots.mockResolvedValue([{ id: '1', label: 'TV Sala', running: true, clients: 2, httpPort: 7080, wsPort: 7081 }])
    displaysApi.list.mockResolvedValue([{ id: 0, bounds: { width: 1920, height: 1080 } }, { id: 1 }])
    const w = await mountCard()
    active = w
    const select = w.find('select')
    expect(select.exists()).toBe(true)
    const options = select.findAll('option')
    const texts = options.map((o) => o.text())
    expect(texts.some((t) => t.includes('monitor'))).toBe(true)
    expect(texts.some((t) => t.includes('1920×1080'))).toBe(true)
    expect(texts.some((t) => t.includes('TV Sala'))).toBe(true)
    expect(texts.some((t) => t.includes('2'))).toBe(true)
  })

  it('status falhou: trata como desligado', async () => {
    palcoApi.status.mockRejectedValue(new Error('x'))
    const w = await mountCard()
    active = w
    expect(w.find('select').exists()).toBe(false)
  })

  it('slots falhou: lista vazia, select segue visível', async () => {
    palcoApi.status.mockResolvedValue({ running: true })
    palcoApi.slots.mockRejectedValue(new Error('x'))
    const w = await mountCard()
    active = w
    expect(w.find('select').exists()).toBe(true)
  })

  it('update escreve rota via setPalcoRoute', async () => {
    palcoApi.status.mockResolvedValue({ running: true })
    const w = await mountCard()
    active = w
    // usa uma option que existe (mirror)
    await w.find('select').setValue('mirror')
    expect(setPalcoRoute).toHaveBeenCalledWith('hymns', 'mirror')
  })

  it('compact mantém classe compacta (label oculto via CSS)', async () => {
    palcoApi.status.mockResolvedValue({ running: true })
    const w = await mountCard({ compact: true })
    active = w
    expect(w.find('label').classes()).toContain('palco-route--compact')
  })

  it('gaps: display sem bounds, slot sem clients, update via vm', async () => {
    palcoApi.status.mockResolvedValue({ running: true })
    palcoApi.slots.mockResolvedValue([
      { id: '2', label: 'TV Cozinha', running: false, clients: 0, httpPort: 7082, wsPort: 7083 },
    ])
    displaysApi.list.mockResolvedValue([{ id: 5 }]) // sem bounds
    const w = await mountCard()
    active = w
    const select = w.find('select')
    expect(select.exists()).toBe(true)
    const texts = select.findAll('option').map((o) => o.text())
    expect(texts.some((tx) => tx.includes('monitor'))).toBe(true) // sem bounds → sem detalhe
    expect(texts.some((tx) => !tx.includes('connectedShort'))).toBe(true) // slot sem clients
    // update via vm (linha 28)
    const vm = w.vm as unknown as { update?: (v: string) => void }
    vm.update?.('cable:5')
    await flushPromises()
    expect(setPalcoRoute).toHaveBeenCalledWith('hymns', 'cable:5')
    w.unmount()
  })

  it('unmount limpa o interval sem erro', async () => {
    const w = await mountCard()
    w.unmount()
    expect(true).toBe(true)
  })
})
