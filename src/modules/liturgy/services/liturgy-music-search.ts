import type { LiturgyMusicOption } from '../types/liturgy'

/**
 * app#346 (fase 2 da #302): busca fuzzy + busca por trecho da letra.
 * Ranking: título (palavras exatas) > número do hinário > fuzzy no título
 * (distância de edição) > letra. Índice em memória, offline-first,
 * ~2k músicas em <16ms por busca (banded Levenshtein com early-exit).
 */

const MAX_RESULTS = 50

/** Distância de edição máxima tolerada no fuzzy por palavra. */
const FUZZY_EDIT_DISTANCE = 1

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Otimização app#346: levenshteinWithin só roda quando os comprimentos
 * das palavras são compatíveis (|Δlen| <= k já sai cedo, mas o custo
 * dominante é iterar todas as palavras-alvo por palavra da query para
 * TODAS as 1956 entradas). Bounding box: se nenhuma palavra-alvo tem
 * comprimento em [len(qw)-k, len(qw)+k], impossível casar — checagem O(1)
 * por palavra via set de comprimentos pré-calculado.
 */
export function levenshteinWithin(a: string, b: string, k: number): boolean {
  if (a === b) return true
  const lengthA = a.length
  const lengthB = b.length
  if (Math.abs(lengthA - lengthB) > k) return false
  if (lengthA === 0 || lengthB === 0) {
    return Math.max(lengthA, lengthB) <= k
  }

  let previous = new Array<number>(lengthB + 1)
  for (let j = 0; j <= lengthB; j += 1) previous[j] = j

  for (let i = 1; i <= lengthA; i += 1) {
    const current = new Array<number>(lengthB + 1)
    current[0] = i
    let rowMin = current[0]
    for (let j = 1; j <= lengthB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      )
      if (current[j] < rowMin) rowMin = current[j]
    }
    if (rowMin > k) return false
    previous = current
  }

  return previous[lengthB] <= k
}

/** Número do hinário presente na query (ex.: "424", "h 424"). Null se não for número. */
function parseTrackQuery(normalizedQuery: string): number | null {
  const match = normalizedQuery.match(/^(?:h(?:a|ino)?\s*)?0*(\d{1,4})$/)
  if (!match?.[1]) return null
  const number = Number(match[1])
  return number > 0 ? number : null
}

/**
 * Cada palavra da query casa com alguma palavra do alvo por:
 * substring exata OU distância de edição <= FUZZY_EDIT_DISTANCE.
 * Hot path app#346 (1956 entradas × 50 digitações): substring é O(1) na
 * prática (includes curto-circuita) e a checagem de comprimento pula o
 * Levenshtein quando |Δlen| > k — o early-exit interno de levenshteinWithin
 * não evita a chamada, então filtramos aqui.
 */
function titleTokenMatches(titleWord: string, queryWord: string): boolean {
  if (/^\d+$/.test(queryWord)) return titleWord === queryWord
  return titleWord.includes(queryWord)
}

function queryWordsMatchTarget(
  queryWords: string[],
  targetWords: string[],
): boolean {
  outer: for (const queryWord of queryWords) {
    for (const targetWord of targetWords) {
      if (targetWord.includes(queryWord)) continue outer
    }
    const queryLength = queryWord.length
    for (const targetWord of targetWords) {
      const delta = targetWord.length - queryLength
      if (delta > FUZZY_EDIT_DISTANCE || delta < -FUZZY_EDIT_DISTANCE) {
        continue
      }
      if (levenshteinWithin(queryWord, targetWord, FUZZY_EDIT_DISTANCE)) {
        continue outer
      }
    }
    return false
  }
  return true
}

type SearchScore = 0 | 1 | 2 | 3

/** Hinário clássico antes do de 1996 quando o número da query casa o track. */
function hymnalPreference(entry: MusicSearchEntry, trackQuery: number | null): number {
  if (trackQuery == null || entry.hymnalTrack !== trackQuery) return 2
  const album = entry.albumNames
  if (album.includes('Hinário Adventista') && !album.includes('1996')) return 0
  if (album.includes('Hinário Adventista 1996')) return 1
  return 2
}

function scoreEntry(
  entry: MusicSearchEntry,
  context: { words: string[]; normalizedQuery: string; trackQuery: number | null },
): SearchScore | null {
  const title = normalizeSearchText(entry.name)
  const titleWords = title.split(' ').filter(Boolean)
  const album = normalizeSearchText(entry.albumNames)

  // 0 — título: todas as palavras da query presentes (ordem livre).
  // Número exige token exato: "1" não pode casar o "1996" do hinário novo.
  if (context.words.every((word) => titleWords.some((tw) => titleTokenMatches(tw, word)))) {
    return 0
  }
  // 1 — número do hinário ou match em álbum
  if (
    (context.trackQuery != null && entry.hymnalTrack === context.trackQuery) ||
    album.includes(context.normalizedQuery)
  ) {
    return 1
  }
  // 2 — fuzzy no título (troca de letras / ordem das palavras) — só quando
  // há chance real: 1ª letra de cada palavra da query precisa existir no
  // título (insert de 1ª letra seria 2 erros). Filtro barato antes do
  // Levenshtein que é o hot path com ~2k entradas.
  const titleSet = new Set(titleWords.join(' '))
  if (
    context.words.every((word) => titleSet.has(word[0] ?? ''))
  ) {
    if (queryWordsMatchTarget(context.words, titleWords)) {
      return 2
    }
  }
  // 3 — trecho da letra (lyricsText já vem normalizado do índice; fallback
  // normaliza na hora para options construídas fora do catálogo)
  const lyric = entry.lyricsText ?? normalizeSearchText(entry.lyric ?? '')
  if (context.words.every((word) => lyric.includes(word))) {
    return 3
  }
  return null
}

export interface MusicSearchEntry extends LiturgyMusicOption {
  /** Letra da música (texto corrido), usada na busca por trecho. */
  lyric?: string | null
  /** Letra já normalizada (fold diacrítico) — campo do índice pt_musics (issue #348). */
  lyricsText?: string
}

/**
 * Busca fuzzy + por letra (app#346). Mantém o contrato de
 * filterLiturgyMusicOptions: query vazia → [] e máx. 50 resultados.
 * Ranking: título > número/álbum > fuzzy título > letra.
 */
export function searchLiturgyMusic(
  options: Array<LiturgyMusicOption | MusicSearchEntry>,
  query: string,
): MusicSearchEntry[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const words = normalizedQuery.split(' ').filter(Boolean)
  const trackQuery = parseTrackQuery(normalizedQuery)
  const context = { words, normalizedQuery, trackQuery }

  const scored: Array<{ entry: MusicSearchEntry; score: SearchScore; index: number }> = []
  options.forEach((entry, index) => {
    const score = scoreEntry(entry, context)
    if (score != null) scored.push({ entry, score, index })
  })

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    const hymnA = hymnalPreference(a.entry, trackQuery)
    const hymnB = hymnalPreference(b.entry, trackQuery)
    if (hymnA !== hymnB) return hymnA - hymnB
    const trackA = a.entry.hymnalTrack ?? Number.POSITIVE_INFINITY
    const trackB = b.entry.hymnalTrack ?? Number.POSITIVE_INFINITY
    if (trackA !== trackB) return trackA - trackB
    return a.index - b.index
  })

  return scored.slice(0, MAX_RESULTS).map((hit) => hit.entry)
}
