import { describe, expect, it } from 'vitest'

import {
  HISTORY_MAX_ENTRIES,
  HISTORY_MAX_VISIBLE_DOTS,
  createHistoryState,
  moveTo,
  parseHistoryState,
  recordPush,
  recordReplace,
  visibleWindow,
  type HistoryEntry,
  type HistoryState,
} from '../navigation-history'

function entry(fullPath: string, navKey = 'home'): HistoryEntry {
  return { fullPath, name: fullPath.slice(1) || 'home', navKey }
}

function stateOf(paths: string[], index = paths.length - 1): HistoryState {
  return { entries: paths.map((p) => entry(p)), index }
}

function paths(state: HistoryState): string[] {
  return state.entries.map((e) => e.fullPath)
}

describe('navigation-history: constantes', () => {
  it('limites aprovados no SPEC (Q3)', () => {
    expect(HISTORY_MAX_ENTRIES).toBe(50)
    expect(HISTORY_MAX_VISIBLE_DOTS).toBe(9)
  })
})

describe('createHistoryState', () => {
  it('começa vazio com índice -1', () => {
    expect(createHistoryState()).toEqual({ entries: [], index: -1 })
  })
})

describe('recordPush', () => {
  it('em histórico vazio cria a primeira entrada', () => {
    const next = recordPush(createHistoryState(), entry('/'))
    expect(paths(next)).toEqual(['/'])
    expect(next.index).toBe(0)
  })

  it('acrescenta depois da atual e avança o índice', () => {
    const next = recordPush(stateOf(['/', '/bible']), entry('/liturgy'))
    expect(paths(next)).toEqual(['/', '/bible', '/liturgy'])
    expect(next.index).toBe(2)
  })

  it('descarta as entradas à frente quando está no meio do histórico', () => {
    const next = recordPush(stateOf(['/', '/bible', '/liturgy', '/albums'], 1), entry('/utilities'))
    expect(paths(next)).toEqual(['/', '/bible', '/utilities'])
    expect(next.index).toBe(2)
  })

  it('não duplica quando o destino é igual à entrada atual', () => {
    const state = stateOf(['/', '/bible'])
    expect(recordPush(state, entry('/bible'))).toBe(state)
  })

  it('aceita destino igual a uma entrada que não é a atual', () => {
    const next = recordPush(stateOf(['/', '/bible']), entry('/'))
    expect(paths(next)).toEqual(['/', '/bible', '/'])
  })

  it('ao passar do limite descarta as mais antigas e mantém o índice na última', () => {
    const full = stateOf(Array.from({ length: HISTORY_MAX_ENTRIES }, (_, i) => `/p${i}`))
    const next = recordPush(full, entry('/novo'))
    expect(next.entries).toHaveLength(HISTORY_MAX_ENTRIES)
    expect(next.entries[0].fullPath).toBe('/p1')
    expect(next.entries.at(-1)?.fullPath).toBe('/novo')
    expect(next.index).toBe(HISTORY_MAX_ENTRIES - 1)
  })

  it('não altera o estado recebido', () => {
    const state = stateOf(['/', '/bible', '/liturgy'], 1)
    const snapshot = structuredClone(state)
    recordPush(state, entry('/albums'))
    expect(state).toEqual(snapshot)
  })
})

describe('recordReplace', () => {
  it('substitui apenas a entrada atual', () => {
    const next = recordReplace(stateOf(['/', '/settings', '/bible'], 1), entry('/settings/appearance', 'settings'))
    expect(paths(next)).toEqual(['/', '/settings/appearance', '/bible'])
    expect(next.index).toBe(1)
    expect(next.entries[1].navKey).toBe('settings')
  })

  it('em histórico vazio comporta-se como push', () => {
    const next = recordReplace(createHistoryState(), entry('/'))
    expect(paths(next)).toEqual(['/'])
    expect(next.index).toBe(0)
  })

  it('não altera o estado recebido', () => {
    const state = stateOf(['/', '/bible'])
    const snapshot = structuredClone(state)
    recordReplace(state, entry('/liturgy'))
    expect(state).toEqual(snapshot)
  })
})

describe('moveTo', () => {
  it('move o índice sem mexer nas entradas', () => {
    const state = stateOf(['/', '/bible', '/liturgy'])
    const next = moveTo(state, 0)
    expect(next.index).toBe(0)
    expect(next.entries).toBe(state.entries)
  })

  it('limita ao intervalo válido', () => {
    const state = stateOf(['/', '/bible', '/liturgy'], 1)
    expect(moveTo(state, -5).index).toBe(0)
    expect(moveTo(state, 99).index).toBe(2)
  })

  it('devolve o mesmo estado quando o índice não muda', () => {
    const state = stateOf(['/', '/bible'], 1)
    expect(moveTo(state, 1)).toBe(state)
  })

  it('em histórico vazio não faz nada', () => {
    const state = createHistoryState()
    expect(moveTo(state, 3)).toBe(state)
  })
})

