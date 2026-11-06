// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CACHE_LIMIT_GB_OPTIONS,
  DEFAULT_SETTINGS,
  DEFERRED_INSTALL_MS,
  ONLINE_VIDEO_RECORD,
  OnlineVideoService,
  registerOnlineVideoIpc,
  settingsFromRecord,
} from '../ipc.mjs'
import { UPDATE_INTERVAL_MS } from '../tools.mjs'

const A = 'aaaaaaaaaaa'
const GB = 1024 ** 3

let dir
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'piano-ov-ipc-')) })
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

function fakes({ record = { enabled: true }, available = true, ready = false } = {}) {
  const tools = {
    available,
    ready,
    load: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
    status: vi.fn(() => ({ state: ready ? 'ready' : 'missing' })),
    ensure: vi.fn(async () => ({})),
    checkForUpdate: vi.fn(async () => false),
  }
  const cache = {
    load: vi.fn(async () => {}),
    usage: vi.fn(() => ({ bytes: 10, count: 1, limitBytes: 6 * GB })),
    setLimit: vi.fn(async () => {}),
    setKeep: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  }
  const manager = {
    play: vi.fn(async (id) => ({ kind: 'stream', id })),
    release: vi.fn(async () => {}),
    prefetch: vi.fn(),
    cancel: vi.fn(async () => {}),
    cancelAll: vi.fn(async () => {}),
    status: vi.fn(() => ({ state: 'none' })),
    serve: vi.fn(() => new Response(null, { status: 404 })),
  }
  const writeRecord = vi.fn()
  const readRecord = vi.fn(() => record)
  return { tools, cache, manager, writeRecord, readRecord }
}

const make = (opts = {}, extra = {}) => {
  const f = fakes(opts)
  const service = new OnlineVideoService({ userDataDir: dir, ...f, ...extra })
  return { service, ...f }
}

describe('settingsFromRecord', () => {
  it('padrão para registro ausente ou inválido', () => {
    expect(settingsFromRecord(null)).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRecord('x')).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRecord({ enabled: 'sim', maxHeight: 360, limitGb: 7 })).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ enabled: false, maxHeight: 720, limitGb: 6 })
  })

  it('ida e volta das escolhas válidas', () => {
    const saved = { enabled: false, maxHeight: 1080, limitGb: 20 }
    expect(settingsFromRecord(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
    expect(CACHE_LIMIT_GB_OPTIONS).toContain(6)
  })
})

