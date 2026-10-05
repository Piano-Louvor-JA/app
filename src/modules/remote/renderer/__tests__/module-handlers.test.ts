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

  describe('clock, media, palco e readField aninhado', () => {
    function makeClock() {
      return {
        isProjecting: ref(false),
        config: ref({ style: 'digital', showSeconds: true, format24h: true }),
        setStyle: vi.fn(),
        setShowSeconds: vi.fn(),
        setFormat24h: vi.fn(),
        toggleProjection: vi.fn(),
      }
    }
    function makeMedia() {
      return {
        isProjecting: ref(false),
        session: ref(null),
        searchMusic: vi.fn(async () => [{ id: 1, name: 'Hino' }]),
        openMusicPlayer: vi.fn(async () => ({ ok: true })),
      }
    }
    function makePalco(): NonNullable<ModuleHandlerDeps['palco']> {
      return {
        status: vi.fn(async () => ({ running: true, clients: 1, url: 'http://x', wsUrl: 'ws://x' })),
        slots: vi.fn(async () => [{ id: 's1', label: 'TV', running: true, clients: 0, httpPort: 8080, wsPort: 8081 }]),
        createSlot: vi.fn(async () => ({ id: 's2', label: 'Nova', httpPort: 1, wsPort: 2 })),
        removeSlot: vi.fn(async () => true),
        startSlot: vi.fn(async () => true),
        stopSlot: vi.fn(async () => {}),
        turnOn: vi.fn(async () => true),
        turnOff: vi.fn(async () => {}),
        project: vi.fn(),
        idle: vi.fn(),
      }
    }

    it('clock.setConfig com style/seconds/24h válidos', async () => {
      const clock = makeClock()
      const h = createModuleHandlers({ clock: clock as never })
      expect(await h.execute('clock', 'clock.setConfig', { style: 'digital', showSeconds: false, format24h: false })).toBe(true)
      expect(clock.setStyle).toHaveBeenCalledWith('digital')
      expect(clock.setShowSeconds).toHaveBeenCalledWith(false)
      expect(clock.setFormat24h).toHaveBeenCalledWith(false)
    })

    it('clock.setConfig com style inválido: false', async () => {
      const h = createModuleHandlers({ clock: makeClock() as never })
      expect(await h.execute('clock', 'clock.setConfig', { style: 'zzz' })).toBe(false)
    })

    it('clock.setConfig sem campos: applied false', async () => {
      const h = createModuleHandlers({ clock: makeClock() as never })
      expect(await h.execute('clock', 'clock.setConfig', {})).toBe(false)
    })

    it('clock.setConfig setShowSeconds e setFormat24h individuais aplicam (437-444)', async () => {
      const clock = makeClock()
      const h = createModuleHandlers({ clock: clock as never })
      expect(await h.execute('clock', 'clock.setConfig', { showSeconds: false })).toBe(true)
      expect(clock.setShowSeconds).toHaveBeenCalledWith(false)
      expect(await h.execute('clock', 'clock.setConfig', { format24h: false })).toBe(true)
      expect(clock.setFormat24h).toHaveBeenCalledWith(false)
    })


    it('clock.toggleProjection', async () => {
      const clock = makeClock()
      const h = createModuleHandlers({ clock: clock as never })
      expect(await h.execute('clock', 'clock.toggleProjection', {})).toBe(true)
      expect(clock.toggleProjection).toHaveBeenCalled()
    })

    it('snapshot clock e random', () => {
      const h = createModuleHandlers({ clock: makeClock() as never, random: makeRandom() as never })
      expect(h.snapshot('clock')).toBeTruthy()
      expect(h.snapshot('random')).toBeTruthy()
    })

    it('media.search e media.open', async () => {
      const media = makeMedia()
      const h = createModuleHandlers({ media: media as never })
      expect(await h.execute('media', 'media.search', { query: 'santo' })).toBe(true)
      expect(await h.execute('media', 'media.search', { query: 123 })).toBe(false)
      expect(await h.execute('media', 'media.open', { musicId: 1 })).toBe(true)
      expect(await h.execute('media', 'media.open', { musicId: 0 })).toBe(false)
    })

    it('media.open albumId inválido: false (408-409); válido: true', async () => {
      const media = makeMedia()
      const h = createModuleHandlers({ media: media as never })
      expect(await h.execute('media', 'media.open', { musicId: 1, albumId: 'abc' })).toBe(false)
      expect(await h.execute('media', 'media.open', { musicId: 1, albumId: 5 })).toBe(true)
    })


    it('palco: on/off/status/slots/create/remove/start/stop/project/idle', async () => {
      const palco = makePalco()
      const h = createModuleHandlers({ palco })
      expect(await h.execute('palco', 'palco.on', {})).toBe(true)
      expect(await h.execute('palco', 'palco.off', {})).toBe(true)
      const st = await h.execute('palco', 'palco.status', {})
      expect((st as any).ok).toBe(true)
      const sl = await h.execute('palco', 'palco.slots', {})
      expect((sl as any).data).toHaveLength(1)
      expect(await h.execute('palco', 'palco.slot-add', { label: 'Nova TV' })).toBeTruthy()
      // label vazio cai no default 'TV' — cria mesmo assim
      expect(await h.execute('palco', 'palco.slot-add', { label: '  ' }).then(r => (r as any).ok)).toBe(true)
      expect(await h.execute('palco', 'palco.slot-remove', { slotId: 's1' })).toBeTruthy()
      expect(await h.execute('palco', 'palco.slot-remove', { slotId: '0' })).toBe(false)
      expect(await h.execute('palco', 'palco.slot-start', { slotId: 's1' })).toBe(true)
      expect(await h.execute('palco', 'palco.slot-start', { slotId: '' })).toBe(false)
      expect(await h.execute('palco', 'palco.slot-stop', { slotId: 's1' })).toBeTruthy()
      expect(await h.execute('palco', 'palco.project', { text: 'Olá', scope: 'hymns' })).toBe(true)
      expect(await h.execute('palco', 'palco.project', { text: '' })).toBe(false)
      expect(await h.execute('palco', 'palco.idle', {})).toBe(true)
      expect(await h.execute('palco', 'palco.nope', {})).toBe(false)
    })

    it('snapshot palco: available true', () => {
      const h = createModuleHandlers({ palco: makePalco() })
      expect(h.snapshot('palco')).toEqual({ available: true })
    })

    it('readField aninhado: store com runtime.value aninhado', async () => {
      // bible com books já desembrulhado e verses como objeto
      const bible = makeBible()
      ;(bible as any).verses = { '2': { n: 2 } }
      const h = createModuleHandlers({ bible: bible as never })
      expect(await h.execute('bible', 'bible.open', { bookId: 1, chapter: 2, verse: 2, versionId: 1 })).toBe(true)
      expect(bible.selectVersion).toHaveBeenCalledWith(1)
    })

    it('readField com refs aninhadas (outer.value.inner.value)', async () => {
      // timer com runtime já desembrulhado — cobre caminho mid==object sem value
      const timer = makeTimer()
      ;(timer as any).runtime = { status: 'running', accumulatedMs: 5, savedTimesMs: [1, 2] }
      const h = createModuleHandlers({ timer: timer as never })
      const snap = h.snapshot('timer')
      expect(snap).toBeTruthy()
    })

    it('snapshot de namespace sem deps: null', () => {
      const h = createModuleHandlers({})
      expect(h.snapshot('bible')).toBeNull()
      expect(h.snapshot('palco')).toBeNull()
    })
  })
  describe('readField/readPath: caminhos nulos e refs', () => {
    it('execute bible com store null: retorna false sem lançar', async () => {
      const h = createModuleHandlers({ bible: null as never })
      const res = await h.execute('bible', 'bible.open', { bookId: 1, chapter: 1, verse: 1, versionId: 1 })
      expect(res).toBe(false)
    })

    it('snapshot timer com runtime null (mid null do readPath)', () => {
      const timer = makeTimer()
      ;(timer as any).runtime = null
      const h = createModuleHandlers({ timer: timer as never })
      expect(h.snapshot('timer')).toBeTruthy()
    })

    it('readField: raw com .value (Ref) é desembrulhado no snapshot', () => {
      const timer = makeTimer()
      ;(timer as any).runtime = { status: { value: 'paused' }, accumulatedMs: { value: 9 } }
      const h = createModuleHandlers({ timer: timer as never })
      expect(h.snapshot('timer')).toBeTruthy()
    })
  })

  it('gaps onda1: readField/readPath guards, waitForVerse timeout, switches caem no default', async () => {
    // readField/readPath guards (166/178/181) via snapshot com stores tortos
    deps.bible = { books: null, versions: undefined, runtime: 'texto-plano' } as never
    expect(handlers.snapshot('bible')).toBeTruthy()
    deps.timer = { runtime: null } as never
    expect(handlers.snapshot('timer')).toBeTruthy()
    // readPath: mid não-objeto → undefined; raw não-objeto → raw
    deps.countdown = { runtime: 42 } as never
    expect(handlers.snapshot('countdown')).toBeTruthy()
    deps = { bible: makeBible() as never, timer: makeTimer() as never, countdown: makeCountdown() as never, random: makeRandom() as never }
    handlers = createModuleHandlers(deps)
  })

  it('gaps onda1: bible.open sem versículo carregado → false (timeout)', async () => {
    vi.useFakeTimers()
    const bible = makeBible()
    bible.verses = ref({}) // nunca carrega
    deps.bible = bible as never
    handlers = createModuleHandlers(deps)
    const p = handlers.execute('bible', 'bible.open', { bookId: 1, chapter: 1, verse: 2 })
    const outcome = await Promise.race([p.then((v) => ({ done: true, v })), vi.waitFor(() => { throw new Error('tick') }).catch(() => ({ done: false }))])
    // avança os 50×100ms do polling
    for (let i = 0; i < 60; i++) await vi.advanceTimersByTimeAsync(100)
    const res = await p
    expect(res).toBe(false)
    expect(bible.selectVerse).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('gaps onda1: timer/countdown/random start já projetando não re-toggle; toggles com toggleProjection ausente', async () => {
    deps.timer = { ...makeTimer(), isProjecting: ref(true) } as never
    handlers = createModuleHandlers(deps)
    await handlers.execute('timer', 'timer.start', {})
    expect((deps.timer as { toggleProjection: ReturnType<typeof vi.fn> }).toggleProjection).not.toHaveBeenCalled()
    deps.countdown = { ...makeCountdown(), isProjecting: ref(true) } as never
    handlers = createModuleHandlers(deps)
    await handlers.execute('countdown', 'countdown.start', {})
    expect((deps.countdown as { toggleProjection: ReturnType<typeof vi.fn> }).toggleProjection).not.toHaveBeenCalled()
    // toggleProjection ausente: if短路 sem lançar
    const { toggleProjection: _omit, ...timerSemToggle } = makeTimer()
    deps.timer = timerSemToggle as never
    handlers = createModuleHandlers(deps)
    await expect(handlers.execute('timer', 'timer.start', {})).resolves.toBe(true)
    const { toggleProjection: _omit2, ...countdownSemToggle } = makeCountdown()
    deps.countdown = countdownSemToggle as never
    handlers = createModuleHandlers(deps)
    await expect(handlers.execute('countdown', 'countdown.start', {})).resolves.toBe(true)
    const { toggleProjection: _omit3, ...randomSemToggle } = makeRandom()
    deps.random = randomSemToggle as never
    handlers = createModuleHandlers(deps)
    await expect(handlers.execute('random', 'random.startDraw', {})).resolves.toBe(true)
  })

  it('gaps onda1: media.open mode/albumId inválidos; clock showSeconds/format24h não-boolean; default switch; palco slots sem id e project com texto', async () => {
    const media = { searchMusic: vi.fn(async () => []), openMusicPlayer: vi.fn(async () => ({ ok: true })) }
    deps.media = media as never
    await expect(handlers.execute('media', 'media.open', { musicId: 1, mode: 42 })).resolves.toBe(false)
    await expect(handlers.execute('media', 'media.open', { musicId: 1, mode: 'naoexiste' })).resolves.toBe(false)
    await expect(handlers.execute('media', 'media.open', { musicId: 1, mode: 'lyrics', albumId: 'x' })).resolves.toBe(false)
    await expect(handlers.execute('media', 'media.outra', {})).resolves.toBe(false)
    await expect(handlers.execute('clock', 'clock.outra', {})).resolves.toBe(false)
    deps.clock = { config: { style: 'analog' } } as never
    handlers = createModuleHandlers(deps)
    const clk2 = handlers.snapshot('clock') as Record<string, unknown>
    expect(clk2.style).toBe('analog')
    await expect(handlers.execute('clock', 'clock.setConfig', { showSeconds: 'sim' })).resolves.toBe(false)
    await expect(handlers.execute('clock', 'clock.setConfig', { format24h: 1 })).resolves.toBe(false)
    await expect(handlers.execute('random', 'random.outra', {})).resolves.toBe(false)
    await expect(handlers.execute('timer', 'timer.outra', {})).resolves.toBe(false)
    await expect(handlers.execute('countdown', 'countdown.outra', {})).resolves.toBe(false)
    await expect(handlers.execute('bible', 'bible.outra', {})).resolves.toBe(false)
    // palco: slot-remove com id '0'; slot-stop/slot-start sem id; project sem texto; footerRef
    deps.palco = {
      available: ref(true), slots: ref([]), status: vi.fn(async () => ({})),
      createSlot: vi.fn(async () => null), removeSlot: vi.fn(async () => {}),
      startSlot: vi.fn(async () => ({ ok: true, data: null })), stopSlot: vi.fn(async () => {}),
      project: vi.fn(), idle: vi.fn(),
    } as never
    handlers = createModuleHandlers(deps)
    await expect(handlers.execute('palco', 'palco.slot-remove', { slotId: '0' })).resolves.toBe(false)
    await expect(handlers.execute('palco', 'palco.slot-stop', {})).resolves.toBe(false)
    await expect(handlers.execute('palco', 'palco.slot-start', {})).resolves.toBe(false)
    await expect(handlers.execute('palco', 'palco.project', { text: '' })).resolves.toBe(false)
    await expect(handlers.execute('palco', 'palco.slot-remove', { slotId: 42 })).resolves.toBe(false)
    await expect(handlers.execute('palco', 'palco.project', { text: 'T', scope: 42 })).resolves.toBe(true)
    await expect(handlers.execute('palco', 'palco.project', { text: 'T', scope: 'hymns', footerRef: 'f1' })).resolves.toBe(true)
  })

  it('gaps onda1: bible.gotoChapter fallbacks; importNames added undefined; execute lança → catch false', async () => {
    ;(deps.bible as any).verses = { '1': { n: 1 } }
    await expect(handlers.execute('bible', 'bible.open', { bookId: 1, chapter: 1, verse: 1 })).resolves.toBe(true)
    deps.random = { ...makeRandom(), importNamesFromText: vi.fn(() => undefined) } as never
    handlers = createModuleHandlers(deps)
    await expect(handlers.execute('random', 'random.importNames', { namesText: 'A,B' })).resolves.toBe(false)
    // execute com deps.que lança (bible.openProjection throw) → catch → false
    deps.bible = { ...makeBible(), openProjection: vi.fn(async () => { throw new Error('boom') }) } as never
    handlers = createModuleHandlers(deps)
    await expect(handlers.execute('bible', 'bible.open', { bookId: 1, chapter: 1, verse: 1 })).resolves.toBe(false)
  })

  it('gaps onda1 2: readPath guards tortos, clock/random snapshots defaults, random.removeAvailable inválido, palco createSlot null e snapshot media/clock', async () => {
    // snapshot com stores tortos: readField tolera campos ausentes
    deps.timer = { runtime: null } as never
    deps.countdown = { runtime: 'plano' } as never
    deps.clock = { config: undefined, isProjecting: ref(true) } as never
    deps.random = { mode: 'names', isProjecting: false, currentDisplay: '', drawnList: null } as never
    handlers = createModuleHandlers(deps)
    expect(handlers.snapshot('timer')).toBeTruthy()
    expect(handlers.snapshot('countdown')).toBeTruthy()
    const clk = handlers.snapshot('clock') as Record<string, unknown>
    expect(clk.style).toBe('digital')
    const rnd = handlers.snapshot('random') as Record<string, unknown>
    expect(rnd).toBeTruthy()
    // media snapshot (searchMusic presente)
    deps.media = { searchMusic: vi.fn(async () => []), openMusicPlayer: vi.fn(async () => ({ ok: true })) } as never
    handlers = createModuleHandlers(deps)
    const mediaSnap = handlers.snapshot('media') as { query: unknown; searchResults: unknown[] }
    expect(typeof mediaSnap.query).toBe('string')
    expect(Array.isArray(mediaSnap.searchResults)).toBe(true)
    // random.removeAvailable index inválido (506) e generateNumberRange (514/515)
    deps.random = makeRandom() as never
    handlers = createModuleHandlers(deps)
    await expect(handlers.execute('random', 'random.removeAvailable', { index: -1 })).resolves.toBe(false)
    await expect(handlers.execute('random', 'random.generateNumberRange', {})).resolves.toBe(true)
    // bible.open com chapter/verse AUSENTES → fallbacks 1 (206/213 arm1)
    ;(deps.bible as any).verses = { '1': { n: 1 } }
    await expect(handlers.execute('bible', 'bible.open', { bookId: 1 })).resolves.toBe(true)
    // palco.project sem text (589 arm1); bible sem books (189 arm1)
    await expect(handlers.execute('palco', 'palco.project', {})).resolves.toBe(false)
    deps.bible = { ...makeBible(), books: undefined } as never
    handlers = createModuleHandlers(deps)
    ;(deps.bible as any).verses = { '1': { n: 1 } }
    await expect(handlers.execute('bible', 'bible.open', { bookId: 1, chapter: 1, verse: 1 })).resolves.toBe(false)
    // palco createSlot null (580 arm1) e slot-add default label (578 cond)
    deps.palco = {
      available: ref(true), slots: ref([]), status: vi.fn(async () => ({})),
      createSlot: vi.fn(async () => null), removeSlot: vi.fn(async () => {}),
      startSlot: vi.fn(async () => ({ ok: true, data: null })), stopSlot: vi.fn(async () => {}),
      project: vi.fn(), idle: vi.fn(),
    } as never
    handlers = createModuleHandlers(deps)
    const addRes = await handlers.execute('palco', 'palco.slot-add', {}) as { ok: boolean }
    expect(addRes).toEqual({ ok: false, data: null })
  })

})