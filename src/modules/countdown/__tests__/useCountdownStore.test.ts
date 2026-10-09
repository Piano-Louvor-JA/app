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
  hasSelectedExtendedProjectionTargets: vi.fn(async () => true),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  isPalcoTvOnlyRoute: vi.fn(() => false),
}))

import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'

import { useCountdownStore } from '../stores/useCountdownStore'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { COUNTDOWN_RUNTIME_STORAGE_KEY } from '../services/countdown-runtime'
import {
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_COUNTDOWN_RUNTIME,
} from '../types/countdown'

function seedPref(key: string, value: unknown) {
  localStorage.setItem('user_data', JSON.stringify({ [key]: value }))
}

/** Remaining de um alvo wall-clock local (espelha wallClockUntilRemainingMs). */
function computeUntilRemaining(hour: number, minute: number, nowMs: number): number {
  const target = new Date(nowMs)
  target.setHours(hour, minute, 0, 0)
  return target.getTime() - nowMs
}

describe('useCountdownStore', () => {
  let store: ReturnType<typeof useCountdownStore>

  function freshStore() {
    setActivePinia(createPinia())
    store = useCountdownStore()
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(false)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.mocked(openProjectionModule).mockResolvedValue(true)
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    freshStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('estado inicial: defaults e computeds', () => {
    expect(store.config).toEqual({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
    expect(store.isRunning).toBe(false)
    expect(store.isPaused).toBe(false)
    expect(store.canStart).toBe(true) // idle com duração default (5min) > 0
    expect(store.isUntilMode).toBe(false)
    expect(store.hydrated).toBe(false)
  })

  it('canStart: true com duração > 0, false com duração 0, true em modo until', () => {
    expect(store.canStart).toBe(true) // default 5min
    store.setDurationMs(0)
    expect(store.canStart).toBe(false)
    store.setCountdownMode('until')
    expect(store.canStart).toBe(true)
    expect(store.isUntilMode).toBe(true)
  })

  it('guards durante execução: canStart false, start/pause/setUntilTime recusam', () => {
    store.setDurationMs(60_000)
    store.start()
    expect(store.runtime.status).toBe('running')

    // canStart com running (L55)
    expect(store.canStart).toBe(false)

    const snapshot = { ...store.runtime }
    store.start() // no-op: já running (L201)
    store.pause() // pause válido, sai de running
    expect(store.runtime.status).toBe('paused')
    store.start() // retoma
    expect(store.runtime.status).toBe('running')
    store.setUntilTime(9, 9) // no-op: running (L183-184 clamp não roda, early return)
    expect(store.runtime.untilHour).toBe(snapshot.untilHour ?? store.runtime.untilHour)
    store.pause()
    // pause sem running (L215): segunda chamada é no-op
    store.pause()
    expect(store.runtime.status).toBe('paused')
  })

  it('start com duração 0 em modo duration é no-op', () => {
    store.setDurationMs(0)
    store.start()
    expect(store.runtime.status).toBe('idle')
  })

  it('setUntilTime clamp: hora >23 vira 23, minuto >59 vira 59, negativos viram 0', () => {
    store.setUntilTime(99, 99)
    expect(store.runtime.untilHour).toBe(23)
    expect(store.runtime.untilMinute).toBe(59)
    store.setUntilTime(-1, -1)
    expect(store.runtime.untilHour).toBe(0)
    expect(store.runtime.untilMinute).toBe(0)
  })

  it('setUntilTime com NaN cai no fallback 0', () => {
    store.setUntilTime(NaN, NaN)
    expect(store.runtime.untilHour).toBe(0)
    expect(store.runtime.untilMinute).toBe(0)
  })

  it('toggleProjection desliga quando inAppPreview ativo', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.syncProjection()
    expect(store.inAppPreview).toBe(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
    expect(closeProjectionModule).toHaveBeenCalled()
  })

  it('hydrate com projeção aberta inicia watch de janela', () => {
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    freshStore()
    store.hydrate()
    expect(store.isProjecting).toBe(true)
    // janela fecha → watch derruba
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)
  })

  it('watch TV-only: tick NÃO derruba projeção mesmo com janela "fechada"', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    expect(store.isProjecting).toBe(true)
    // janela fisicamente fechada, mas TV-only → guard do tick mantém projeção
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(true)
  })

  it('watch inAppPreview: tick NÃO derruba projeção', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.syncProjection()
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(true)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(true)
  })

  it('toggleProjection desliga quando projectingTvsOnly (via clearProjection)', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
    expect(closeProjectionModule).toHaveBeenCalled()
  })

  it('hydrate lê config e runtime persistidos; running reinicia finishWatch', () => {
    seedPref(USER_PREFERENCE_KEYS.countdownConfig, {
      ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
      timeFormat: 'mm:ss',
    })
    localStorage.setItem(
      COUNTDOWN_RUNTIME_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_COUNTDOWN_RUNTIME, status: 'running', segmentStartedAt: 90_000 }),
    )
    freshStore()
    store.hydrate()
    expect(store.config.timeFormat).toBe('mm:ss')
    expect(store.runtime.status).toBe('running')
    expect(store.isRunning).toBe(true)

    // finishWatch cruza zero após 15s (segmentStartedAt 90s + duração 5min? não: durationMs default
    // resta 300s; avançar além garante cruzamento se acumulado for alto). Avançar 10min cobre.
    vi.advanceTimersByTime(600_000)
    expect(store.runtime.finished).toBe(true)
  })

  it('hydrate idempotente', () => {
    store.hydrate()
    store.setTimeFormat('mm:ss')
    store.hydrate()
    expect(store.config.timeFormat).toBe('mm:ss')
  })

  it('setters de display persistem (roundtrip)', () => {
    store.hydrate()
    store.setTimeFormat('mm:ss.ms')
    store.setBgColor('#111213')
    store.setTextColor('#141516')
    freshStore()
    store.hydrate()
    expect(store.config.timeFormat).toBe('mm:ss.ms')
    expect(store.config.bgColor).toBe('#111213')
    expect(store.config.textColor).toBe('#141516')
  })

  it('resetDisplayToDefault', () => {
    store.hydrate()
    store.setTimeFormat('mm:ss.ms')
    store.resetDisplayToDefault()
    expect(store.config).toEqual({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
  })

  it('setDurationMs: reseta sessão e recusa durante execução', () => {
    store.setDurationMs(61_500)
    expect(store.runtime.durationMs).toBe(61_500)
    expect(store.runtime.mode).toBe('duration')
    expect(store.runtime.status).toBe('idle')

    store.start()
    store.setDurationMs(5_000) // no-op: running
    expect(store.runtime.durationMs).toBe(61_500)
  })

  it('setDurationMs negativo/decimal é clampado', () => {
    store.setDurationMs(-5.9)
    expect(store.runtime.durationMs).toBe(0)
  })

  it('setCountdownMode reseta a sessão; recusa durante execução', () => {
    store.setDurationMs(60_000)
    store.start()
    store.setCountdownMode('until') // no-op
    expect(store.runtime.mode).toBe('duration')

    store.pause()
    store.setCountdownMode('until')
    expect(store.runtime.mode).toBe('until')
    expect(store.runtime.accumulatedMs).toBe(0)
  })

  it('setUntilTime clamp hora 0-23 e minuto 0-59; recusa durante execução', () => {
    store.setUntilTime(25, -3)
    expect(store.runtime.untilHour).toBe(23)
    expect(store.runtime.untilMinute).toBe(0)

    store.setUntilTime(7.9, 8.9)
    expect(store.runtime.untilHour).toBe(7)
    expect(store.runtime.untilMinute).toBe(8)

    store.start()
    store.setUntilTime(1, 2) // no-op
    expect(store.runtime.untilHour).toBe(7)
  })

  it('start/pause modo duração: acumula e preserva overtime', () => {
    store.setDurationMs(60_000)
    store.start()
    expect(store.isRunning).toBe(true)

    vi.setSystemTime(130_000) // 30s rodando
    store.pause()
    expect(store.isPaused).toBe(true)
    expect(store.runtime.accumulatedMs).toBe(30_000)
    expect(store.runtime.segmentStartedAt).toBeNull()
  })

  it('start/pause modo until: pausa guarda remaining', () => {
    // Alvo no relógio de parede LOCAL: usar uma hora baseada no próprio epoch fake.
    // epoch 100_000 é 00:01:40 UTC; local é UTC-3 → 21:01:40 de 31/12/1969.
    // setHours usa fuso local: escolher until 23:00 → target 23:00 local de 31/12/1969.
    const now = new Date(100_000)
    const untilHour = (now.getHours() + 1) % 24 // 1h à frente no fuso local
    const untilMinute = now.getMinutes()

    store.setUntilTime(untilHour, untilMinute)
    store.start()
    // remaining no start: 1h - (40s do minuto atual)
    const remainingAtStart = computeUntilRemaining(untilHour, untilMinute, 100_000)
    expect(computeUntilRemaining(untilHour, untilMinute, 100_000)).toBe(remainingAtStart)

    vi.setSystemTime(120_000) // +20s
    store.pause()
    expect(store.runtime.pausedRemainingMs).toBe(remainingAtStart - 20_000)
  })

  it('pause sem segment (defensivo) retorna sem mudar', () => {
    store.setDurationMs(60_000)
    store.start()
    // força segmentStartedAt null
    store.runtime = { ...store.runtime, segmentStartedAt: null }
    store.pause()
    expect(store.isRunning).toBe(true) // não pausou
  })

  it('finishWatch marca finished ao cruzar zero e segue em negativo', () => {
    store.setDurationMs(60_000)
    store.start()
    vi.setSystemTime(160_000) // 100s: cruzou os 60s
    vi.advanceTimersByTime(100)
    expect(store.runtime.finished).toBe(true)
    // segue running (overtime)
    expect(store.isRunning).toBe(true)
  })

  it('reset pausado → idle; reset rodando → continua rodando zerado', () => {
    store.setDurationMs(60_000)
    store.start()
    vi.setSystemTime(110_000)
    store.reset()
    expect(store.runtime.status).toBe('running')
    expect(store.runtime.accumulatedMs).toBe(0)
    expect(store.runtime.segmentStartedAt).toBe(110_000)

    store.pause()
    store.reset()
    expect(store.runtime.status).toBe('idle')
    expect(store.runtime.finished).toBe(false)
  })

  it('saveMark salva remaining (running ou não); removeSavedMark/clearSavedMarks', () => {
    store.setDurationMs(60_000)
    // sem start: idle → remaining sempre a duração cheia
    store.saveMark()
    expect(store.runtime.savedTimesMs).toEqual([60_000])

    store.start() // segmentStartedAt = 100_000
    vi.setSystemTime(110_000)
    store.saveMark()
    expect(store.runtime.savedTimesMs).toEqual([60_000, 50_000])

    store.removeSavedMark(0)
    expect(store.runtime.savedTimesMs).toEqual([50_000])
    store.clearSavedMarks()
    expect(store.runtime.savedTimesMs).toEqual([])
  })

  it('runtime publicado no storage com projecting espelhado', async () => {
    store.hydrate()
    await store.syncProjection()
    const raw = JSON.parse(localStorage.getItem(COUNTDOWN_RUNTIME_STORAGE_KEY) as string)
    expect(raw.projecting).toBe(true)
  })

  it('syncProjection espelho com monitor externo abre janela', async () => {
    await store.syncProjection()
    expect(openProjectionModule).toHaveBeenCalledWith('countdown')
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(false)
  })

  it('syncProjection sem monitor externo: preview in-app', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.syncProjection()
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(true)
  })

  it('syncProjection TV-only', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
  })

  it('syncProjection falha ao abrir: isProjecting false', async () => {
    vi.mocked(openProjectionModule).mockResolvedValue(false)
    await store.syncProjection()
    expect(store.isProjecting).toBe(false)
  })

  it('watch derruba janela fechada; mantém com janela aberta', async () => {
    await store.syncProjection()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)

    // reabre
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    await store.syncProjection()
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(true)
  })

  it('toggleProjection liga/desliga; preview ativo desliga', async () => {
    await store.toggleProjection()
    expect(store.isProjecting).toBe(true)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
    expect(closeProjectionModule).toHaveBeenCalled()
  })

  it('clearProjection zera tudo', async () => {
    await store.syncProjection()
    store.clearProjection()
    expect(store.isProjecting).toBe(false)
    const raw = JSON.parse(localStorage.getItem(COUNTDOWN_RUNTIME_STORAGE_KEY) as string)
    expect(raw.projecting).toBe(false)
  })

  it('openConfig/closeConfig', () => {
    store.openConfig()
    expect(store.configOpen).toBe(true)
    store.closeConfig()
    expect(store.configOpen).toBe(false)
  })

describe('useCountdownDisplay — sem fontes (store)', () => {
  it('usa defaults do composable (tick ativo por padrão)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useCountdownDisplay } = await import('../composables/useCountdown')
    const display = useCountdownDisplay()
    expect(display.formattedTime.value).toBeDefined()
    expect(display.isUrgent.value).toBe(false)
    expect(display.isFinished.value).toBe(false)
  })
})
})
