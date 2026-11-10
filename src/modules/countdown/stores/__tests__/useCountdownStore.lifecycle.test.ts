import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG, DEFAULT_COUNTDOWN_RUNTIME } from '../../types/countdown'
const mocks = vi.hoisted(() => ({ config:vi.fn(), save:vi.fn(), readRuntime:vi.fn(), publishRuntime:vi.fn(), isOpen:vi.fn(), close:vi.fn() }))
vi.mock('@shared/composables/useProjectionWindow', () => ({ closeProjectionModule:mocks.close, hasSelectedExtendedProjectionTargets:()=>false, isProjectionModuleOpen:mocks.isOpen, openProjectionModule:vi.fn() }))
vi.mock('../../../settings/services/palco-routing', () => ({ isPalcoTvOnlyRoute:()=>false }))
vi.mock('../../services/countdown-preferences', () => ({ loadCountdownDisplayConfig:mocks.config, saveCountdownDisplayConfig:mocks.save }))
vi.mock('../../services/countdown-runtime', async original => ({ ...await original<typeof import('../../services/countdown-runtime')>(), beginCountdownSession:()=>false, publishCountdownRuntime:mocks.publishRuntime, readCountdownRuntimeFromStorage:mocks.readRuntime }))
import { TIMER_RUNTIME_STORAGE_KEY } from '../../services/countdown-runtime'
import { useCountdownOutputStore } from '../useCountdownOutputStore'
import { useCountdownStore } from '../useCountdownStore'
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T09:00:00'))
  localStorage.clear(); setActivePinia(createPinia())
  mocks.config.mockReturnValue({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
  mocks.readRuntime.mockReturnValue({ ...DEFAULT_COUNTDOWN_RUNTIME, savedTimesMs:[] })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('estado do Timer — ciclo de vida', () => {
  it('aplica a configuração dos diálogos de forma persistente', () => {
    const store=useCountdownStore()
    store.openDisplayConfig();expect(store.displayConfigOpen).toBe(true)
    store.closeDisplayConfig();expect(store.displayConfigOpen).toBe(false)
    store.setAllowNegative(true);expect(store.config.allowNegative).toBe(true)
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ allowNegative:true }))
    store.adjustTime(-Number.MAX_SAFE_INTEGER);expect(store.runtime.durationMs).toBe(0)
    store.adjustTime(60000);expect(store.runtime.durationMs).toBe(60000)
  })
  it('acompanha abertura e fechamento das projeções', async () => {
    const store=useCountdownStore();mocks.isOpen.mockReturnValue(true)
    store.refreshProjectionState();expect(store.isProjecting).toBe(true)
    await store.toggleProjection();expect(mocks.close).toHaveBeenCalledOnce()
    mocks.isOpen.mockReturnValue(false);store.refreshProjectionState()
    expect(store.isProjecting).toBe(false)
  })
})

describe('canal da tela de contagem dividido com outro módulo', () => {
  it('o Timer publica enquanto é o dono e guarda o próprio estado mesmo sem ser', async () => {
    const store=useCountdownStore();const output=useCountdownOutputStore()
    store.setDurationMs(60000)
    expect(mocks.publishRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ durationMs:60000 }))
    output.claim('sabbath-school');mocks.publishRuntime.mockClear()
    store.setDurationMs(120000);store.start()
    expect(store.runtime).toMatchObject({ status:'running',durationMs:120000 })
    expect(mocks.publishRuntime).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY)!)).toMatchObject({ status:'running',durationMs:120000 })
    await store.toggleProjection()
    expect(output.owner).toBe('timer')
    expect(mocks.publishRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ durationMs:120000,projecting:true }))
  })
  it('outro módulo projetar tira a tela do Timer sem fechá-la; limpar depois não fecha a do outro', async () => {
    const store=useCountdownStore();const output=useCountdownOutputStore()
    await store.toggleProjection()
    expect(store.isProjecting).toBe(true);expect(store.inAppPreview).toBe(true)
    mocks.close.mockClear()
    output.claim('sabbath-school')
    expect(store.isProjecting).toBe(false);expect(store.inAppPreview).toBe(false)
    store.clearProjection()
    expect(mocks.close).not.toHaveBeenCalled()
    mocks.isOpen.mockReturnValue(true);store.refreshProjectionState()
    expect(store.isProjecting).toBe(false)
  })
  it('ao abrir, retoma o estado salvo do Timer e só se considera projetando se for o dono', () => {
    localStorage.setItem(TIMER_RUNTIME_STORAGE_KEY, JSON.stringify({ ...DEFAULT_COUNTDOWN_RUNTIME, durationMs:42000 }))
    mocks.isOpen.mockReturnValue(true)
    useCountdownOutputStore().claim('sabbath-school')
    const store=useCountdownStore();store.hydrate()
    expect(store.runtime.durationMs).toBe(42000)
    expect(store.isProjecting).toBe(false)
  })
})

it('reset stops the countdown, clears duration and publishes zero while keeping projection active', () => {
  const store = useCountdownStore()
  store.setDurationMs(1903000)
  store.start()
  store.runtime.projecting = true
  store.reset()
  expect(store.runtime).toMatchObject({ status: 'idle', durationMs: 0, accumulatedMs: 0, segmentStartedAt: null, pausedRemainingMs: null, finished: false })
  expect(mocks.publishRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ durationMs: 0, status: 'idle' }))
})
