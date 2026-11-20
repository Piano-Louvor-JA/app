/** Trechos já baixados de uma trilha, como intervalos semiabertos `[início, fim)` ordenados e sem sobreposição. */
export class RangeSet {
  /** @type {Array<[number, number]>} */
  #ranges = []

  /** @param {number} start @param {number} end */
  add(start, end) {
    if (!(end > start)) return
    const next = []
    let merged = [start, end]
    let placed = false
    for (const range of this.#ranges) {
      if (range[1] < merged[0]) {
        next.push(range)
      } else if (range[0] > merged[1]) {
        if (!placed) {
          next.push(merged)
          placed = true
        }
        next.push(range)
      } else {
        merged = [Math.min(range[0], merged[0]), Math.max(range[1], merged[1])]
      }
    }
    if (!placed) next.push(merged)
    this.#ranges = next
  }

  /** @param {number} start @param {number} end */
  has(start, end) {
    if (!(end > start)) return true
    return this.#ranges.some(([s, e]) => s <= start && e >= end)
  }

  /** Fim do trecho contínuo que começa em `pos`; igual a `pos` quando o byte não chegou. */
  contiguousFrom(pos) {
    const range = this.#ranges.find(([s, e]) => s <= pos && e > pos)
    return range ? range[1] : pos
  }

  /** Primeiro byte ausente a partir de `from`, ou `size` se não falta nada até o fim. */
  firstMissing(from, size) {
    return Math.min(this.contiguousFrom(from), size)
  }

  /** @param {number} size */
  gaps(size) {
    const gaps = []
    let cursor = 0
    for (const [s, e] of this.#ranges) {
      if (s > cursor) gaps.push([cursor, Math.min(s, size)])
      cursor = Math.max(cursor, e)
      if (cursor >= size) break
    }
    if (cursor < size) gaps.push([cursor, size])
    return gaps
  }

  total() {
    return this.#ranges.reduce((sum, [s, e]) => sum + (e - s), 0)
  }

  ranges() {
    return this.#ranges.map(([s, e]) => [s, e])
  }
}
