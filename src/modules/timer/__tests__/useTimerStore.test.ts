import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { createPinia, setActivePinia } from 'pinia'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
globalThis.window = dom.window as unknown as Window & typeof globalThis
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage

vi.mock('@shared/composables/useProjectionWindow', () => ({
  isProjectionModuleOpen: vi.fn(() => false),
  openProjectionModule: vi.fn(async () => true),
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(() => false),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  isPalcoTvOnlyRoute: vi.fn(() => false),
}))

import { isProjectionModuleOpen, openProjectionModule, hasSelectedExtendedProjectionTargets } from '@shared/composables/useProjectionWindow'
import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'

import { useTimerStore } from '../stores/useTimerStore'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { TIMER_RUNTIME_STORAGE_KEY } from '../services/timer-runtime'
import { DEFAULT_TIMER_DISPLAY_CONFIG, DEFAULT_TIMER_RUNTIME } from '../types/timer'

function seedPref(key: string, value: unknown) {
  localStorage.setItem('user_data', JSON.stringify({ [key]: value }))
}

describe('useTimerStore', () => {
  let store: ReturnType<typeof useTimerStore>

  function freshStore() {
    setActivePinia(createPinia())
    store = useTimerStore()
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(false)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.mocked(openProjectionModule).mockResolvedValue(true)
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    freshStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('estado inicial: defaults, não hidratado, computed false', () => {
    expect(store.config).toEqual({ ...DEFAULT_TIMER_DISPLAY_CONFIG })
    expect(store.isRunning).toBe(false)
    expect(store.isPaused).toBe(false)
    expect(store.hydrated).toBe(false)
    expect(store.isProjecting).toBe(false)
  })

  it('hydrate lê config + runtime persistidos', () => {
    seedPref(USER_PREFERENCE_KEYS.timerConfig, { ...DEFAULT_TIMER_DISPLAY_CONFIG, bgColor: '#101010' })
    localStorage.setItem(
      TIMER_RUNTIME_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_TIMER_RUNTIME, status: 'paused', accumulatedMs: 4242, savedTimesMs: [1] }),
    )
    freshStore()
    store.hydrate()
    expect(store.config.bgColor).toBe('#101010')
    expect(store.runtime.status).toBe('paused')
    expect(store.runtime.accumulatedMs).toBe(4242)
    expect(store.isPaused).toBe(true)
    expect(store.hydrated).toBe(true)
  })

  it('hydrate é idempotente', () => {
    store.hydrate()
    store.setTimeFormat('mm:ss')
    store.hydrate() // no-op
    expect(store.config.timeFormat).toBe('mm:ss')
  })

  it('hydrate com projeção já aberta inicia watch', () => {
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    freshStore()
    store.hydrate()
    expect(store.isProjecting).toBe(true)

    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)
  })

  it('setters de display persistem (roundtrip por nova store)', () => {
    store.hydrate()
    store.setTimeFormat('mm:ss.ms')
    store.setBgColor('#0a0b0c')
    store.setTextColor('#0d0e0f')

    freshStore()
    store.hydrate()
    expect(store.config.timeFormat).toBe('mm:ss.ms')
    expect(store.config.bgColor).toBe('#0a0b0c')
    expect(store.config.textColor).toBe('#0d0e0f')
  })

  it('resetDisplayToDefault volta ao default', () => {
    store.hydrate()
    store.setTimeFormat('mm:ss.ms')
    store.resetDisplayToDefault()
    expect(store.config).toEqual({ ...DEFAULT_TIMER_DISPLAY_CONFIG })
  })

  it('start/pause: acumula tempo do segmento com Date.now fake', () => {
    store.hydrate()
    store.start()
    expect(store.runtime.status).toBe('running')
    expect(store.runtime.segmentStartedAt).toBe(10_000)

    vi.setSystemTime(13_500) // 3.5s rodando
    store.pause()
    expect(store.runtime.status).toBe('paused')
    expect(store.runtime.segmentStartedAt).toBeNull()
    expect(store.runtime.accumulatedMs).toBe(3_500)
  })

  it('start quando já running é no-op', () => {
    store.start()
    const seg = store.runtime.segmentStartedAt
    store.start()
    expect(store.runtime.segmentStartedAt).toBe(seg)
  })

  it('pause quando não running é no-op', () => {
    store.pause()
    expect(store.runtime.status).toBe('idle')
  })

  it('reset em pausa: zera acumulado e volta a idle', () => {
    store.start()
    vi.setSystemTime(12_000)
    store.pause()
    store.reset()
    expect(store.runtime.status).toBe('idle')
    expect(store.runtime.accumulatedMs).toBe(0)
    expect(store.runtime.segmentStartedAt).toBeNull()
  })

  it('reset em execução: zera acumulado e continua rodando', () => {
    store.start()
    vi.setSystemTime(15_000)
    store.reset()
    expect(store.runtime.status).toBe('running')
    expect(store.runtime.accumulatedMs).toBe(0)
    expect(store.runtime.segmentStartedAt).toBe(15_000)
  })

  it('saveMark salva tempo corrente; removeSavedMark e clearSavedMarks', () => {
    store.start()
    vi.setSystemTime(11_000)
    store.saveMark()
    expect(store.runtime.savedTimesMs).toEqual([1_000])

    vi.setSystemTime(12_000)
    store.saveMark()
    expect(store.runtime.savedTimesMs).toEqual([1_000, 2_000])

    store.removeSavedMark(0)
    expect(store.runtime.savedTimesMs).toEqual([2_000])

    store.clearSavedMarks()
    expect(store.runtime.savedTimesMs).toEqual([])
  })

  it('runtime é publicado no localStorage a cada mudança (syncRuntime)', () => {
    store.hydrate()
    store.start()
    const raw = localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).status).toBe('running')
  })

  it('syncProjection espelho sem monitor externo: preview in-app, projecting true', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.syncProjection()
    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(true)
    const raw = JSON.parse(localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY) as string)
    expect(raw.projecting).toBe(true)
  })

  it('syncProjection espelho com monitor externo: abre janela e publica projecting', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    await store.syncProjection()
    expect(openProjectionModule).toHaveBeenCalledWith('timer')
    expect(store.isProjecting).toBe(true)
    const raw = JSON.parse(localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY) as string)
    expect(raw.projecting).toBe(true)
  })

  it('syncProjection TV-only: projeta sem janela', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(hasSelectedExtendedProjectionTargets).not.toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
  })

  it('syncProjection falha ao abrir: isProjecting false, projecting publicado como false', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    vi.mocked(openProjectionModule).mockResolvedValue(false)
    await store.syncProjection()
    expect(store.isProjecting).toBe(false)
    const raw = JSON.parse(localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY) as string)
    expect(raw.projecting).toBe(false)
  })

  it('clearProjection zera estado de projeção', async () => {
    await store.syncProjection()
    store.clearProjection()
    expect(store.isProjecting).toBe(false)
    const raw = JSON.parse(localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY) as string)
    expect(raw.projecting).toBe(false)
  })

  it('watch não derruba TV-only', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(1000)
    expect(store.isProjecting).toBe(true)
  })

  it('watch derruba janela fechada no modo espelho', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    await store.syncProjection()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)
  })

  it('watch mantém projeção enquanto a janela segue aberta', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    await store.syncProjection()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    vi.advanceTimersByTime(1000)
    expect(store.isProjecting).toBe(true)
  })

  it('toggle com preview in-app ativo → clearProjection', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.syncProjection()
    expect(store.inAppPreview).toBe(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
    expect(store.inAppPreview).toBe(false)
  })

  it('toggleProjection liga e desliga (janela aberta)', async () => {
    await store.toggleProjection()
    expect(store.isProjecting).toBe(true)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
  })

  it('openConfig/closeConfig', () => {
    store.openConfig()
    expect(store.configOpen).toBe(true)
    store.closeConfig()
    expect(store.configOpen).toBe(false)
  })
})
