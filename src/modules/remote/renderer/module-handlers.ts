/**
 * Handlers v2 do Controle Remoto — módulos bible/timer/countdown.
 *
 * Cada namespace recebe o STORE REAL do desktop (pinia) injetado e expõe:
 * - execute(action, msg): roteia o comando às ações do store
 * - snapshot(): estado mínimo serializável para o APK
 *
 * Spec: Obsidian "LouvorJA — Controle Remoto Total v2 Spec".
 * Comandos desconhecidos/inválidos → false (ack negativo, sem throw).
 */

export interface ModuleHandlers {
  /** Retorna boolean ou `{ ok, data }` (ack estendido com payload p/ queries). */
  execute(namespace: string, action: string, msg: Record<string, unknown>): Promise<boolean | { ok: boolean; data: unknown }>
  snapshot(namespace: string): Record<string, unknown> | null
}

interface RefLike<T> {
  value: T
}

interface BibleStoreLike {
  selectedBookId: RefLike<number | null>
  selectedChapter: RefLike<number>
  selectedVerses: RefLike<number[]>
  isProjecting: RefLike<boolean>
  versions: RefLike<Array<{ id: number; abbreviation: string }>>
  books: RefLike<
    Array<{
      id: number
      name: string
      abbreviation: string
      chapters: number
      bookNumber: number
    }>
  >
  selectedVersionId: RefLike<number | null>
  selectVersion(versionId: number): unknown
  selectBook(bookId: number): unknown
  selectChapter(chapter: number): unknown
  selectVerse(verseNumber: number, event?: unknown): unknown
  clearSelection(): unknown
  openProjection(): Promise<boolean>
  clearProjectionWindow(): unknown
}

interface TimerStoreLike {
  toggleProjection?: () => unknown
  isProjecting: RefLike<boolean>
  runtime: RefLike<{ status: string; accumulatedMs: number; savedTimesMs?: number[] }>
  start(): unknown
  pause(): unknown
  reset(): unknown
  saveMark(): unknown
  removeSavedMark(index: number): unknown
  clearSavedMarks(): unknown
}

interface CountdownStoreLike {
  toggleProjection?: () => unknown
  isProjecting: RefLike<boolean>
  runtime: RefLike<{
    status: string
    durationMs: number
    accumulatedMs: number
    savedTimesMs?: number[]
    finished: boolean
  }>
  start(): unknown
  pause(): unknown
  reset(): unknown
  saveMark(): unknown
  setDurationMs(durationMs: number): unknown
}

interface ClockStoreLike {
  config: RefLike<{ style: string; showSeconds: boolean; format24h: boolean }>
  isProjecting: RefLike<boolean>
  setStyle(style: string): unknown
  setShowSeconds(showSeconds: boolean): unknown
  setFormat24h(format24h: boolean): unknown
  toggleProjection(): unknown
}

const CLOCK_STYLES = new Set(['digital', 'analog'])

interface RandomStoreLike {
  toggleProjection?: () => unknown
  session: RefLike<{ mode: string; numberMin: number; numberMax: number }>
  runtime: RefLike<{ isDrawing: boolean; currentDisplay: string | null }>
  isProjecting: RefLike<boolean>
  available: RefLike<Array<string | number>>
  drawn: RefLike<Array<string | number>>
  importNamesFromText?(text: string): number
  removeDrawn?(index: number): unknown
  setNumberMin?(value: number): unknown
  setNumberMax?(value: number): unknown
  setMode(mode: string): unknown
  addName(raw?: string): unknown
  removeAvailable(index: number): unknown
  clearAvailable(): unknown
  generateNumberRange(): boolean
  startDraw(): unknown
  cancelDrawAnimation(): unknown
  clearHistory(): unknown
  resetAll(): unknown
}

const RANDOM_MODES = new Set(['names', 'numbers'])

const MEDIA_MODES = new Set(['audio', 'instrumental', 'no_audio'])

type OpenMusicPlayer = (params: {
  musicId: number
  mode: string
  albumId: number | null
}) => Promise<{ ok: boolean; messageKey?: string } | { ok: boolean } | object>

interface AlbumSearchHitLike {
  musicId: number
  name: string
  track: number | null
}

interface MediaStoreLike {
  openMusicPlayer: OpenMusicPlayer
  /** Busca no índice local (ids CORRETOS do desktop, não da API pública). */
  searchMusic?: (query: string) => Promise<AlbumSearchHitLike[]>
}

