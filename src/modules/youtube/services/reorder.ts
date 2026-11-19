/**
 * Move o item `fromId` para a posição de `toId` (arrastar e soltar). Descendo, ele fica logo
 * depois do alvo; subindo, logo antes, como numa lista que abre espaço onde se solta.
 * Devolve a mesma lista quando não há o que mover.
 */
export function moveById<T>(list: readonly T[], idOf: (item: T) => string, fromId: string, toId: string): T[] {
  const from = list.findIndex((item) => idOf(item) === fromId)
  const to = list.findIndex((item) => idOf(item) === toId)
  if (from < 0 || to < 0 || from === to) return [...list]
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Aplica uma ordem salva (lista de IDs). O que não está nela (novo) vai para o topo, na ordem
 * em que veio; IDs salvos que não existem mais são ignorados.
 */
export function applyOrder<T>(list: readonly T[], idOf: (item: T) => string, order: readonly string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  const fresh = list.filter((item) => !rank.has(idOf(item)))
  const ranked = list
    .filter((item) => rank.has(idOf(item)))
    .sort((a, b) => (rank.get(idOf(a)) ?? 0) - (rank.get(idOf(b)) ?? 0))
  return [...fresh, ...ranked]
}
