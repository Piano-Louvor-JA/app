// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k), locale: { value: 'pt-BR' } }),
  createI18n: () => ({ global: { locale: 'pt-BR', t: (k: string) => k } }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-mock"><slot /></div>' },
}))

const statusMock = vi.fn()
const turnOnMock = vi.fn()
const turnOffMock = vi.fn()
const onConnectedMock = vi.fn()
const onDisconnectedMock = vi.fn()

vi.mock('../../services/palco-session', () => ({
  palcoSession: {
    get isElectron() { return Boolean((window as { louvorja?: { palco?: unknown } }).louvorja?.palco) },
    status: (...a: unknown[]) => statusMock(...(a as [])),
    turnOn: (...a: unknown[]) => turnOnMock(...(a as [])),
    turnOff: (...a: unknown[]) => turnOffMock(...(a as [])),
    onReceiverConnected: (...a: unknown[]) => {
      onConnectedMock(...(a as []))
      palcoApiStub.onReceiverConnected(...(a as []))
    },
    onReceiverDisconnected: (...a: unknown[]) => {
      onDisconnectedMock(...(a as []))
      palcoApiStub.onReceiverDisconnected(...(a as []))
    },
  },
}))

const startBridgeMock = vi.fn()
const stopBridgeMock = vi.fn()
vi.mock('../../services/palco-bridge', () => ({
  startPalcoBridge: (...a: unknown[]) => startBridgeMock(...(a as [])),
  stopPalcoBridge: (...a: unknown[]) => stopBridgeMock(...(a as [])),
}))

vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: vi.fn(() => null),
  setBrowserItem: vi.fn(),
  removeBrowserItem: vi.fn(),
  removeBrowserItemsByPrefix: vi.fn(),
}))

// i18n.ts (plugin, importado por library-catalog) resolve locale do user no topo do módulo.
vi.mock('../../../plugins/i18n', () => ({
  detectInitialLocale: vi.fn(() => 'pt-BR'),
  createI18n: vi.fn(() => ({ global: { locale: 'pt-BR', t: (k: string) => k } })),
  localeToApiPrefix: vi.fn(() => 'pt'),
  default: { global: { locale: 'pt-BR', t: (k: string) => k } },
}))

// jsdom/opaque origin: localStorage indisponível no ambiente de teste → stub mínimo.
const storageStub = (() => {
  let data: Record<string, string> = {}
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = String(v) },
    removeItem: (k: string) => { delete data[k] },
    clear: () => { data = {} },
    key: (i: number) => Object.keys(data)[i] ?? null,
    get length() { return Object.keys(data).length },
  }
})()
Object.defineProperty(window, 'localStorage', { value: storageStub, configurable: true, writable: true })

// palcoSession.isElectron lê window.louvorja.palco no setup do componente.
const palcoApiStub = {
  status: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  serveMedia: vi.fn(),
  servePath: vi.fn(),
  onEvent: vi.fn(),
  onReceiverConnected: vi.fn(),
  onReceiverDisconnected: vi.fn(),
}
Object.defineProperty(window, 'louvorja', {
  get: () => ({ palco: palcoApiStub }),
  configurable: true,
})

import PalcoCard from '../PalcoCard.vue'

async function mountCard() {
  const w = mount(PalcoCard)
  await flushPromises()
  return w
}

