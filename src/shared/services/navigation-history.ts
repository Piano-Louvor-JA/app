/**
 * Modelo puro do histórico de navegação da sessão (setas voltar/avançar +
 * pontos acima do dock). Sem Vue/Pinia: a store só delega para cá.
 *
 * Todas as funções devolvem um estado novo (ou o mesmo objeto, quando nada
 * muda) e nunca alteram o estado recebido.
 */

/** Máximo de entradas guardadas; ao passar, as mais antigas saem. */
export const HISTORY_MAX_ENTRIES = 50

/** Máximo de pontos exibidos de uma vez, numa janela centrada no atual. */
export const HISTORY_MAX_VISIBLE_DOTS = 9

export interface HistoryEntry {
  fullPath: string
  name: string | null
  navKey: string
}

export interface HistoryState {
  entries: HistoryEntry[]
  /** Índice da entrada atual; -1 quando vazio. */
  index: number
}

export interface HistoryDot {
  index: number
  current: boolean
  /** Ponto da borda da janela quando há entradas escondidas daquele lado. */
  edge: boolean
}

export interface HistoryWindow {
  start: number
  end: number
  items: HistoryDot[]
}

export function createHistoryState(): HistoryState {
  return { entries: [], index: -1 }
}

/** Navegação nova: descarta o que estava à frente e acrescenta `entry`. */
export function recordPush(state: HistoryState, entry: HistoryEntry): HistoryState {
  if (state.entries[state.index]?.fullPath === entry.fullPath) return state

  const entries = [...state.entries.slice(0, state.index + 1), entry]
  const overflow = Math.max(0, entries.length - HISTORY_MAX_ENTRIES)
  return {
    entries: overflow > 0 ? entries.slice(overflow) : entries,
    index: entries.length - 1 - overflow,
  }
}

/** `router.replace`: troca só a entrada atual. */
export function recordReplace(state: HistoryState, entry: HistoryEntry): HistoryState {
  if (state.index < 0) return recordPush(state, entry)

  const entries = [...state.entries]
  entries[state.index] = entry
  return { entries, index: state.index }
}

/** Voltar/avançar/salto: move o índice, limitado às entradas existentes. */
export function moveTo(state: HistoryState, index: number): HistoryState {
  if (state.entries.length === 0) return state

  const clamped = Math.min(Math.max(index, 0), state.entries.length - 1)
  return clamped === state.index ? state : { entries: state.entries, index: clamped }
}

/** Janela de até `max` pontos centrada na entrada atual. */
export function visibleWindow(
  state: HistoryState,
  max: number = HISTORY_MAX_VISIBLE_DOTS,
): HistoryWindow {
  const total = state.entries.length
  const size = Math.min(total, max)
  const start = Math.min(Math.max(state.index - Math.floor(max / 2), 0), total - size)
  const end = start + size - 1

  const items: HistoryDot[] = []
  for (let index = start; index <= end; index++) {
    items.push({
      index,
      current: index === state.index,
      edge: (index === start && start > 0) || (index === end && end < total - 1),
    })
  }
  return { start, end, items }
}
