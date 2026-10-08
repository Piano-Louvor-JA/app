// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import DiagnosticsView from '../DiagnosticsView.vue'

type BridgeShape = {
  isElectron: boolean
  diagnostics: {
    run: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    openFolder: ReturnType<typeof vi.fn>
  }
}

function setBridge(bridge: Partial<BridgeShape> | null) {
  ;(window as unknown as { louvorja?: unknown }).louvorja = bridge
}

const runResult = {
  report: { veredito: 'ok' },
  jsonPath: 'C:/Desktop/louvorja-diagnostico.json',
  txtPath: 'C:/Desktop/louvorja-diagnostico.txt',
}

beforeEach(() => {
  setBridge(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DiagnosticsView (dev — SrCaldeira)', () => {
  it('sem bridge: avisa que precisa do Electron e botão desabilitado', () => {
    const w = mount(DiagnosticsView)
    expect(w.find('.warning').text()).toContain('Electron')
    expect(w.find('button.run').attributes('disabled')).toBeDefined()
  })

  it('com bridge: botão habilitado; run() mostra caminhos dos arquivos', async () => {
    const run = vi.fn().mockResolvedValue(runResult)
    setBridge({ isElectron: true, diagnostics: { run, send: vi.fn(), openFolder: vi.fn() } })
    const w = mount(DiagnosticsView)
    expect(w.find('button.run').attributes('disabled')).toBeUndefined()
    await w.find('button.run').trigger('click')
    expect(run).toHaveBeenCalledOnce()
    await flushPromises()
    expect(w.find('.success').text()).toContain(runResult.jsonPath)
    expect(w.find('.success').text()).toContain(runResult.txtPath)
    expect(w.find('.warning').exists()).toBe(false)
  })

  it('run() que lança: mensagem de erro, sem result', async () => {
    const run = vi.fn().mockRejectedValue(new Error('handler crash'))
    setBridge({ isElectron: true, diagnostics: { run, send: vi.fn(), openFolder: vi.fn() } })
    const w = mount(DiagnosticsView)
    await w.find('button.run').trigger('click')
    await flushPromises()
    expect(w.find('.warning').text()).toContain('handler crash')
    expect(w.find('.success').exists()).toBe(false)
  })

  it('run com bridge sem diagnostics: click é no-op', async () => {
    setBridge({ isElectron: true })
    const w = mount(DiagnosticsView)
    expect(w.find('button.run').attributes('disabled')).toBeDefined()
  })

  it('send() ok mostra confirmação; send() falho mostra fallback "compartilhe o arquivo"', async () => {
    const sendOk = vi.fn().mockResolvedValue({ ok: true })
    setBridge({ isElectron: true, diagnostics: { run: vi.fn().mockResolvedValue(runResult), send: sendOk, openFolder: vi.fn() } })
    let w = mount(DiagnosticsView)
    const vmResult = w.vm as unknown as { result: unknown }
    expect(vmResult.result).toBeNull()
    // produz result sem passar pelo botão (run já testado):
    ;(w.vm as unknown as { result: { value?: unknown } }).result = { value: runResult }
    await w.find('button.secondary').trigger('click')
    await flushPromises()
    expect(sendOk).toHaveBeenCalledWith(runResult.report)
    expect(w.find('.progress').text()).toContain('enviado')
    w.unmount()

    const sendFail = vi.fn().mockResolvedValue({ ok: false, reason: 'DSN não configurado' })
    setBridge({ isElectron: true, diagnostics: { run: vi.fn().mockResolvedValue(runResult), send: sendFail, openFolder: vi.fn() } })
    w = mount(DiagnosticsView)
    ;(w.vm as unknown as { result: { value?: unknown } }).result = { value: runResult }
    await w.find('button.secondary').trigger('click')
    await flushPromises()
    expect(w.find('.progress').text()).toContain('Compartilhe o arquivo')
    w.unmount()
  })

  it('openFolder chama a bridge com o jsonPath', async () => {
    const openFolder = vi.fn()
    setBridge({ isElectron: true, diagnostics: { run: vi.fn().mockResolvedValue(runResult), send: vi.fn(), openFolder } })
    const w = mount(DiagnosticsView)
    ;(w.vm as unknown as { result: { value?: unknown } }).result = { value: runResult }
    const buttons = w.findAll('button.secondary')
    await buttons[1].trigger('click')
    expect(openFolder).toHaveBeenCalledWith(runResult.jsonPath)
  })
})
