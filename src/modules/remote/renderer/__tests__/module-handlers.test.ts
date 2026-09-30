// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// mocks de imports de módulo usados pelos handlers
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))

import { createModuleHandlers, type ModuleHandlerDeps } from '../module-handlers'

function ref<T>(v: T) {
  return { value: v }
}

function makeBible() {
  return {
    selectedBookId: ref<number | null>(1),
    selectedChapter: ref(1),
    selectedVerses: ref<number[]>([1]),
    isProjecting: ref(false),
    versions: ref([{ id: 1, abbreviation: 'ARC' }]),
    books: ref([{ id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50, bookNumber: 1 }]),
    selectedVersionId: ref<number | null>(1),
    selectVersion: vi.fn(),
    selectBook: vi.fn(async () => {}),
    selectChapter: vi.fn(async () => {}),
    selectVerse: vi.fn(),
    clearSelection: vi.fn(),
    openProjection: vi.fn(async () => true),
    clearProjectionWindow: vi.fn(),
  }
}

function makeTimer() {
  return {
    isProjecting: ref(false),
    runtime: ref({ status: 'idle', accumulatedMs: 0, savedTimesMs: [] }),
    start: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    saveMark: vi.fn(),
    removeSavedMark: vi.fn(),
    clearSavedMarks: vi.fn(),
    toggleProjection: vi.fn(),
  }
}

function makeCountdown() {
  return {
    isProjecting: ref(false),
    runtime: ref({ status: 'idle', accumulatedMs: 0, durationMs: 60_000, savedTimesMs: [] }),
    start: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    saveMark: vi.fn(),
    setDurationMs: vi.fn(),
    toggleProjection: vi.fn(),
  }
}

function makeRandom() {
  return {
    isProjecting: ref(false),
    currentDisplay: ref(''),
    mode: ref('names'),
    setNumberMin: vi.fn(),
    setNumberMax: vi.fn(),
    generateNumberRange: vi.fn(() => true),
    importNamesFromText: vi.fn(() => 3),
    removeDrawn: vi.fn(),
    setMode: vi.fn(),
    addName: vi.fn(),
    removeAvailable: vi.fn(),
    clearAvailable: vi.fn(),
    startDraw: vi.fn(),
    toggleProjection: vi.fn(),
    cancelDrawAnimation: vi.fn(),
    clearHistory: vi.fn(),
    resetAll: vi.fn(),
  }
}

