export interface DockNavItem {
  key: string
  label: string
  /** Classe Tabler, ex.: ti-home */
  icon: string
  to?: string
}

/** Ponto do navegador de histórico (HistoryNav). */
export interface HistoryNavDot {
  /** Índice da entrada no histórico (emitido em `go`). */
  index: number
  /** Nome da tela, usado em tooltip e aria-label. */
  label: string
  current: boolean
  /** Ponto da borda quando há entradas escondidas daquele lado. */
  edge: boolean
}