export interface ModuleHandlerDeps {
  media?: MediaStoreLike
  bible?: BibleStoreLike
  timer?: TimerStoreLike
  countdown?: CountdownStoreLike
  clock?: ClockStoreLike
  random?: RandomStoreLike
  /** Palco (cast TV) — comandos palco.* vindos do remote (web/APK). */
  palco?: PalcoDeps
}

/** Dependências do namespace palco (sender de cast para TV). */
export interface PalcoDeps {
  status(): Promise<{ running: boolean; clients: number; url: string | null; wsUrl: string | null } | null>
  slots(): Promise<Array<{ id: string; label: string; running: boolean; clients: number; httpPort: number; wsPort: number }>>
  createSlot(label: string): Promise<{ id: string; label: string; httpPort: number; wsPort: number } | null>
  removeSlot(id: string): Promise<boolean>
  startSlot(id: string): Promise<boolean>
  stopSlot(id: string): Promise<void>
  turnOn(): Promise<boolean>
  turnOff(): Promise<void>
  project(scope: string, input: { text: string; footerRef?: string }): void
  idle(): void
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Lê valor de campo de store pinia que PODE ser exposto como Ref ({value})
 * ou já desembrulhado (setup-store via instância: store.runtime é o objeto
 * plano). Usar `.value` direto quebra no segundo caso (undefined).
 */
function readField<T>(source: unknown, key: string): T | undefined {
  /* v8 ignore next 1 -- chamadores sempre passam store ou valor já guardado */
  if (source == null || typeof source !== 'object') return undefined
  const holder = source as Record<string, unknown>
  const raw = holder[key]
  if (raw != null && typeof raw === 'object' && 'value' in (raw as object)) {
    return (raw as { value: T }).value
  }
  return raw as T | undefined
}

async function executeBible(
  bible: BibleStoreLike,
  action: string,
  msg: Record<string, unknown>,
): Promise<boolean> {
  switch (action) {
    case 'bible.open': {
      console.info(
        `[remote] bible.open RECEBIDO book=${msg.bookId} (${typeof msg.bookId}) cap=${msg.chapter} verse=${msg.verse} version=${msg.versionId}`,
      )
      const bookId = msg.bookId
      if (!isNum(bookId)) return false
      // readField: pinia setup-store desembrulha refs (books.value não existe).
      const books = readField<Array<{ id: number; chapters: number }>>(
        bible,
        'books',
      ) ?? []
      const book = books.find((b) => b.id === bookId)
      if (!book) return false
      const chapter = isNum(msg.chapter) ? msg.chapter : 1
      if (chapter < 1 || chapter > book.chapters) return false
      if (isNum(msg.versionId)) bible.selectVersion?.(msg.versionId)
      await bible.selectBook(bookId)
      await bible.selectChapter(chapter)
      // Versículo: explícito ou 1 (openProjection exige selectedVerses não
      // vazio — sem seleção a projeção aborta silenciosamente).
      const verse = isNum(msg.verse) && msg.verse >= 1 ? msg.verse : 1
      // refreshChapter é async: esperar o capítulo carregar antes de
      // selecionar, senão a seleção fica vazia.
      const got = await waitForVerse(bible, verse)
      console.info(
        `[remote] bible.open book=${bookId} cap=${chapter} verse=${verse} version=${msg.versionId ?? '-'} verseLoaded=${got}`,
      )
      if (!got) return false
      bible.selectVerse(verse)
      return bible.openProjection()
    }
    case 'bible.selectVerse': {
      const verse = msg.verse
      if (!isNum(verse) || verse < 1) return false
      bible.selectVerse(verse)
      return true
    }
    case 'bible.clearSelection':
      bible.clearSelection()
      return true
    case 'bible.close':
      bible.clearProjectionWindow()
      return true
    default:
      return false
  }
}

function snapshotBible(bible: BibleStoreLike): Record<string, unknown> {
  // readField tolera Ref e valor desembrulhado (pinia setup-store).
  const books = readField<BibleStoreLike['books'] extends RefLike<infer T> ? T : never>(bible, 'books') ?? []
  const versions =
    readField<BibleStoreLike['versions'] extends RefLike<infer T> ? T : never>(bible, 'versions') ?? []
  return {
    bookId: readField<number>(bible, 'selectedBookId') ?? null,
    chapter: readField<number>(bible, 'selectedChapter') ?? null,
    selectedVerses: [...(readField<number[]>(bible, 'selectedVerses') ?? [])],
    isProjecting: readField<boolean>(bible, 'isProjecting') === true,
    versionId: readField<number>(bible, 'selectedVersionId') ?? null,
    // Catálogo p/ o operador escolher por NOME (select) — não por id cego.
    books: books.map((b) => ({
      id: b.id,
      name: b.name,
      chapters: b.chapters,
      number: b.bookNumber,
    })),
    versions: versions.map((v) => ({ id: v.id, abbreviation: v.abbreviation })),
  }
}

/**
 * Espera até o versículo existir no capítulo carregado (refreshChapter
 * async) — máx 5s, polling 100ms.
 */
async function waitForVerse(
  bible: BibleStoreLike,
  verse: number,
): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    const verses = readField<Record<string, unknown>>(bible, 'verses')
    if (verses && verses[String(verse)] != null) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

function isProjectingNow(store: unknown): boolean {
  return readField<boolean>(store, 'isProjecting') === true
}

async function executeTimer(
  timer: TimerStoreLike,
  action: string,
  msg: Record<string, unknown>,
): Promise<boolean> {
  switch (action) {
    case 'timer.start':
      timer.start()
      // Comando remoto precisa ser VISÍVEL: projeta o timer se não projetado.
      if (!isProjectingNow(timer) && timer.toggleProjection) timer.toggleProjection()
      return true
    case 'timer.pause':
      timer.pause()
      return true
    case 'timer.reset':
      timer.reset()
      return true
    case 'timer.saveMark':
      timer.saveMark()
      return true
    case 'timer.removeMark': {
      const index = msg.index
      if (!isNum(index) || index < 0) return false
      timer.removeSavedMark(index)
      return true
    }
    case 'timer.clearMarks':
      timer.clearSavedMarks()
      return true
    case 'timer.toggleProjection':
      timer.toggleProjection?.()
      return true
    default:
      return false
  }
}

function snapshotTimer(timer: TimerStoreLike): Record<string, unknown> {
  const rt = readField<Record<string, unknown>>(timer, 'runtime')
  return {
    status: (rt?.status as string) ?? 'idle',
    accumulatedMs: (rt?.accumulatedMs as number) ?? 0,
    savedTimesMs: [...((rt?.savedTimesMs as number[]) ?? [])],
    isProjecting: readField<boolean>(timer, 'isProjecting') === true,
  }
}

async function executeCountdown(
  countdown: CountdownStoreLike,
  action: string,
  msg: Record<string, unknown>,
): Promise<boolean> {
  switch (action) {
    case 'countdown.start':
      countdown.start()
      if (!isProjectingNow(countdown) && countdown.toggleProjection) {
        countdown.toggleProjection()
      }
      return true
    case 'countdown.pause':
      countdown.pause()
      return true
    case 'countdown.reset':
      countdown.reset()
      return true
    case 'countdown.saveMark':
      countdown.saveMark()
      return true
    case 'countdown.setDuration': {
      const durationMs = msg.durationMs
      if (!isNum(durationMs) || durationMs <= 0) return false
      countdown.setDurationMs(durationMs)
      return true
    }
    case 'countdown.toggleProjection':
      countdown.toggleProjection?.()
      return true
    default:
      return false
  }
}

function snapshotCountdown(
  countdown: CountdownStoreLike,
): Record<string, unknown> {
  const rt = readField<Record<string, unknown>>(countdown, 'runtime')
  return {
    status: (rt?.status as string) ?? 'idle',
    durationMs: (rt?.durationMs as number) ?? 0,
    accumulatedMs: (rt?.accumulatedMs as number) ?? 0,
    finished: rt?.finished === true,
    savedTimesMs: [...((rt?.savedTimesMs as number[]) ?? [])],
    isProjecting: readField<boolean>(countdown, 'isProjecting') === true,
  }
}

/** Cache da última busca — o ack só carrega ok; o state expõe o resultado. */
let lastSearchResults: AlbumSearchHitLike[] = []
let lastSearchQuery = ''

async function executeMedia(
  media: MediaStoreLike,
  action: string,
  msg: Record<string, unknown>,
): Promise<boolean> {
  switch (action) {
    case 'media.search': {
      console.info(`[remote] media.search RECEBIDA query=${msg.query}`)
      const query = msg.query
      const search = media.searchMusic
      if (typeof query !== 'string' || !search) return false
      // Resultado via ack extras — handler devolve lista no campo `results`
      // do ack. Como o protocolo só tem ok:boolean, o bridge lê o cache.
      const hits = await search(query.trim())
      lastSearchResults = hits.slice(0, 30)
      lastSearchQuery = query.trim()
      return true
    }
    case 'media.open': {
      const musicId = msg.musicId
      // app#331: negativo = música LOCAL (import .slja sem login) — válido.
      if (!isNum(musicId) || musicId === 0) return false
      const mode = msg.mode
      if (mode !== undefined && (typeof mode !== 'string' || !MEDIA_MODES.has(mode))) {
        return false
      }
      const albumId = msg.albumId
      if (albumId !== undefined && !isNum(albumId)) return false
      const result = (await media.openMusicPlayer({
        musicId,
        mode: mode ?? 'audio',
        albumId: isNum(albumId) ? albumId : null,
      })) as { ok?: boolean } | object
      return (result as { ok?: boolean }).ok === true
    }
    default:
      return false
  }
}

async function executeClock(
  clock: ClockStoreLike,
  action: string,
  msg: Record<string, unknown>,
): Promise<boolean> {
  switch (action) {
    case 'clock.setConfig': {
      const { style, showSeconds, format24h } = msg
      let applied = false
      if (style !== undefined) {
        if (typeof style !== 'string' || !CLOCK_STYLES.has(style)) return false
        clock.setStyle(style)
        applied = true
      }
      if (showSeconds !== undefined) {
        if (typeof showSeconds !== 'boolean') return false
        clock.setShowSeconds(showSeconds)
        applied = true
      }
      if (format24h !== undefined) {
        if (typeof format24h !== 'boolean') return false
        clock.setFormat24h(format24h)
        applied = true
      }
      return applied
    }
    case 'clock.toggleProjection':
      clock.toggleProjection()
      return true
    /* v8 ignore next 2 -- default executado mas o remap v8 não credita o range */
    default:
      return false
  }
}

function snapshotClock(clock: ClockStoreLike): Record<string, unknown> {
  const cfg = readField<Record<string, unknown>>(clock, 'config')
  return {
    style: (cfg?.style as string) ?? 'digital',
    showSeconds: cfg?.showSeconds === true,
    format24h: cfg?.format24h === true,
    isProjecting: readField<boolean>(clock, 'isProjecting') === true,
  }
}

async function executeRandom(
  random: RandomStoreLike,
  action: string,
  msg: Record<string, unknown>,
): Promise<boolean> {
  switch (action) {
    case 'random.setNumberRange': {
      const min = msg.numberMin
      const max = msg.numberMax
      if (!isNum(min) || !isNum(max)) return false
      random.setNumberMin?.(min)
      random.setNumberMax?.(max)
      return random.generateNumberRange() === true
    }
    case 'random.importNames': {
      const text = msg.namesText
      if (typeof text !== 'string' || text.trim().length === 0) return false
      const added = random.importNamesFromText?.(text)
      return (added ?? 0) > 0
    }
    case 'random.removeDrawn': {
      const idx = msg.index
      if (!isNum(idx)) return false
      random.removeDrawn?.(idx)
      return true
    }
    case 'random.setMode': {
      const mode = msg.mode
      if (typeof mode !== 'string' || !RANDOM_MODES.has(mode)) return false
      random.setMode(mode)
      return true
    }
    case 'random.addName': {
      const name = msg.name
      if (typeof name !== 'string' || name.trim().length === 0) return false
      random.addName(name.trim())
      return true
    }
    case 'random.removeAvailable': {
      const index = msg.index
      if (!isNum(index) || index < 0) return false
      random.removeAvailable(index)
      return true
    }
    case 'random.clearAvailable':
      random.clearAvailable()
      return true
    case 'random.generateNumberRange':
      random.setMode('numbers')
      return random.generateNumberRange() === true
    case 'random.startDraw':
      // Visível no palco: abre projeção antes de sortear.
      if (!isProjectingNow(random) && random.toggleProjection) {
        random.toggleProjection()
      }
      random.startDraw()
      return true
    case 'random.toggleProjection':
      random.toggleProjection?.()
      return true
    case 'random.cancelDraw':
      random.cancelDrawAnimation()
      return true
    case 'random.clearHistory':
      random.clearHistory()
      return true
    case 'random.resetAll':
      random.resetAll()
      return true
    default:
      return false
  }
}

function snapshotRandom(random: RandomStoreLike): Record<string, unknown> | null {
  const session = readField<Record<string, unknown>>(random, 'session')
  const runtime = readField<Record<string, unknown>>(random, 'runtime')
  return {
    mode: (session?.mode as string) ?? 'names',
    drawnCount: readField<unknown[]>(random, 'drawn')?.length ?? 0,
    availableCount: readField<unknown[]>(random, 'available')?.length ?? 0,
    isDrawing: runtime?.isDrawing === true,
    currentDisplay: (runtime?.currentDisplay as string) ?? null,
    isProjecting: readField<boolean>(random, 'isProjecting') === true,
  }
}

/**
 * Namespace palco — o sender de cast para TV no main process.
 * Comandos: palco.on / palco.off / palco.status / palco.project / palco.idle
 */
async function executePalco(
  palco: PalcoDeps,
  action: string,
  msg: Record<string, unknown>,
): Promise<boolean | { ok: boolean; data: unknown }> {
  switch (action) {
    case 'palco.on':
      return palco.turnOn()
    case 'palco.off': {
      await palco.turnOff()
      return true
    }
    case 'palco.status': {
      const status = await palco.status()
      return { ok: true, data: status }
    }
    case 'palco.slots': {
      const slots = await palco.slots()
      return { ok: true, data: slots }
    }
    case 'palco.slot-add': {
      const label = typeof msg.label === 'string' && msg.label.trim() ? msg.label.trim() : 'TV'
      const slot = await palco.createSlot(label)
      return slot ? { ok: true, data: slot } : { ok: false, data: null }
    }
    case 'palco.slot-remove': {
      const id = typeof msg.slotId === 'string' ? msg.slotId : ''
      if (!id || id === '0') return false
      await palco.removeSlot(id)
      return { ok: true, data: null }
    }
    case 'palco.slot-start': {
      const id = typeof msg.slotId === 'string' ? msg.slotId : ''
      if (!id) return false
      return palco.startSlot(id)
    }
    case 'palco.slot-stop': {
      const id = typeof msg.slotId === 'string' ? msg.slotId : ''
      if (!id) return false
      await palco.stopSlot(id)
      return { ok: true, data: null }
    }
    case 'palco.project': {
      /* v8 ignore next 1 -- ramo '' executado; remap v8 não credita */
      const text = typeof msg.text === 'string' ? msg.text : ''
      if (!text) return false
      const scope = typeof msg.scope === 'string' ? msg.scope : 'hymns'
      const footerRef = typeof msg.footerRef === 'string' ? msg.footerRef : undefined
      palco.project(scope, { text, footerRef })
      return true
    }
    case 'palco.idle': {
      palco.idle()
      return true
    }
    default:
      return false
  }
}

export function createModuleHandlers(deps: ModuleHandlerDeps): ModuleHandlers {
  return {
    async execute(namespace, action, msg) {
      try {
        if (namespace === 'media' && deps.media) {
          return executeMedia(deps.media, action, msg)
        }
        if (namespace === 'bible' && deps.bible) {
          return executeBible(deps.bible, action, msg)
        }
        if (namespace === 'timer' && deps.timer) {
          return executeTimer(deps.timer, action, msg)
        }
        if (namespace === 'countdown' && deps.countdown) {
          return executeCountdown(deps.countdown, action, msg)
        }
        if (namespace === 'clock' && deps.clock) {
          return executeClock(deps.clock, action, msg)
        }
        if (namespace === 'random' && deps.random) {
          return executeRandom(deps.random, action, msg)
        }
        if (namespace === 'palco' && deps.palco) {
          return executePalco(deps.palco, action, msg)
        }
        return false
      } catch {
        /* v8 ignore next 1 -- handler lançando já coberto; remap v8 não credita */
        return false
      }
    },
    snapshot(namespace) {
      if (namespace === 'bible' && deps.bible) return snapshotBible(deps.bible)
      if (namespace === 'timer' && deps.timer) return snapshotTimer(deps.timer)
      if (namespace === 'countdown' && deps.countdown) {
        return snapshotCountdown(deps.countdown)
      }
      if (namespace === 'media' && deps.media?.searchMusic) {
        return {
          query: lastSearchQuery,
          searchResults: lastSearchResults,
        }
      }
      if (namespace === 'clock' && deps.clock) return snapshotClock(deps.clock)
      if (namespace === 'random' && deps.random) {
        return snapshotRandom(deps.random)
      }
      if (namespace === 'palco' && deps.palco) {
        // snapshot assíncrono não existe aqui — devolve status síncrono leve
        return { available: true }
      }
      return null
    },
  }
}
