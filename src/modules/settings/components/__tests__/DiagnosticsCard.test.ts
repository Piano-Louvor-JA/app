// @vitest-environment jsdom
// DiagnosticsCard — card de diagnóstico em /config/general: executa, mostra status e envia relatório
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const bridgeMock = vi.hoisted(() => ({
  diagnostics: {
    run: vi.fn(),
    send: vi.fn(),
    openFolder: vi.fn(),
  },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => bridgeMock,
}))

import DiagnosticsCard from '../DiagnosticsCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        general: {
          diagnosticsTitle: 'Diagnóstico',
          diagnosticsHint: 'Verifica o aplicativo e coleta informações técnicas para suporte.',
          diagnosticsRun: 'Executar diagnóstico',
          diagnosticsRunning: 'Executando…',
          diagnosticsSend: 'Enviar relatório',
          diagnosticsSendOk: 'Relatório enviado. Obrigado!',
          diagnosticsSendFail: 'Envio indisponível — compartilhe o arquivo salvo.',
          diagnosticsOpenFolder: 'Abrir pasta',
        },
      },
    },
  },
})

function mountCard() {
  return mount(DiagnosticsCard, { global: { plugins: [i18n] } })
}

describe('DiagnosticsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('desktop sem diagnóstico (web): mostra aviso e desabilita botão', async () => {
    const saved = bridgeMock.diagnostics
    // @ts-expect-error teste simula ausência da API
    bridgeMock.diagnostics = undefined
    const wrapper = mountCard()
    expect(bridgeMock.diagnostics).toBeUndefined()
    const btn = wrapper.find('button.general-settings__btn--primary')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    // @ts-expect-error restaura
    bridgeMock.diagnostics = saved
  })

  it('executa diagnóstico e expõe envio', async () => {
    bridgeMock.diagnostics.run.mockResolvedValue({
      report: { meta: { versao: '1.30.0' } },
      jsonPath: '/tmp/x.json',
      txtPath: '/tmp/x.txt',
    })
    const wrapper = mountCard()
    await wrapper.find('button.general-settings__btn--primary').trigger('click')
    await flushPromises()
    expect(bridgeMock.diagnostics.run).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('/tmp/x.json')
    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Enviar'))
    expect(sendBtn).toBeTruthy()
  })

  it('envia relatório e mostra confirmação', async () => {
    bridgeMock.diagnostics.run.mockResolvedValue({
      report: { meta: {} },
      jsonPath: '/tmp/x.json',
      txtPath: '/tmp/x.txt',
    })
    bridgeMock.diagnostics.send.mockResolvedValue({ ok: true })
    const wrapper = mountCard()
    await wrapper.find('button.general-settings__btn--primary').trigger('click')
    await flushPromises()
    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Enviar'))
    await sendBtn!.trigger('click')
    await flushPromises()
    expect(bridgeMock.diagnostics.send).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Relatório enviado')
  })

  it('falha no envio: mensagem fallback sem quebrar', async () => {
    bridgeMock.diagnostics.run.mockResolvedValue({
      report: { meta: {} },
      jsonPath: '/tmp/x.json',
      txtPath: '/tmp/x.txt',
    })
    bridgeMock.diagnostics.send.mockResolvedValue({ ok: false, reason: 'HTTP 500' })
    const wrapper = mountCard()
    await wrapper.find('button.general-settings__btn--primary').trigger('click')
    await flushPromises()
    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Enviar'))
    await sendBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Envio indisponível')
    expect(wrapper.text()).toContain('HTTP 500')
  })
})
