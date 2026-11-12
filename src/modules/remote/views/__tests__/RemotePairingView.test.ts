// @vitest-environment jsdom
// RemotePairingView — pairingInfo, clients, failed, copy, QR
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  getDesktopBridge: vi.fn(),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}))

import RemotePairingView from '../RemotePairingView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        remote: {
          title: 'Controle remoto',
          pairingDescription: 'Descrição',
          clientConnected: 'Conectado: {device}',
          waitingClient: 'Aguardando...',
          unavailable: 'Indisponível',
          address: 'Endereço',
          token: 'Token',
          copyLink: 'Copiar link',
        },
      },
    },
  },
})

function makeBridge(overrides: Record<string, unknown> = {}) {
  return {
    remote: {
      pairingInfo: vi.fn(async () => ({
        host: '192.168.0.10',
        port: 8787,
        token: 'TOKEN123',
        connectUrl: 'http://192.168.0.10:8787/?token=TOKEN123',
        qrDataUrl: 'data:image/png;base64,QR',
        speakerUrl: 'http://192.168.0.10:7080/speaker?remotePort=8787&palcoPort=7081&token=TOKEN123',
        speakerQrDataUrl: 'data:image/png;base64,QRSPK',
        viewerUrl: 'http://192.168.0.10:7080/speaker?mode=view&token=VIEW',
        viewerQrDataUrl: 'data:image/png;base64,QRVIEW',
        clientCount: 0,
        clientAddress: null,
      })),
      onClients: vi.fn(() => () => {}),
      ...overrides,
    },
  }
}

function createWrapper() {
  return mount(RemotePairingView, { global: { plugins: [i18n] } })
}

describe('RemotePairingView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sem remote bridge: failed, indisponível', async () => {
    mocks.getDesktopBridge.mockReturnValue({})
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-testid="remote-unavailable"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="remote-qr"]').exists()).toBe(false)
  })

  it('pairingInfo ok: QR, host:port, token', async () => {
    mocks.getDesktopBridge.mockReturnValue(makeBridge())
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-testid="remote-qr"]').attributes('src')).toBe('data:image/png;base64,QR')
    // host:port + token vivem no painel recolhível — abre antes de afirmar
    await wrapper.find('.details-toggle').trigger('click')
    expect(wrapper.text()).toContain('192.168.0.10:8787')
    expect(wrapper.find('[data-testid="remote-token"]').text()).toBe('TOKEN123')
    expect(wrapper.text()).toContain('Aguardando')
    // Bloco do pregador: QR + URL
    expect(wrapper.find('[data-testid="remote-speaker-block"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="remote-viewer-qr"]').attributes('src')).toBe('data:image/png;base64,QRVIEW')
    expect(wrapper.find('[data-testid="remote-speaker-qr"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="remote-speaker-url"]').text()).toBe('http://192.168.0.10:7080/speaker?remotePort=8787&palcoPort=7081&token=TOKEN123')
    expect(wrapper.find('[data-testid="remote-speaker-copy"]').exists()).toBe(true)
    const writeText = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    // 1º clique com clipboard ausente (branch opcional) — jsdom default
    await wrapper.find('[data-testid="remote-speaker-copy"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('http://192.168.0.10:7080/speaker?remotePort=8787&palcoPort=7081&token=TOKEN123')
  })

  it('pairingInfo rejeita: failed', async () => {
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      pairingInfo: vi.fn(async () => { throw new Error('x') }),
    }))
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-testid="remote-unavailable"]').exists()).toBe(true)
  })

  it('onClients conectado: status connected com device', async () => {
    let clientsCb: ((p: { count: number; address?: string; remoteAddress?: string }) => void) | null = null
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      onClients: vi.fn((cb: typeof clientsCb) => {
        clientsCb = cb
        return () => {}
      }),
    }))
    const wrapper = createWrapper()
    await flushPromises()
    clientsCb!({ count: 1, address: '192.168.0.50', remoteAddress: '192.168.0.50' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="remote-client-status"]').classes()).toContain('pairing-status--on')
    expect(wrapper.text()).toContain('192.168.0.50')
  })

  it('copyUrl: clipboard com connectUrl', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    mocks.getDesktopBridge.mockReturnValue(makeBridge())
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-testid="remote-copy"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('http://192.168.0.10:8787/?token=TOKEN123')
  })

  it('copySpeakerUrl sem speakerUrl: early return sem clipboard', async () => {
    const writeText = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      pairingInfo: vi.fn(async () => ({
        host: '192.168.0.10', port: 8787, token: 'TOKEN123',
        connectUrl: 'http://192.168.0.10:8787/?token=TOKEN123',
        qrDataUrl: 'data:image/png;base64,QR',
        clientCount: 0, clientAddress: null,
      })),
    }))
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-testid="remote-speaker-block"]').exists()).toBe(false)
    const vm = wrapper.vm as unknown as { copySpeakerUrl?: () => void }
    expect(() => vm.copySpeakerUrl?.()).not.toThrow()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('unmount: desinscreve onClients', async () => {
    const off = vi.fn()
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      onClients: vi.fn(() => off),
    }))
    const wrapper = createWrapper()
    await flushPromises()
    wrapper.unmount()
    expect(off).toHaveBeenCalled()
  })

  it('onClients lança: catch não quebra a view (br 29)', async () => {
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      onClients: vi.fn(() => { throw new Error('boom') }),
    }))
    const w = createWrapper()
    await flushPromises()
    expect(w.exists()).toBe(true)
    w.unmount()
  })

  it('copyUrl sem info: no-op (br 39)', async () => {
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      pairingInfo: vi.fn(() => new Promise(() => {})), // pendente: info fica null
    }))
    const w = createWrapper()
    await flushPromises()
    const vm = w.vm as unknown as { copyUrl?: () => void }
    expect(() => vm.copyUrl?.()).not.toThrow()
    w.unmount()
  })

  it('copyUrl sem info pendente + sem qr: img ausente (br 72)', async () => {
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      pairingInfo: vi.fn(async () => ({
        host: 'h', port: 1, token: 't', connectUrl: 'http://h:1/?t', qrDataUrl: null, clientCount: 0, clientAddress: null,
      })),
    }))
    const w = createWrapper()
    await flushPromises()
    expect(w.find('img[width="220"]').exists()).toBe(false)
    // copyUrl com info presente
    const copyBtn = w.findAll('button').find((b) => (b.text() + (b.attributes('aria-label') ?? '')).toLowerCase().includes('copiar') || (b.text() + (b.attributes('aria-label') ?? '')).toLowerCase().includes('copy'))
    if (copyBtn) await copyBtn.trigger('click')
    // clipboard pode não existir em jsdom — só não pode lançar
    w.unmount()
  })

  it('onClients com address null: device fallback (br 59)', async () => {
    let cb: ((p: { count: number; address: string | null; remoteAddress?: string | null }) => void) | null = null
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      onClients: vi.fn((fn: typeof cb) => { cb = fn; return () => {} }),
    }))
    const w = createWrapper()
    await flushPromises()
    cb?.({ count: 2, address: null, remoteAddress: 'Piano LouvorJA' })
    await flushPromises()
    expect(w.text()).toContain('Piano LouvorJA')
    w.unmount()
  })
})


