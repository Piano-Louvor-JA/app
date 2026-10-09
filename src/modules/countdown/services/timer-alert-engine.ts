/**
 * Alert engine puro para countdown/cronômetro: dado o tempo decorrido,
 * retorna os marcos cujo tempo foi atingido (cada um exatamente 1x).
 * Sem DOM, sem áudio — o caller decide o que fazer com os marcos disparados.
 */
export interface AlertMark {
  id: string
  /** Momento (em ms decorridos) em que o alerta dispara. */
  atMs: number
}

export interface AlertEngine {
  /** Avança o relógio e retorna marcos atingidos neste tick (ordem crescente de atMs). */
  tick(elapsedMs: number): AlertMark[]
  /** Rearma todos os marcos (novo ciclo de contagem). */
  reset(): void
}

export function createAlertEngine(marks: AlertMark[]): AlertEngine {
  const sorted = [...marks].sort((a, b) => a.atMs - b.atMs)
  let fired = new Set<string>()

  return {
    tick(elapsedMs: number): AlertMark[] {
      const due = sorted.filter((m) => elapsedMs >= m.atMs && !fired.has(m.id))
      for (const m of due) fired.add(m.id)
      return due
    },
    reset(): void {
      fired = new Set<string>()
    },
  }
}
