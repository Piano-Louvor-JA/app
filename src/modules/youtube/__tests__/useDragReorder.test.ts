import { describe, expect, it, vi } from 'vitest'

import { GHOST_CLASS, useDragReorder } from '../composables/useDragReorder'

/** DataTransfer mínimo (o jsdom não tem). */
function transfer() {
  const data = new Map<string, string>()
  return {
    data,
    effectAllowed: '',
    dropEffect: '',
    get types() { return [...data.keys()] },
    setData: (type: string, value: string) => { data.set(type, value) },
    getData: (type: string) => data.get(type) ?? '',
  }
}

const event = (dataTransfer: unknown, extra: Record<string, unknown> = {}) =>
  ({ dataTransfer, preventDefault: vi.fn(), ...extra }) as unknown as DragEvent

describe('arrastar e soltar para reordenar', () => {
  it('destaque só na cópia que segue o mouse: entra no início e sai logo depois', () => {
    vi.useFakeTimers()
    const row = document.createElement('li')
    useDragReorder('lista', vi.fn()).bind('A').onDragstart(event(transfer(), { currentTarget: row }))
    expect(row.classList.contains(GHOST_CLASS)).toBe(true)
    vi.runAllTimers()
    expect(row.classList.contains(GHOST_CLASS)).toBe(false)
    vi.useRealTimers()
  })

  it('arrasta A, passa por B e solta em B', () => {
    const onMove = vi.fn()
    const drag = useDragReorder('lista', onMove)
    const dt = transfer()
    drag.bind('A').onDragstart(event(dt))
    expect(dt.effectAllowed).toBe('move')
    expect(drag.dragging.value).toBe('A')

    const over = event(dt)
    drag.bind('B').onDragover(over)
    expect(over.preventDefault).toHaveBeenCalled()
    expect(drag.over.value).toBe('B')
    drag.bind('C').onDragleave()
    expect(drag.over.value).toBe('B')
    drag.bind('B').onDragleave()
    expect(drag.over.value).toBeNull()

    drag.bind('B').onDrop(event(dt))
    expect(onMove).toHaveBeenCalledWith('A', 'B')
    expect(drag.dragging.value).toBeNull()
  })

  it('tracejado: descendo marca depois da linha alvo, subindo marca antes', () => {
    const drag = useDragReorder('lista', vi.fn())
    const dt = transfer()
    drag.bind('B', 'A', 'C', 1).onDragstart(event(dt))
    expect(drag.classes('B')).toEqual({ 'is-drop-before': false, 'is-drop-after': false })
    drag.bind('C', 'B', 'D', 2).onDragover(event(dt))
    expect(drag.classes('C')).toEqual({ 'is-drop-before': false, 'is-drop-after': true })
    expect(drag.classes('A')).toEqual({ 'is-drop-before': false, 'is-drop-after': false })
    drag.bind('A', undefined, 'B', 0).onDragover(event(dt))
    expect(drag.classes('A')).toEqual({ 'is-drop-before': true, 'is-drop-after': false })
    drag.bind('B', 'A', 'C', 1).onDragover(event(dt))
    expect(drag.classes('B')).toEqual({ 'is-drop-before': false, 'is-drop-after': false })
    drag.bind('B').onDragend()
    drag.bind('X').onDragover(event(dt))
    expect(drag.side.value).toBe('after')
  })

  it('outra lista, o próprio item ou nada arrastado: não move', () => {
    const onMove = vi.fn()
    const mine = useDragReorder('lista', onMove)
    const other = useDragReorder('outra', vi.fn())
    const dt = transfer()
    other.bind('X').onDragstart(event(dt))
    const over = event(dt)
    mine.bind('B').onDragover(over)
    expect(over.preventDefault).not.toHaveBeenCalled()
    mine.bind('B').onDrop(event(dt))
    mine.bind('B').onDrop(event(null))

    const self = transfer()
    mine.bind('A').onDragstart(event(self))
    mine.bind('A').onDrop(event(self))
    mine.bind('A').onDragend()
    expect(mine.dragging.value).toBeNull()
    mine.bind('A').onDragstart(event(null))
    mine.bind('A').onDragover(event(null))
    expect(onMove).not.toHaveBeenCalled()
  })

  it('teclado: Alt+↑/↓ move para o vizinho', () => {
    const onMove = vi.fn()
    const drag = useDragReorder('lista', onMove)
    const key = (k: string, altKey = true) => event(null, { key: k, altKey }) as unknown as KeyboardEvent
    drag.bind('B', 'A', 'C').onKeydown(key('ArrowUp'))
    drag.bind('B', 'A', 'C').onKeydown(key('ArrowDown'))
    drag.bind('A', undefined, 'B').onKeydown(key('ArrowUp'))
    drag.bind('B', 'A', 'C').onKeydown(key('ArrowUp', false))
    drag.bind('B', 'A', 'C').onKeydown(key('Enter'))
    expect(onMove.mock.calls).toEqual([['B', 'A'], ['B', 'C']])
  })
})