describe('OnlineVideoService', () => {
  it('lê as configurações salvas; leitura que falha usa o padrão', () => {
    expect(make({ record: { enabled: false, maxHeight: 480, limitGb: 2 } }).service.settings).toEqual({ enabled: false, maxHeight: 480, limitGb: 2 })
    const service = new OnlineVideoService({ userDataDir: dir, ...fakes(), readRecord: () => { throw new Error('corrompido') } })
    expect(service.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('cria ferramentas, cache e gerenciador reais nas pastas do app', () => {
    const broadcast = vi.fn()
    const service = new OnlineVideoService({
      userDataDir: dir,
      readRecord: () => ({ limitGb: 2, maxHeight: 480 }),
      writeRecord: vi.fn(),
      broadcast,
      getLocale: () => 'es',
    })
    expect(service.tools.binDir).toBe(path.join(dir, 'bin'))
    expect(service.cache.dir).toBe(path.join(dir, 'video-cache'))
    expect(service.cache.limitBytes).toBe(2 * GB)
    expect(service.manager.ytdlpCacheDir).toBe(path.join(dir, 'bin', 'ytdlp-cache'))
    expect(service.manager.getSettings()).toEqual({ maxHeight: 480, locale: 'es' })
    service.tools.onStatus({ state: 'ready' })
    service.manager.onChange(A, { state: 'ready' })
    expect(broadcast).toHaveBeenCalledWith('online-video:tools', { state: 'ready' })
    expect(broadcast).toHaveBeenCalledWith('online-video:changed', { id: A, status: { state: 'ready' } })
    const defaults = new OnlineVideoService({ userDataDir: dir, readRecord: () => null, writeRecord: vi.fn() })
    expect(defaults.manager.getSettings().locale).toBe('pt-BR')
    defaults.tools.onStatus({ state: 'missing' })
  })

  it('status reúne visibilidade, configurações, ferramentas e uso', () => {
    const { service } = make({ record: null })
    expect(service.status()).toEqual({
      hidden: false,
      available: true,
      settings: DEFAULT_SETTINGS,
      tools: { state: 'missing' },
      usage: { bytes: 10, count: 1, limitBytes: 6 * GB },
    })
  })

  it('init arruma as pastas e instala as ferramentas 3 minutos depois', async () => {
    vi.useFakeTimers()
    const { service, tools, cache } = make()
    await service.init()
    expect(tools.load).toHaveBeenCalled()
    expect(tools.cleanup).toHaveBeenCalled()
    expect(cache.load).toHaveBeenCalled()
    expect(tools.ensure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DEFERRED_INSTALL_MS)
    expect(tools.ensure).toHaveBeenCalledTimes(1)
    expect(service.timers).toHaveLength(1)
    service.dispose()
    expect(service.timers).toHaveLength(0)
  })

  it('com as ferramentas prontas, verifica atualização todo dia e registra falhas', async () => {
    vi.useFakeTimers()
    const log = vi.fn()
    const { service, tools } = make({ ready: true }, { log })
    tools.checkForUpdate.mockRejectedValueOnce(new Error('offline'))
    await service.init()
    await vi.advanceTimersByTimeAsync(DEFERRED_INSTALL_MS)
    expect(log).toHaveBeenCalledWith('ferramentas: offline')
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS)
    expect(tools.checkForUpdate).toHaveBeenCalledTimes(2)
    expect(service.timers).toHaveLength(1)
    service.dispose()
  })

  it('erro sem mensagem também é registrado', async () => {
    vi.useFakeTimers()
    const log = vi.fn()
    const { service, tools } = make({}, { log })
    tools.ensure.mockRejectedValueOnce('falhou')
    await service.init()
    await vi.advanceTimersByTimeAsync(DEFERRED_INSTALL_MS)
    expect(log).toHaveBeenCalledWith('ferramentas: falhou')
    service.dispose()
  })

  it('Microsoft Store: escondido, sem preparar nada e sem tocar', async () => {
    const { service, tools, manager } = make({}, { windowsStore: true })
    await service.init()
    expect(tools.load).not.toHaveBeenCalled()
    expect(service.active).toBe(false)
    expect(service.status().hidden).toBe(true)
    expect(await service.play(A)).toBeNull()
    expect(manager.play).not.toHaveBeenCalled()
  })

  it('desligado ou sem binário: play devolve null e não antecipa', async () => {
    const off = make({ record: { enabled: false } })
    expect(await off.service.play(A)).toBeNull()
    off.service.prefetch([A])
    expect(off.manager.prefetch).not.toHaveBeenCalled()
    const unavailable = make({ available: false })
    expect(unavailable.service.active).toBe(false)
  })

  it('ferramentas ainda não instaladas: toca pela página e instala em segundo plano', async () => {
    const { service, tools, manager } = make()
    tools.ensure.mockRejectedValueOnce(new Error('offline'))
    expect(await service.play(A)).toBeNull()
    expect(tools.ensure).toHaveBeenCalled()
    expect(manager.play).not.toHaveBeenCalled()
  })

  it('descoberta lenta: desiste depois do limite e libera o vídeo, que segue baixando', async () => {
    const { service, manager } = make({ ready: true }, { playTimeoutMs: 10 })
    manager.play.mockImplementation(() => new Promise(() => {}))
    expect(await service.play(A)).toBeNull()
    expect(manager.release).toHaveBeenCalledWith(A)
  })

  it('padrão desligado: play segue com a página do YouTube', async () => {
    const { service, manager } = make({ record: null, ready: true })
    expect(service.active).toBe(false)
    expect(await service.play(A)).toBeNull()
    expect(manager.play).not.toHaveBeenCalled()
  })

  it('página do YouTube não tocou: baixa a cópia mesmo desligado, instalando as ferramentas antes', async () => {
    const { service, tools, manager } = make({ record: null })
    expect(await service.fallback(A)).toEqual({ kind: 'stream', id: A })
    expect(tools.ensure).toHaveBeenCalled()
    expect(tools.ensure.mock.invocationCallOrder[0]).toBeLessThan(manager.play.mock.invocationCallOrder[0])
  })

  it('fallback: sem ferramentas ou demorando demais, desiste; Store e plataforma sem binário não baixam', async () => {
    const offline = make({ record: null })
    offline.tools.ensure.mockRejectedValueOnce(new Error('offline'))
    await expect(offline.service.fallback(A)).rejects.toThrow('offline')

    const slow = make({ record: null }, { fallbackTimeoutMs: 10 })
    slow.manager.play.mockImplementation(() => new Promise(() => {}))
    expect(await slow.service.fallback(A)).toBeNull()
    expect(slow.manager.release).toHaveBeenCalledWith(A)

    expect(await make({}, { windowsStore: true }).service.fallback(A)).toBeNull()
    const unavailable = make({ available: false })
    expect(await unavailable.service.fallback(A)).toBeNull()
    expect(unavailable.tools.ensure).not.toHaveBeenCalled()
  })

  it('falha do gerenciador chega a quem pediu', async () => {
    const { service, manager } = make({ ready: true })
    manager.play.mockRejectedValueOnce(Object.assign(new Error('Private video'), { code: 'unavailable' }))
    await expect(service.play(A)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('ligado: play, release, prefetch, cancel, keep, clear e serve vão ao gerenciador e ao cache', async () => {
    const { service, manager, cache } = make({ ready: true })
    expect(await service.play(A)).toEqual({ kind: 'stream', id: A })
    expect(manager.release).not.toHaveBeenCalled()
    await service.release(A)
    expect(manager.release).toHaveBeenCalledWith(A)
    service.prefetch([A])
    service.prefetch('x')
    expect(manager.prefetch).toHaveBeenCalledTimes(1)
    await service.cancel(A)
    expect(manager.cancel).toHaveBeenCalledWith(A)
    await service.keep([A])
    await service.keep(null)
    expect(cache.setKeep).toHaveBeenLastCalledWith([])
    expect((await service.clear()).usage.count).toBe(1)
    expect(cache.clear).toHaveBeenCalled()
    expect(service.videoStatus([A])).toEqual({ [A]: { state: 'none' } })
    expect(service.videoStatus('x')).toEqual({})
    expect(service.serve(A, 'video', null, undefined).status).toBe(404)
  })

  it('setSettings persiste, aplica o limite e desligar cancela os downloads', async () => {
    const { service, writeRecord, cache, manager } = make()
    const status = await service.setSettings({ limitGb: 10, maxHeight: 1080, outro: 1 })
    expect(writeRecord).toHaveBeenCalledWith(ONLINE_VIDEO_RECORD, { enabled: true, maxHeight: 1080, limitGb: 10 })
    expect(cache.setLimit).toHaveBeenCalledWith(10 * GB)
    expect(status.settings.limitGb).toBe(10)
    expect(manager.cancelAll).not.toHaveBeenCalled()

    await service.setSettings({ enabled: false })
    expect(manager.cancelAll).toHaveBeenCalledWith({ keepPlaying: true })
    await service.setSettings(null)
    expect(service.settings.enabled).toBe(false)
  })

  it('religar instala as ferramentas na hora', async () => {
    const { service, tools } = make({ record: { enabled: false } })
    await service.setSettings({ enabled: true })
    await vi.waitFor(() => expect(tools.ensure).toHaveBeenCalled())
    service.dispose()
  })

  it('retryTools tenta instalar e devolve o status mesmo com falha, também desligado (recuperação usa as ferramentas)', async () => {
    const { service, tools } = make()
    tools.ensure.mockRejectedValueOnce(new Error('x'))
    expect((await service.retryTools()).available).toBe(true)
    const off = make({ record: { enabled: false } })
    await off.service.retryTools()
    expect(off.tools.ensure).toHaveBeenCalled()
    const store = make({}, { windowsStore: true })
    await store.service.retryTools()
    expect(store.tools.ensure).not.toHaveBeenCalled()
    const unavailable = make({ available: false })
    await unavailable.service.retryTools()
    expect(unavailable.tools.ensure).not.toHaveBeenCalled()
  })
})

describe('registerOnlineVideoIpc', () => {
  it('registra os canais e repassa os argumentos', async () => {
    const handlers = {}
    const ipcMain = { handle: vi.fn((channel, fn) => { handlers[channel] = fn }) }
    const service = {
      status: vi.fn(() => 's'),
      setSettings: vi.fn(),
      prefetch: vi.fn(),
      cancel: vi.fn(),
      keep: vi.fn(),
      clear: vi.fn(),
      videoStatus: vi.fn(),
      retryTools: vi.fn(),
    }
    registerOnlineVideoIpc(ipcMain, service)
    expect(Object.keys(handlers).sort()).toEqual([
      'online-video:cancel', 'online-video:clear', 'online-video:keep', 'online-video:prefetch',
      'online-video:retry-tools', 'online-video:set-settings', 'online-video:status', 'online-video:video-status',
    ])
    expect(handlers['online-video:status']()).toBe('s')
    handlers['online-video:set-settings']({}, { limitGb: 2 })
    handlers['online-video:prefetch']({}, [A])
    handlers['online-video:cancel']({}, A)
    handlers['online-video:keep']({}, [A])
    handlers['online-video:clear']()
    handlers['online-video:video-status']({}, [A])
    handlers['online-video:retry-tools']()
    expect(service.setSettings).toHaveBeenCalledWith({ limitGb: 2 })
    expect(service.prefetch).toHaveBeenCalledWith([A])
    expect(service.cancel).toHaveBeenCalledWith(A)
    expect(service.keep).toHaveBeenCalledWith([A])
    expect(service.clear).toHaveBeenCalled()
    expect(service.videoStatus).toHaveBeenCalledWith([A])
    expect(service.retryTools).toHaveBeenCalled()
  })
})