describe('visibleWindow', () => {
  function summary(state: HistoryState) {
    const win = visibleWindow(state)
    return {
      start: win.start,
      end: win.end,
      current: win.items.filter((i) => i.current).map((i) => i.index),
      edges: win.items.filter((i) => i.edge).map((i) => i.index),
      count: win.items.length,
    }
  }

  it('histórico vazio não tem pontos', () => {
    expect(visibleWindow(createHistoryState())).toEqual({ start: 0, end: -1, items: [] })
  })

  it('uma entrada: um ponto atual, sem bordas (Q1)', () => {
    expect(visibleWindow(stateOf(['/']))).toEqual({
      start: 0,
      end: 0,
      items: [{ index: 0, current: true, edge: false }],
    })
  })

  it('até 9 entradas mostra todas, sem bordas', () => {
    const state = stateOf(Array.from({ length: 9 }, (_, i) => `/p${i}`), 4)
    expect(summary(state)).toEqual({ start: 0, end: 8, current: [4], edges: [], count: 9 })
  })

  it('com 20 entradas e atual no início: janela no começo, borda só à direita', () => {
    const state = stateOf(Array.from({ length: 20 }, (_, i) => `/p${i}`), 1)
    expect(summary(state)).toEqual({ start: 0, end: 8, current: [1], edges: [8], count: 9 })
  })

  it('com 20 entradas e atual no meio: janela centrada, bordas dos dois lados', () => {
    const state = stateOf(Array.from({ length: 20 }, (_, i) => `/p${i}`), 10)
    expect(summary(state)).toEqual({ start: 6, end: 14, current: [10], edges: [6, 14], count: 9 })
  })

  it('com 20 entradas e atual no fim: janela no final, borda só à esquerda', () => {
    const state = stateOf(Array.from({ length: 20 }, (_, i) => `/p${i}`), 19)
    expect(summary(state)).toEqual({ start: 11, end: 19, current: [19], edges: [11], count: 9 })
  })

  it('respeita um máximo customizado', () => {
    const state = stateOf(Array.from({ length: 10 }, (_, i) => `/p${i}`), 5)
    const win = visibleWindow(state, 3)
    expect(win.items.map((i) => i.index)).toEqual([4, 5, 6])
    expect(win.items.map((i) => i.edge)).toEqual([true, false, true])
  })
})

describe('parseHistoryState (dados salvos)', () => {
  it('aceita um estado bem formado', () => {
    const raw = { entries: [entry('/'), entry('/bible', 'bible')], index: 1 }
    expect(parseHistoryState(raw)).toEqual(raw)
  })

  it('aceita name nulo', () => {
    const raw = { entries: [{ fullPath: '/', name: null, navKey: 'home' }], index: 0 }
    expect(parseHistoryState(raw)).toEqual(raw)
  })

  it('rejeita formatos inválidos', () => {
    for (const raw of [
      null,
      'texto',
      42,
      {},
      { entries: 'x', index: 0 },
      { entries: [], index: 0 },
      { entries: [entry('/')], index: 'zero' },
      { entries: [entry('/')], index: 1.5 },
      { entries: [{ fullPath: 1, name: null, navKey: 'home' }], index: 0 },
      { entries: [{ fullPath: '/', name: 2, navKey: 'home' }], index: 0 },
      { entries: [{ fullPath: '/', name: null, navKey: null }], index: 0 },
      { entries: [null], index: 0 },
    ]) {
      expect(parseHistoryState(raw), JSON.stringify(raw)).toBeNull()
    }
  })

  it('índice fora do intervalo é limitado', () => {
    const raw = { entries: [entry('/'), entry('/bible')], index: 9 }
    expect(parseHistoryState(raw)?.index).toBe(1)
    expect(parseHistoryState({ ...raw, index: -3 })?.index).toBe(0)
  })

  it('mais de 50 entradas: fica com as últimas e ajusta o índice', () => {
    const entries = Array.from({ length: HISTORY_MAX_ENTRIES + 5 }, (_, i) => entry(`/p${i}`))
    const parsed = parseHistoryState({ entries, index: 10 })
    expect(parsed?.entries).toHaveLength(HISTORY_MAX_ENTRIES)
    expect(parsed?.entries[0].fullPath).toBe('/p5')
    expect(parsed?.index).toBe(5)
  })
})