describe('createModuleHandlers — execute por namespace', () => {
  let deps: ModuleHandlerDeps
  let handlers: ReturnType<typeof createModuleHandlers>

  beforeEach(() => {
    deps = {
      bible: makeBible() as never,
      timer: makeTimer() as never,
      countdown: makeCountdown() as never,
      random: makeRandom() as never,
    }
    handlers = createModuleHandlers(deps)
  })

  // ===== bible =====
  it('bible.gotoChapter válido: seleciona livro/capítulo/verso e projeta', async () => {
    // aguardar verse aparecer — simulamos verses já no store via readField
    ;(deps.bible as any).verses = { '1': { n: 1 } }
    const ok = await handlers.execute('bible', 'bible.open', { bookId: 1, chapter: 3, verse: 1 })
    expect(ok).toBe(true)
  })

  it('bible.gotoChapter bookId inválido: false', async () => {
    expect(await handlers.execute('bible', 'bible.open', { bookId: 'x' })).toBe(false)
  })

  it('bible.gotoChapter livro inexistente: false', async () => {
    expect(await handlers.execute('bible', 'bible.open', { bookId: 999, chapter: 1 })).toBe(false)
  })

  it('bible.gotoChapter chapter fora da faixa: false', async () => {
    expect(await handlers.execute('bible', 'bible.open', { bookId: 1, chapter: 999 })).toBe(false)
  })

  it('bible.selectVerse válido e inválido', async () => {
    expect(await handlers.execute('bible', 'bible.selectVerse', { verse: 2 })).toBe(true)
    expect(await handlers.execute('bible', 'bible.selectVerse', { verse: 0 })).toBe(false)
  })

  it('bible.clearSelection e clearProjection', async () => {
    expect(await handlers.execute('bible', 'bible.clearSelection', {})).toBe(true)
    expect(await handlers.execute('bible', 'bible.close', {})).toBe(true)
  })

  it('bible action desconhecida: false', async () => {
    expect(await handlers.execute('bible', 'bible.nope', {})).toBe(false)
  })

  // ===== timer =====
  it('timer start/pause/reset/saveMark/removeMark/clearMarks/toggleProjection', async () => {
    expect(await handlers.execute('timer', 'timer.start', {})).toBe(true)
    expect(await handlers.execute('timer', 'timer.pause', {})).toBe(true)
    expect(await handlers.execute('timer', 'timer.reset', {})).toBe(true)
    expect(await handlers.execute('timer', 'timer.saveMark', {})).toBe(true)
    expect(await handlers.execute('timer', 'timer.removeMark', { index: 0 })).toBe(true)
    expect(await handlers.execute('timer', 'timer.removeMark', { index: -1 })).toBe(false)
    expect(await handlers.execute('timer', 'timer.clearMarks', {})).toBe(true)
    expect(await handlers.execute('timer', 'timer.toggleProjection', {})).toBe(true)
  })

  it('timer action desconhecida: false', async () => {
    expect(await handlers.execute('timer', 'timer.nope', {})).toBe(false)
  })

  // ===== countdown =====
  it('countdown ações principais + setDuration', async () => {
    expect(await handlers.execute('countdown', 'countdown.start', {})).toBe(true)
    expect(await handlers.execute('countdown', 'countdown.pause', {})).toBe(true)
    expect(await handlers.execute('countdown', 'countdown.reset', {})).toBe(true)
    expect(await handlers.execute('countdown', 'countdown.saveMark', {})).toBe(true)
    expect(await handlers.execute('countdown', 'countdown.setDuration', { durationMs: 90_000 })).toBe(true)
    expect(await handlers.execute('countdown', 'countdown.setDuration', { durationMs: -1 })).toBe(false)
    expect(await handlers.execute('countdown', 'countdown.toggleProjection', {})).toBe(true)
    expect(await handlers.execute('countdown', 'countdown.nope', {})).toBe(false)
  })

  // ===== random =====
  it('random: números, nomes, mode, draw, history, reset', async () => {
    expect(await handlers.execute('random', 'random.setNumberRange', { numberMin: 1, numberMax: 10 })).toBe(true)
    expect(await handlers.execute('random', 'random.setNumberRange', { numberMin: 'x', numberMax: 10 })).toBe(false)
    expect(await handlers.execute('random', 'random.importNames', { namesText: 'Ana\nBia' })).toBe(true)
    expect(await handlers.execute('random', 'random.importNames', { namesText: '  ' })).toBe(false)
    expect(await handlers.execute('random', 'random.removeDrawn', { index: 0 })).toBe(true)
    expect(await handlers.execute('random', 'random.removeDrawn', { index: 'x' })).toBe(false)
    expect(await handlers.execute('random', 'random.setMode', { mode: 'numbers' })).toBe(true)
    expect(await handlers.execute('random', 'random.setMode', { mode: 'zzz' })).toBe(false)
    expect(await handlers.execute('random', 'random.addName', { name: 'Carla' })).toBe(true)
    expect(await handlers.execute('random', 'random.addName', { name: '' })).toBe(false)
    expect(await handlers.execute('random', 'random.removeAvailable', { index: 1 })).toBe(true)
    expect(await handlers.execute('random', 'random.clearAvailable', {})).toBe(true)
    expect(await handlers.execute('random', 'random.startDraw', {})).toBe(true)
    expect(await handlers.execute('random', 'random.toggleProjection', {})).toBe(true)
    expect(await handlers.execute('random', 'random.cancelDraw', {})).toBe(true)
    expect(await handlers.execute('random', 'random.clearHistory', {})).toBe(true)
    expect(await handlers.execute('random', 'random.resetAll', {})).toBe(true)
    expect(await handlers.execute('random', 'timer.nope', {})).toBe(false)
  })

  // ===== namespace ausente =====
  it('namespace sem deps: false', async () => {
    expect(await handlers.execute('clock', 'set', {})).toBe(false)
  })

  // ===== snapshots =====
  it('snapshot bible: books/versions serializados', () => {
    const snap = handlers.snapshot('bible')
    expect(snap).toBeTruthy()
    expect((snap as any).books).toHaveLength(1)
    expect((snap as any).versions).toEqual([{ id: 1, abbreviation: 'ARC' }])
  })

  it('snapshot timer/countdown', () => {
    expect(handlers.snapshot('timer')).toBeTruthy()
    expect(handlers.snapshot('countdown')).toBeTruthy()
  })
})
