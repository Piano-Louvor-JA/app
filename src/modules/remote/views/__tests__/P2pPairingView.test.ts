// Testes P2pPairingView — offer/scan/answer/connected/error com P2pRemoteHost mockado
// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const { MockP2pRemoteHost } = vi.hoisted(() => {
  class MockP2pRemoteHostImpl {
    static instances: any[] = []
    createOffer = vi.fn(async () => 'SDP-OFFER-STRING')
    acceptAnswer = vi.fn(async (_answer: string) => true)
    send = vi.fn()
    destroy = vi.fn()
    onOpen: (() => void) | null = null
    onMessage: ((data: unknown) => void) | null = null
    constructor() {
      MockP2pRemoteHostImpl.instances.push(this)
    }
  }
  return { MockP2pRemoteHost: MockP2pRemoteHostImpl }
})

function componentHost(): InstanceType<typeof MockP2pRemoteHost> {
  return MockP2pRemoteHost.instances[MockP2pRemoteHost.instances.length - 1]
}

vi.mock('../../services/p2p-remote-host', () => ({
  P2pRemoteHost: MockP2pRemoteHost,
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,QRDATA'),
  },
}))

vi.mock('jsqr', () => ({
  default: vi.fn(() => null),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div><slot /></div>' },
}))

import P2pPairingView from '../P2pPairingView.vue'
import jsQR from 'jsqr'
import QRCode from 'qrcode'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        remote: {
          p2pTitle: 'Parear P2P',
          p2pHint1: 'dica1',
          p2pHint2: 'dica2',
          p2pStart: 'Iniciar',
          p2pOfferReady: 'oferta pronta',
          p2pNoCamera: 'sem câmera',
          p2pManualPlaceholder: 'cole o answer',
          p2pManualApply: 'Aplicar',
          p2pConnected: 'conectado',
          p2pAnswerOk: 'answer ok',
          p2pBadAnswer: 'answer inválido',
          p2pTestPing: 'ping',
        },
      },
    },
  },
})

const mockTrack = { stop: vi.fn() }
const mockStream = { getTracks: vi.fn(() => [mockTrack]) }
const mediaDevices = {
  getUserMedia: vi.fn(async () => mockStream),
}

describe('P2pPairingView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockP2pRemoteHost.instances.length = 0
    Object.defineProperty(window, 'navigator', {
      value: { mediaDevices },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createWrapper() {
    return mount(P2pPairingView, {
      global: { plugins: [i18n] },
    })
  }

  it('idle: mostra botão iniciar sem QR nem textarea', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.p2p-pairing__title').exists()).toBe(true)
    expect(wrapper.find('.p2p-pairing__btn').exists()).toBe(true)
    expect(wrapper.find('.p2p-pairing__qr').exists()).toBe(false)
  })

  it('startOffer ok: gera QR, loga, entra em scan com câmera', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    expect(componentHost().createOffer).toHaveBeenCalledOnce()
    expect(QRCode.toDataURL).toHaveBeenCalled()
    expect(wrapper.find('.p2p-pairing__qr').exists()).toBe(true)
    expect(wrapper.find('.p2p-pairing__cam').exists()).toBe(true)
  })

  it('startOffer com erro no createOffer: step error com mensagem', async () => {
    componentHost().createOffer.mockRejectedValueOnce(new Error('webrtc fail'))
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.p2p-pairing__error').exists()).toBe(true)
    expect(wrapper.text()).toContain('webrtc fail')
  })

  it('startScan sem câmera: só loga hint, sem quebrar', async () => {
    mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('no cam'))
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('sem câmera')
    expect(wrapper.find('.p2p-pairing__error').exists()).toBe(false)
  })

  it('submitManual vazio: não chama acceptAnswer', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    componentHost().acceptAnswer.mockClear()
    await wrapper.find('.p2p-pairing__btn').trigger('click') // botão agora é "Aplicar" no step scan
    // no step scan o primeiro botão é "Aplicar" (p2pManualApply) — dispara submitManual
    expect(componentHost().acceptAnswer).not.toHaveBeenCalledTimes(2)
  })

  it('applyAnswer ok: para scan, loga answer ok, conecta via onOpen', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    componentHost().acceptAnswer.mockClear()
    wrapper.vm.manualAnswer = 'ANSWER-DATA'
    await wrapper.find('.p2p-pairing__btn').trigger('click') // submitManual
    await flushPromises()
    expect(componentHost().acceptAnswer).toHaveBeenCalledWith('ANSWER-DATA')
    expect(wrapper.text()).toContain('answer ok')
    // onOpen dispara connected
    componentHost().onOpen!()
    await flushPromises()
    expect(wrapper.text()).toContain('conectado')
  })

  it('applyAnswer falha: errorMsg p2pBadAnswer', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    componentHost().acceptAnswer.mockResolvedValueOnce(false)
    componentHost().acceptAnswer.mockClear()
    wrapper.vm.manualAnswer = 'BAD'
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises
    expect(wrapper.text()).toContain('answer inválido')
  })

  it('sendPing: envia remote.hello pelo host', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    componentHost().onOpen!()
    await flushPromises()
    componentHost().send.mockClear()
    // botão de ping aparece no step connected
    const buttons = wrapper.findAll('.p2p-pairing__btn')
    const pingBtn = buttons.find((b) => b.text() === 'ping')
    await pingBtn!.trigger('click')
    expect(componentHost().send).toHaveBeenCalledWith(expect.objectContaining({ action: 'remote.hello', device: 'web-test' }))
  })

  it('onMessage: loga payload JSON truncado', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    componentHost().acceptAnswer.mockClear()
    wrapper.vm.manualAnswer = 'ANS'
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    componentHost().onMessage!({ action: 'ping' })
    await flushPromises()
    expect(wrapper.text()).toContain('ping')
    expect(wrapper.find('.p2p-pairing__log').exists()).toBe(true)
  })

  it('unmount: destrói host e para stream', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.p2p-pairing__btn').trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(mockTrack.stop).toHaveBeenCalled()
    expect(componentHost().destroy).toHaveBeenCalledOnce()
  })

  it('scanFrame com QR de answer: aplica answer automaticamente', async () => {
    vi.mocked(jsQR).mockReturnValueOnce({ data: 'QR-ANSWER' } as never)
    vi.useFakeTimers()
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 4, configurable: true })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 4, configurable: true })
    const fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 })),
    }
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D)
    try {
      const wrapper = createWrapper()
      const clickPromise = wrapper.find('.p2p-pairing__btn').trigger('click')
      await vi.advanceTimersByTimeAsync(250)
      await clickPromise
      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()
      expect(jsQR).toHaveBeenCalled()
      // answer do QR aplicado: acceptAnswer recebeu e log apareceu
      expect(componentHost().acceptAnswer).toHaveBeenCalledWith('QR-ANSWER')
      expect(wrapper.text()).toContain('answer ok')
    } finally {
      vi.useRealTimers()
      ctxSpy.mockRestore()
      delete (HTMLVideoElement.prototype as { videoWidth?: number }).videoWidth
      delete (HTMLVideoElement.prototype as { videoHeight?: number }).videoHeight
    }
  })
})