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
    expect(wrapper.text()).toContain('192.168.0.10:8787')
    expect(wrapper.find('[data-testid="remote-token"]').text()).toBe('TOKEN123')
    expect(wrapper.text()).toContain('Aguardando')
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
    let clientsCb: ((p: { count: number; address?: string }) => void) | null = null
    mocks.getDesktopBridge.mockReturnValue(makeBridge({
      onClients: vi.fn((cb: typeof clientsCb) => {
        clientsCb = cb
        return () => {}
      }),
    }))
    const wrapper = createWrapper()
    await flushPromises()
    clientsCb!({ count: 1, address: '192.168.0.50' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="remote-client-status"]').classes()).toContain('connected')
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
})
