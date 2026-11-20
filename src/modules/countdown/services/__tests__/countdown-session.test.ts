// @vitest-environment jsdom
/**
 * Cronômetro iniciado numa execução anterior do app não pode voltar rodando
 * (nem disparar alertas) ao abrir o app de novo; na mesma execução continua.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@shared/composables/useProjectionWindow', () => ({
  isProjectionModuleOpen: vi.fn(() => false),
  openProjectionModule: vi.fn(async () => true),
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(async () => true),
}))
vi.mock('../../../settings/services/palco-routing', () => ({
  isPalcoTvOnlyRoute: vi.fn(() => false),
}))

import { useCountdownStore } from '../../stores/useCountdownStore'
import { DEFAULT_COUNTDOWN_RUNTIME } from '../../types/countdown'
import {
  COUNTDOWN_RUNTIME_STORAGE_KEY,
  beginCountdownSession,
  readCountdownRuntimeFromStorage,
  stopCountdownRuntime,
} from '../countdown-runtime'

const runningFromBefore = {
  ...DEFAULT_COUNTDOWN_RUNTIME,
  status: 'running',
  segmentStartedAt: 1_000,
  accumulatedMs: 2_000,
  durationMs: 600_000,
  savedTimesMs: [42_000],
  finished: true,
  mode: 'duration',
  pausedRemainingMs: 5_000,
}

function hydrateFresh() {
  setActivePinia(createPinia())
  const store = useCountdownStore()
  store.hydrate()
  return store
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(COUNTDOWN_RUNTIME_STORAGE_KEY, JSON.stringify(runningFromBefore))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('beginCountdownSession', () => {
  it('true só na primeira chamada desta execução do app', () => {
    expect(beginCountdownSession()).toBe(true)
    expect(beginCountdownSession()).toBe(false)
  })

  it('sessionStorage indisponível: trata como mesma execução (não mexe no cronômetro)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(beginCountdownSession()).toBe(false)
  })
})

describe('stopCountdownRuntime', () => {
  it('para e zera a contagem, mantendo duração, modo e marcas salvas', () => {
    expect(stopCountdownRuntime(readCountdownRuntimeFromStorage())).toEqual({
      ...runningFromBefore,
      status: 'idle',
      segmentStartedAt: null,
      accumulatedMs: 0,
      finished: false,
      pausedRemainingMs: null,
    })
  })
})

describe('useCountdownStore.hydrate', () => {
  it('app recém-aberto: cronômetro da execução anterior volta parado e é republicado', () => {
    const store = hydrateFresh()
    expect(store.runtime.status).toBe('idle')
    expect(store.runtime.finished).toBe(false)
    expect(store.runtime.durationMs).toBe(600_000)
    expect(store.runtime.savedTimesMs).toEqual([42_000])
    expect(readCountdownRuntimeFromStorage().status).toBe('idle')
  })

  it('mesma execução (trocou de tela ou recarregou): continua de onde estava', () => {
    beginCountdownSession()
    const store = hydrateFresh()
    expect(store.runtime.status).toBe('running')
    expect(store.runtime.accumulatedMs).toBe(2_000)
  })

  it('app recém-aberto com cronômetro já parado: nada a republicar', () => {
    localStorage.setItem(
      COUNTDOWN_RUNTIME_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_COUNTDOWN_RUNTIME, durationMs: 120_000 }),
    )
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const store = hydrateFresh()
    expect(store.runtime.durationMs).toBe(120_000)
    expect(setItem).not.toHaveBeenCalledWith(COUNTDOWN_RUNTIME_STORAGE_KEY, expect.anything())
  })
})
