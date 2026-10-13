// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@shared/composables/useProjectionWindow', () => ({
  isProjectionModuleOpen: vi.fn(() => false),
  openProjectionModule: vi.fn(async () => true),
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(async () => true),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  isPalcoTvOnlyRoute: vi.fn(() => false),
}))
vi.mock('../../services/random-audio', () => ({
  applyRandomAudioOutput: vi.fn(),
  deleteRandomCustomAudio: vi.fn(async () => ({ ok: true })),
  ensureRandomDefaultAudioInstalled: vi.fn(async () => true),
  isRandomDrawAudioPlaying: vi.fn(() => false),
  pickAndImportRandomAudio: vi.fn(async () => ({ ok: true, fileName: 'a.mp3' })),
  playRandomDrawAudio: vi.fn(),
  playRandomWinnerEffect: vi.fn(),
  stopRandomDrawAudio: vi.fn(),
  subscribeRandomAudioPlaying: vi.fn((cb: (p: boolean) => void) => {
    cb(false)
    return () => {}
  }),
  toggleRandomDrawAudio: vi.fn(),
}))
vi.mock('../../services/random-runtime', () => ({
  publishRandomRuntime: vi.fn(),
}))
vi.mock('../../services/random-draw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/random-draw')>()
  let onFinishPending: ((winner: string) => void) | null = null
  let onTickPending: ((candidate: string) => void) | null = null
  return {
    ...actual,
    runDrawAnimation: vi.fn(
      (
        _pool: readonly string[],
        _speed: string,
        callbacks: { onTick: (c: string) => void; onFinish: (w: string) => void },
      ) => {
        onTickPending = callbacks.onTick
        onFinishPending = callbacks.onFinish
        return () => {
          onTickPending = null
          onFinishPending = null
        }
      },
    ),
    // @ts-expect-error helpers de teste
    __flushDraw: (winner = '__flush__') => {
      onFinishPending?.(winner)
    },
    // @ts-expect-error helpers de teste
    __fireTick: (candidate: string) => {
      onTickPending?.(candidate)
    },
  }
})

import { useRandomFeature } from '../useRandom'
import { useRandomStore } from '../../stores/useRandomStore'
// @ts-expect-error helpers de teste
import { __flushDraw } from '../../services/random-draw'

describe('useRandom (composable)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hidrata o store e expõe estado computado', () => {
    const store = useRandomStore()
    const hydrateSpy = vi.spyOn(store, 'hydrate')
    const feature = useRandomFeature()

    expect(hydrateSpy).toHaveBeenCalledOnce()
    expect(feature.config.value).toBe(store.config)
    expect(feature.session.value).toBe(store.session)
    expect(feature.runtime.value).toBe(store.runtime)
    expect(feature.isDrawing.value).toBe(store.runtime.isDrawing)
    expect(feature.currentDisplay.value).toBe(store.runtime.currentDisplay)
    expect(feature.mode.value).toBe(store.session.mode)
  })

  it('acoes delegam pro store', () => {
    const feature = useRandomFeature()
    const store = useRandomStore()

    feature.setMode('numbers')
    expect(store.session.mode).toBe('numbers')

    feature.addName('Ana')
    expect(store.available).toContain('Ana')

    feature.setNumberMin(1)
    feature.setNumberMax(5)
    feature.generateNumberRange()
    expect(store.available.length).toBe(5)

    feature.startDraw()
    expect(store.runtime.isDrawing).toBe(true)
  })

  it('computeds derivados (undrawn/canDraw/drawnReversed/audioPlaying)', () => {
    const feature = useRandomFeature()
    const store = useRandomStore()

    // default é numbers 1..100 → canDraw true já no início
    expect(feature.canDraw.value).toBe(true)
    feature.setMode('names')
    feature.addName('Bia')
    expect(feature.mode.value).toBe('names')
    expect(feature.canDraw.value).toBe(true)
    expect(feature.undrawn.value).toEqual(['Bia'])

    feature.startDraw()
    __flushDraw() // mock finaliza com winner '__flush__'
    expect(feature.isDrawing.value).toBe(false)
    expect(feature.drawn.value).toEqual(['__flush__'])
    expect(feature.drawnReversed.value).toEqual(['__flush__'])
    expect(feature.audioPlaying.value).toBe(false)
  })
})
