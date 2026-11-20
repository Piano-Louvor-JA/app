import { describe, expect, it } from 'vitest'

import {
  MINIMIZED_PAGES_MAX,
  addMinimized,
  moveMinimized,
  parseMinimizedPages,
  removeMinimized,
  type MinimizedPage,
} from '../minimized-pages'

function page(fullPath: string, minimizedAt: number, extra: Partial<MinimizedPage> = {}): MinimizedPage {
  return {
    fullPath,
    routeName: 'albums-collection',
    title: `Página ${fullPath}`,
    icon: 'ti-book',
    summary: '',
    state: { collectionId: fullPath },
    scroll: [],
    preview: null,
    minimizedAt,
    ...extra,
  }
}

function paths(list: MinimizedPage[]) {
  return list.map((p) => p.fullPath)
}

describe('minimized-pages: constantes', () => {
  it('limite alto: a barra usa a largura toda e rola; o teto só protege o storage', () => {
    expect(MINIMIZED_PAGES_MAX).toBe(30)
  })
})

describe('addMinimized', () => {
  it('acrescenta no fim', () => {
    const list = addMinimized([page('/albums/1', 1)], page('/albums/2', 2))
    expect(paths(list)).toEqual(['/albums/1', '/albums/2'])
  })

  it('mesma página: substitui no mesmo lugar, sem duplicar', () => {
    const list = addMinimized(
      [page('/albums/1', 1), page('/albums/2', 2)],
      page('/albums/1', 3, { summary: 'Busca: santo' }),
    )
    expect(paths(list)).toEqual(['/albums/1', '/albums/2'])
    expect(list[0].summary).toBe('Busca: santo')
    expect(list[0].minimizedAt).toBe(3)
  })

  it('passou do limite: sai a minimizada há mais tempo', () => {
    const full = Array.from({ length: MINIMIZED_PAGES_MAX }, (_, i) => page(`/albums/${i}`, 10 + i))
    full[0] = { ...full[0], minimizedAt: 50 } // a 1ª da barra foi minimizada de novo depois
    const list = addMinimized(full, page('/albums/novo', 100))
    expect(list).toHaveLength(MINIMIZED_PAGES_MAX)
    expect(paths(list)).not.toContain('/albums/1')
    expect(paths(list)).toContain('/albums/0')
    expect(paths(list).at(-1)).toBe('/albums/novo')
  })

  it('não altera a lista recebida', () => {
    const original = [page('/albums/1', 1)]
    const snapshot = structuredClone(original)
    addMinimized(original, page('/albums/2', 2))
    expect(original).toEqual(snapshot)
  })
})

describe('removeMinimized', () => {
  it('tira só a página pedida', () => {
    const list = removeMinimized([page('/albums/1', 1), page('/albums/2', 2)], '/albums/1')
    expect(paths(list)).toEqual(['/albums/2'])
  })

  it('página que não está na lista: devolve igual', () => {
    const original = [page('/albums/1', 1)]
    expect(removeMinimized(original, '/x')).toEqual(original)
  })
})

describe('moveMinimized', () => {
  const list = () => ['/a', '/b', '/c', '/d'].map((path, i) => page(path, i))

  it('leva a página para a nova posição (para frente e para trás)', () => {
    expect(paths(moveMinimized(list(), '/a', 2))).toEqual(['/b', '/c', '/a', '/d'])
    expect(paths(moveMinimized(list(), '/d', 0))).toEqual(['/d', '/a', '/b', '/c'])
  })

  it('posição fora da lista vai para a ponta', () => {
    expect(paths(moveMinimized(list(), '/b', 99))).toEqual(['/a', '/c', '/d', '/b'])
    expect(paths(moveMinimized(list(), '/c', -3))).toEqual(['/c', '/a', '/b', '/d'])
  })

  it('página que não está na lista ou mesma posição: devolve igual, sem alterar a original', () => {
    const original = list()
    expect(paths(moveMinimized(original, '/x', 0))).toEqual(['/a', '/b', '/c', '/d'])
    const same = moveMinimized(original, '/b', 1)
    expect(paths(same)).toEqual(['/a', '/b', '/c', '/d'])
    expect(same).not.toBe(original)
  })
})

describe('parseMinimizedPages (dados salvos)', () => {
  it('aceita uma lista bem formada', () => {
    const raw = [
      page('/albums/1', 1, { scroll: [{ path: [0, 1], top: 300, left: 0 }], preview: 'data:image/jpeg;base64,AA' }),
      page('/albums/2', 2, { routeName: null }),
    ]
    expect(parseMinimizedPages(raw)).toEqual(raw)
  })

  it('não-lista vira lista vazia', () => {
    for (const raw of [null, undefined, 'x', 3, {}]) {
      expect(parseMinimizedPages(raw), String(raw)).toEqual([])
    }
  })

  it('descarta itens inválidos e mantém os bons', () => {
    const good = page('/albums/1', 1)
    const raw = [
      good,
      null,
      'x',
      { ...good, fullPath: 3 },
      { ...good, title: null },
      { ...good, icon: undefined },
      { ...good, summary: 1 },
      { ...good, minimizedAt: 'ontem' },
      { ...good, routeName: 9 },
    ]
    expect(parseMinimizedPages(raw)).toEqual([good])
  })

  it('rolagem inválida vira vazia e prévia que não é texto vira null', () => {
    const good = page('/albums/1', 1)
    const parsed = parseMinimizedPages([
      { ...good, scroll: 'x', preview: 42 },
      { ...page('/albums/2', 2), scroll: [{ path: ['a'], top: 1, left: 0 }] },
      { ...page('/albums/3', 3), scroll: [{ path: [0], top: '1', left: 0 }] },
      { ...page('/albums/4', 4), scroll: [null] },
    ])
    expect(parsed.map((p) => [p.scroll, p.preview])).toEqual([
      [[], null],
      [[], null],
      [[], null],
      [[], null],
    ])
  })

  it('mais itens que o limite: fica com os minimizados mais recentemente', () => {
    const raw = Array.from({ length: MINIMIZED_PAGES_MAX + 2 }, (_, i) => page(`/albums/${i}`, i))
    const parsed = parseMinimizedPages(raw)
    expect(parsed).toHaveLength(MINIMIZED_PAGES_MAX)
    expect(paths(parsed)).not.toContain('/albums/0')
    expect(paths(parsed)).not.toContain('/albums/1')
  })
})