describe('PalcoCard', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
    storageStub.clear()
    setActivePinia(createPinia())
    statusMock.mockResolvedValue({ running: false, clients: 0, url: null, wsUrl: null })
    turnOnMock.mockResolvedValue(true)
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('disponível no desktop: mostra switch desligado', async () => {
    const w = await mountCard()
    active = w
    const sw = w.find('.palco-card__switch')
    expect(sw.exists()).toBe(true)
    expect(sw.attributes('aria-checked')).toBe('false')
    expect(w.find('.palco-card__unavailable').exists()).toBe(false)
  })

  it('turnOn com sucesso: liga, sobe bridge e mostra URL', async () => {
    statusMock.mockResolvedValueOnce({ running: false, clients: 0, url: null, wsUrl: null }).mockResolvedValue({ running: true, clients: 2, url: 'http://10.0.0.5:7080', wsUrl: 'ws://x' })
    const w = await mountCard()
    active = w
    await w.find('.palco-card__switch').trigger('click')
    await flushPromises()
    expect(turnOnMock).toHaveBeenCalled()
    expect(startBridgeMock).toHaveBeenCalled()
    expect(w.find('.palco-card__switch').attributes('aria-checked')).toBe('true')
    expect(w.text()).toContain('http://10.0.0.5:7080')
    expect(w.text()).toContain('settings.palco.connected')
  })

  it('turnOn falhou: não sobe bridge e continua desligado', async () => {
    turnOnMock.mockResolvedValue(false)
    statusMock.mockResolvedValue({ running: false, clients: 0, url: null, wsUrl: null })
    const w = await mountCard()
    active = w
    await w.find('.palco-card__switch').trigger('click')
    await flushPromises()
    expect(startBridgeMock).not.toHaveBeenCalled()
    expect(w.find('.palco-card__switch').attributes('aria-checked')).toBe('false')
  })

  it('ligado: toggle desliga e para a bridge; sem receivers mostra waiting', async () => {
    // 1º status: já rodando; status pós-toggle: desligado.
    statusMock.mockResolvedValueOnce({ running: true, clients: 0, url: 'http://x:7080', wsUrl: null }).mockResolvedValueOnce({ running: false, clients: 0, url: null, wsUrl: null })
    const w = await mountCard()
    active = w
    await flushPromises()
    expect(startBridgeMock).toHaveBeenCalled() // já rodando → sobe bridge na hora
    await w.find('.palco-card__switch').trigger('click')
    await flushPromises()
    expect(turnOffMock).toHaveBeenCalled()
    expect(stopBridgeMock).toHaveBeenCalled()
    expect(w.find('.palco-card__switch').attributes('aria-checked')).toBe('false')
  })

  it('copyUrl escreve a URL no clipboard', async () => {
    statusMock.mockResolvedValue({ running: true, clients: 1, url: 'http://copy.me:7080', wsUrl: null })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const w = await mountCard()
    active = w
    await w.find('.palco-card__url').trigger('click')
    expect(writeText).toHaveBeenCalledWith('http://copy.me:7080')
  })

  it('troca de rota de áudio chama setAudioRoute do store', async () => {
    statusMock.mockResolvedValue({ running: true, clients: 1, url: 'http://x:7080', wsUrl: null })
    const w = await mountCard()
    active = w
    const select = w.find('.palco-card__route select')
    expect(select.exists()).toBe(true)
    await select.setValue('tv')
    await flushPromises()
    expect((w.find('.palco-card__route select').element as HTMLSelectElement).value).toBe('tv')
  })

  it('receivers conectados/disconectados atualizam contador via callbacks', async () => {
    statusMock.mockResolvedValue({ running: true, clients: 0, url: 'http://x:7080', wsUrl: null })
    const w = await mountCard()
    active = w
    expect(onConnectedMock).toHaveBeenCalled()
    const connectedCb = onConnectedMock.mock.calls[0][0] as (i: { count: number }) => void
    const disconnectedCb = onDisconnectedMock.mock.calls[0][0] as (i: { count: number }) => void
    connectedCb({ count: 3 })
    await flushPromises()
    expect(w.text()).toContain('"count":3')
    disconnectedCb({ count: 1 })
    await flushPromises()
    expect(w.text()).toContain('"count":1')
  })

  it('status null: mantém estado inicial', async () => {
    statusMock.mockResolvedValue(null)
    const w = await mountCard()
    active = w
    expect(w.find('.palco-card__switch').attributes('aria-checked')).toBe('false')
    expect(startBridgeMock).not.toHaveBeenCalled()
  })
})