const confirmStub = {
  props: ['open'], emits: ['confirm', 'cancel'],
  template: '<div v-if="open"><button data-testid="token-confirm" @click="$emit(\'confirm\')"/><button data-testid="token-cancel" @click="$emit(\'cancel\')"/></div>',
}

it.each(['remote', 'speaker'])('atualizar token de %s exige confirmação e atualiza link/QR', async (role) => {
  const bridge = makeBridge({ resetToken: vi.fn() })
  const before = await bridge.remote.pairingInfo()
  const after = { ...before, token: role === 'remote' ? 'NEW12345' : before.token,
    connectUrl: role === 'remote' ? 'louvorja://novo' : before.connectUrl,
    qrDataUrl: role === 'remote' ? 'data:image/png;base64,NOVO' : before.qrDataUrl,
    speakerUrl: role === 'speaker' ? 'http://novo/speaker' : before.speakerUrl,
    speakerQrDataUrl: role === 'speaker' ? 'data:image/png;base64,NOVOSP' : before.speakerQrDataUrl }
  const reset = bridge.remote.resetToken as ReturnType<typeof vi.fn>
  reset.mockResolvedValue(after)
  mocks.getDesktopBridge.mockReturnValue(bridge)
  const wrapper = mount(RemotePairingView, { global: { plugins: [i18n], stubs: { AppConfirm: confirmStub } } })
  await flushPromises()
  await wrapper.get(`[data-testid="${role}-renew-token"]`).trigger('click')
  expect(reset).not.toHaveBeenCalled()
  await wrapper.get('[data-testid="token-cancel"]').trigger('click')
  expect(reset).not.toHaveBeenCalled()
  await wrapper.get(`[data-testid="${role}-renew-token"]`).trigger('click')
  await wrapper.get('[data-testid="token-confirm"]').trigger('click')
  await flushPromises()
  expect(reset).toHaveBeenCalledWith(role)
  expect(wrapper.get('[data-testid="remote-url"]').text()).toBe(after.connectUrl)
  expect(wrapper.get('[data-testid="remote-speaker-url"]').text()).toBe(after.speakerUrl)
  wrapper.unmount()
})


it('erro ao atualizar token mantém links anteriores e informa a falha', async () => {
  const reset = vi.fn(async () => { throw new Error('sem escrita') })
  const bridge = makeBridge({ resetToken: reset })
  mocks.getDesktopBridge.mockReturnValue(bridge)
  const wrapper = mount(RemotePairingView, { global: { plugins: [i18n], stubs: { AppConfirm: confirmStub } } })
  await flushPromises()
  const url = wrapper.get('[data-testid="remote-url"]').text()
  await wrapper.get('[data-testid="remote-renew-token"]').trigger('click')
  await wrapper.get('[data-testid="token-confirm"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="remote-token-error"]').exists()).toBe(true)
  expect(wrapper.get('[data-testid="remote-url"]').text()).toBe(url)
  expect(wrapper.get('[data-testid="remote-renew-token"]').attributes('disabled')).toBeUndefined()
  wrapper.unmount()
})

it('encerra o passador pelo desktop e desabilita o botão ao liberar a conexão', async () => {
  const bridge = makeBridge()
  const before = { ...(await bridge.remote.pairingInfo()), speakerAddress: 'Celular do pregador' }
  const disconnectSpeaker = vi.fn(async () => ({ ...before, speakerAddress: null }))
  mocks.getDesktopBridge.mockReturnValue({ remote: { ...bridge.remote, pairingInfo: vi.fn(async () => before), disconnectSpeaker } })
  const wrapper = createWrapper()
  await flushPromises()
  const button = wrapper.get('[data-testid="speaker-disconnect"]')
  expect(button.attributes('disabled')).toBeUndefined()
  await button.trigger('click')
  await flushPromises()
  expect(disconnectSpeaker).toHaveBeenCalledOnce()
  expect(button.attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="remote-speaker-url"]').text()).toBe(before.speakerUrl)
  wrapper.unmount()
})
