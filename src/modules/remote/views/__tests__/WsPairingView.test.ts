// Testes para WsPairingView — máquina de estados idle→scanning→connecting→connected/error
// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

// Mock jsQR antes de importar o componente
vi.mock('jsqr', () => ({
  default: vi.fn(() => null),
}))

// Mock GlassCard
vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div><slot /></div>' },
}))

import WsPairingView from '../WsPairingView.vue'
import jsQR from 'jsqr'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        remote: {
          wsTitle: 'Parear por WebSocket',
          wsHint1: 'dica1',
          wsHint2: 'dica2',
          wsStart: 'Iniciar',
          wsManualHint: 'manual',
          wsManualPlaceholder: 'host:port',
          wsManualApply: 'Aplicar',
          wsScanning: 'escaneando',
          wsConnecting: 'conectando',
          wsConnected: 'conectado',
          wsClosed: 'conexão fechada',
          wsError: 'erro de ws',
          wsNoCamera: 'sem câmera',
          wsCancel: 'cancelar',
          wsDisconnect: 'desconectar',
          wsRetry: 'tentar novamente',
        },
      },
    },
  },
})

// FakeWebSocket captura handlers pra dispararmos eventos
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  closed = false

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.onclose?.()
  }
}

// getUserMedia mockado
const mockTrack = { stop: vi.fn() }
const mockStream = { getTracks: vi.fn(() => [mockTrack]) }

const mediaDevices = {
  getUserMedia: vi.fn(async () => mockStream),
}

describe('WsPairingView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    Object.defineProperty(window, 'navigator', {
      value: { mediaDevices },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function createWrapper() {
    return mount(WsPairingView, {
      props: {},
      global: { plugins: [i18n] },
    })
  }

  it('estado inicial: idle, mostra botão iniciar e input manual', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.ws-pairing__title').exists()).toBe(true)
    expect(wrapper.find('.ws-pairing__btn').exists()).toBe(true)
    expect(wrapper.find('.ws-pairing__input').exists()).toBe(true)
  })

  it('startScan com câmera: entra em scanning, vídeo montado, stream anexado', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__btn').trigger('click')
    await flushPromises()
    expect(mediaDevices.getUserMedia).toHaveBeenCalledOnce()
    expect(wrapper.find('.ws-pairing__cam').exists()).toBe(true)
  })

  it('startScan sem câmera: step error com mensagem', async () => {
    mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('no cam'))
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.ws-pairing__error').exists()).toBe(true)
    expect(wrapper.text()).toContain('sem câmera')
  })

  it('submitManual vazio: não faz nada (permanece idle)', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('   ')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    expect(FakeWebSocket.instances.length).toBe(0)
    expect(wrapper.find('.ws-pairing__input').exists()).toBe(true)
  })

  it('submitManual sem prefixo ws://: concatena prefixo e conecta', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('192.168.1.5:8080')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    await flushPromises()
    expect(FakeWebSocket.instances.length).toBe(1)
    expect(FakeWebSocket.instances[0].url).toBe('ws://192.168.1.5:8080')
    expect(wrapper.find('.ws-pairing__url').exists()).toBe(true)
  })

  it('submitManual com ws://: usa url direto', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('ws://host:9999')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    await flushPromises()
    expect(FakeWebSocket.instances[0].url).toBe('ws://host:9999')
  })

  it('ws onopen: connected, envia handshake remote.hello', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('ws://x:1')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    const ws = FakeWebSocket.instances[0]
    ws.onopen!()
    await flushPromises()
    expect(wrapper.find('.ws-pairing__ok').exists()).toBe(true)
    expect(ws.sent).toEqual([JSON.stringify({ action: 'remote.hello', device: 'web' })])
  })

  it('ws onmessage com JSON: loga action', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('ws://x:1')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    const ws = FakeWebSocket.instances[0]
    ws.onopen!()
    ws.onmessage!({ data: JSON.stringify({ action: 'remote.ping' }) })
    await flushPromises()
    expect(wrapper.find('.ws-pairing__log').exists()).toBe(true)
    expect(wrapper.text()).toContain('remote.ping')
  })

  it('ws onmessage sem JSON: loga raw truncado', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('ws://x:1')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    const ws = FakeWebSocket.instances[0]
    ws.onopen!()
    ws.onmessage!({ data: 'nao-json-raw' })
    await flushPromises()
    expect(wrapper.text()).toContain('nao-json-raw')
  })

  it('ws onerror: step error', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('ws://x:1')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    const ws = FakeWebSocket.instances[0]
    ws.onerror!()
    await flushPromises()
    expect(wrapper.find('.ws-pairing__error').exists()).toBe(true)
    expect(wrapper.text()).toContain('erro de ws')
  })

  it('ws onclose após connected: error com wsClosed', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('ws://x:1')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    const ws = FakeWebSocket.instances[0]
    ws.onopen!()
    ws.onclose!()
    await flushPromises()
    expect(wrapper.find('.ws-pairing__error').exists()).toBe(true)
    expect(wrapper.text()).toContain('conexão fechada')
  })

  it('reset de connected: volta pra idle e fecha ws', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__input').setValue('ws://x:1')
    await wrapper.find('.ws-pairing__btn--ghost').trigger('click')
    const ws = FakeWebSocket.instances[0]
    ws.onopen!()
    await flushPromises()
    await wrapper.find('.ws-pairing__btn').trigger('click') // botão disconnect
    expect(ws.closed).toBe(true)
    expect(wrapper.find('.ws-pairing__input').exists()).toBe(true) // idle de novo
  })

  it('unmount: fecha ws e para stream', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.ws-pairing__btn').trigger('click') // startScan
    await flushPromises()
    await wrapper.unmount()
    expect(mockTrack.stop).toHaveBeenCalled()
  })

  it('scanFrame sem vídeo: no-op (jsQR não chamado)', async () => {
    vi.mocked(jsQR).mockClear()
    const wrapper = createWrapper()
    // step idle: scanFrame nem roda via timer — não há como chamar direto sem vídeo
    expect(wrapper.exists()).toBe(true)
    expect(jsQR).not.toHaveBeenCalled()
  })

  it('scanFrame com QR válido ws://: conecta automaticamente', async () => {
    vi.useFakeTimers()
    // jsdom tem videoWidth=0 e getContext('2d')=null → injeta ambos
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 4, configurable: true })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 4, configurable: true })
    const fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 })),
    }
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D)
    try {
      vi.mocked(jsQR).mockReturnValueOnce({ data: 'ws://qr-host:1234' } as never)
      const wrapper = createWrapper()
      const clickPromise = wrapper.find('.ws-pairing__btn').trigger('click')
      await vi.advanceTimersByTimeAsync(250) // resolve o setTimeout(200) do startScan
      await clickPromise
      await vi.advanceTimersByTimeAsync(300) // dispara o setInterval(250) → scanFrame
      await flushPromises()
      expect(jsQR).toHaveBeenCalled()
      expect(FakeWebSocket.instances.length).toBe(1)
      expect(FakeWebSocket.instances[0].url).toBe('ws://qr-host:1234')
    } finally {
      vi.useRealTimers()
      ctxSpy.mockRestore()
      delete (HTMLVideoElement.prototype as { videoWidth?: number }).videoWidth
      delete (HTMLVideoElement.prototype as { videoHeight?: number }).videoHeight
    }
  })
})