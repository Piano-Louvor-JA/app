/**
 * Fila de reprodução do player (spec playlist RF-03 — 2026-08-27).
 *
 * Funções PURAS: o store (useMediaStore) orquestra efeitos (áudio,
 * projeção), toda decisão de fila passa por aqui — testável sem Pinia.
 */

export interface QueueItem {
  musicId: number
  albumId: number | null
  title: string
}

export interface UpcomingState {
  items: QueueItem[]
  index: number
}

/** Próxima faixa a tocar; null = fim da fila (comportamento atual: parar). */
export function resolveNext(state: UpcomingState): QueueItem | null {
  const nextIndex = state.index + 1
  if (nextIndex < 0 || nextIndex >= state.items.length) return null
  return state.items[nextIndex] ?? null
}

/** Faixa anterior (para previous() do player quando há fila). */
export function resolvePrevious(state: UpcomingState): QueueItem | null {
  const prevIndex = state.index - 1
  if (prevIndex < 0 || prevIndex >= state.items.length) return null
  return state.items[prevIndex] ?? null
}

/** Append no fim; ignora duplicata consecutiva (guard de duplo clique). */
export function appendToQueue(
  items: QueueItem[],
  newItem: QueueItem,
  currentIndex: number,
): UpcomingState & { items: QueueItem[] } {
  const last = items[items.length - 1]
  if (last && last.musicId === newItem.musicId) {
    return { items, index: currentIndex }
  }
  return { items: [...items, newItem], index: currentIndex }
}

/** Append de lote; preserva a guarda de duplicata consecutiva por item. */
export function appendQueueToQueue(
  items: QueueItem[],
  batch: QueueItem[],
  currentIndex: number,
): UpcomingState {
  return batch.reduce(
    (state, item) => appendToQueue(state.items, item, state.index),
    { items, index: currentIndex } as UpcomingState,
  )
}

/** Remove por índice; ajusta o índice atual e reporta se removeu a atual. */
export function removeFromQueue(
  items: QueueItem[],
  index: number,
  currentIndex: number,
): { items: QueueItem[]; index: number; removedCurrent: boolean } {
  if (index < 0 || index >= items.length) {
    return { items, index: currentIndex, removedCurrent: false }
  }
  const nextItems = items.filter((_, i) => i !== index)
  if (index === currentIndex) {
    // Atual removida: índice inválido — caller decide (pular pra `index`
    // que agora é a próxima, ou parar).
    return { items: nextItems, index: -1, removedCurrent: true }
  }
  const nextIndex =
    index < currentIndex ? currentIndex - 1 : currentIndex
  return { items: nextItems, index: nextIndex, removedCurrent: false }
}

/** Reordena por lista de musicIds; mantém a faixa atual rastreada. */
export function reorderQueue(
  items: QueueItem[],
  _oldIndex: number,
  orderedMusicIds: number[],
  currentIndex: number,
): UpcomingState {
  const currentMusicId = items[currentIndex]?.musicId ?? null
  const byId = new Map(items.map((i) => [i.musicId, i]))
  const nextItems = orderedMusicIds
    .map((id) => byId.get(id))
    .filter((i): i is QueueItem => i != null)
  const nextIndex = currentMusicId
    ? nextItems.findIndex((i) => i.musicId === currentMusicId)
    : -1
  return { items: nextItems, index: nextIndex }
}

/** Shuffle: faixa atual no lugar, resto embaralhado (Fisher-Yates). */
export function shuffleQueue(
  items: QueueItem[],
  currentIndex: number,
): UpcomingState {
  if (items.length <= 2) return { items, index: currentIndex }
  const current = items[currentIndex]
  if (!current) return { items, index: currentIndex }
  const rest = items.filter((_, i) => i !== currentIndex)
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = rest[i]
    rest[i] = rest[j]
    rest[j] = tmp
  }
  const nextItems = [current, ...rest]
  return { items: nextItems, index: 0 }
}
