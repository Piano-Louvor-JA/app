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

/** Item da barra de páginas minimizadas (MinimizedPagesBar). */
export interface MinimizedBarItem {
  /** Identifica a página (fullPath); emitido em `open`/`close`. */
  key: string
  title: string
  /** Classe Tabler, ex.: `ti-book`. */
  icon: string
  summary: string
  /** Miniatura (data URL) ou `null` para a prévia em cartão. */
  preview: string | null
  /** Texto do x (aria-label/title), ex.: "Fechar Hinário Adventista". */
  closeLabel: string
}
