import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const reportErrors = vi.fn()
const reportAudio = vi.fn()
const reportJank = vi.fn()
let callbacks: Record<string, (event?: any) => void>
let documentCallbacks: Record<string, () => void>
let deviceChange: (() => void) | undefined
let raf: FrameRequestCallback | undefined
let clock = 0
beforeEach(() => {
  vi.resetModules()
  callbacks = {}; documentCallbacks = {}; clock = 0
  vi.spyOn(window, 'addEventListener').mockImplementation((name, callback) => { callbacks[name] = callback as any })
  vi.spyOn(document, 'addEventListener').mockImplementation((name, callback) => { documentCallbacks[name] = callback as any })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { raf = callback; return 1 }))
  vi.stubGlobal('louvorja', { diagnostics: { reportRendererErrors: reportErrors, reportAudioDevices: reportAudio, reportJank } })
  vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: vi.fn().mockResolvedValue([{ kind:'audioinput' }, { kind:'audiooutput' }, { kind:'videoinput' }]), addEventListener: vi.fn((_type, callback) => { deviceChange = callback }) } })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('diagnóstico local do renderer', () => {
  it('conta dispositivos de áudio e mudanças, sem duplicar assinaturas', async () => {
    const telemetry = await import('../telemetry')
    telemetry.startRendererErrorBuffer()
    telemetry.startRendererErrorBuffer()
    await Promise.resolve()
    expect(reportAudio).toHaveBeenLastCalledWith({ devices:2, devicechangeCount:0 })
    deviceChange!()
    await Promise.resolve()
    expect(reportAudio).toHaveBeenLastCalledWith({ devices:2, devicechangeCount:1 })
    expect(navigator.mediaDevices.addEventListener).toHaveBeenCalledOnce()
  })
  it('bufferiza erro de console, erro global e rejeição sem serialização destrutiva', async () => {
    const telemetry = await import('../telemetry')
    telemetry.startRendererErrorBuffer()
    const error = new Error('falha do player')
    console.error(error)
    callbacks.error!({ message:'falha da janela', error, filename:'app.js' })
    callbacks.unhandledrejection!({ reason:'download recusado' })
    console.error(null)
    console.error({ toString() { throw new Error('unserializable') } })
    const snapshot = JSON.stringify(reportErrors.mock.calls.at(-1)?.[0])
    expect(snapshot).toContain('falha do player')
    expect(snapshot).toContain('falha da janela')
    expect(snapshot).toContain('download recusado')
    expect(snapshot).toContain('[unserializable]')
  })
  it('registra frames longos, pior frame e amostra periódica, resetando baseline ao voltar do background', async () => {
    const telemetry = await import('../telemetry')
    telemetry.startRendererErrorBuffer()
    clock = 150; raf!(clock)
    expect(reportJank).toHaveBeenLastCalledWith({ sampledFrames:1, longFrames:1, worstFrameMs:150 })
    clock = 280; raf!(clock)
    expect(reportJank).toHaveBeenLastCalledWith({ sampledFrames:2, longFrames:2, worstFrameMs:150 })
    for(let i=2; i<600; i++) { clock += 16; raf!(clock) }
    expect(reportJank).toHaveBeenLastCalledWith({ sampledFrames:600, longFrames:2, worstFrameMs:150 })
    Object.defineProperty(document, 'visibilityState', { configurable:true, value:'hidden' })
    documentCallbacks.visibilitychange!()
    Object.defineProperty(document, 'visibilityState', { configurable:true, value:'visible' })
    clock += 10000
    documentCallbacks.visibilitychange!()
    clock += 16; raf!(clock)
    expect(reportJank).toHaveBeenCalledTimes(3)
  })
  it('tolera indisponibilidade de dispositivos, IPC e rAF sem impedir a captura de erros', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: vi.fn().mockRejectedValue(new Error('denied')), addEventListener: () => { throw new Error('unsupported') } } })
    vi.stubGlobal('requestAnimationFrame', () => { throw new Error('unavailable') })
    reportErrors.mockImplementationOnce(() => { throw new Error('IPC gone') })
    const telemetry = await import('../telemetry')
    expect(() => telemetry.startRendererErrorBuffer()).not.toThrow()
    await Promise.resolve()
    callbacks.unhandledrejection!({ reason:undefined })
    expect(reportErrors).toHaveBeenCalledTimes(2)
  })
})
