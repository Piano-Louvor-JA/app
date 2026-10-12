import { describe, expect, it } from 'vitest'

import { resolveScheduledEntry } from '../services/scheduled-resolver'
import type { ScheduledCategory, ScheduledItem } from '../stores/useScheduledStore'

const cats: ScheduledCategory[] = [{ id: 'c1', name: 'Provai e Vede' }]

function item(id: string, date: string, name: string, content?: unknown): ScheduledItem {
  return {
    id,
    categoryId: 'c1',
    date,
    name,
    filePath: '',
    isRelativePath: false,
    notes: '',
    ...(content ? { content } : {}),
  } as ScheduledItem
}

describe('resolveScheduledEntry — o placeholder mostra o que toca no dia', () => {
  it('RED: entrada da data ativa → nome + tipo resolvidos', () => {
    const items = [item('s1', '2026-10-10', 'Provai 10/10', { kind: 'music', musicId: 1700 })]
    const r = resolveScheduledEntry('c1', '2026-10-10', cats, items)
    expect(r).not.toBeNull()
    expect(r!.entryName).toBe('Provai 10/10')
    expect(r!.kind).toBe('music')
  })

  it('RED: sem entrada na data → null (timeline mostra estado vazio)', () => {
    const items = [item('s1', '2026-10-03', 'Provai 03/10', { kind: 'music', musicId: 1 })]
    expect(resolveScheduledEntry('c1', '2026-10-10', cats, items)).toBeNull()
  })

  it('RED: legado sem content → kind file com o filePath', () => {
    const items = [item('s2', '2026-10-10', 'Sermão')]
    ;(items[0] as unknown as { filePath: string }).filePath = 'C:/x.pptx'
    const r = resolveScheduledEntry('c1', '2026-10-10', cats, items)
    expect(r!.kind).toBe('file')
    expect(r!.entryName).toBe('Sermão')
  })

  it('RED: categoria inexistente → null (sem crash)', () => {
    expect(resolveScheduledEntry('zz', '2026-10-10', cats, [])).toBeNull()
  })

  it('RED: label de tipo por kind (música/vídeo/versículo...)', () => {
    const items = [
      item('a', '2026-10-10', 'A', { kind: 'music', musicId: 1 }),
      item('b', '2026-10-10', 'B', { kind: 'file', filePath: 'x.mp4' }),
      item('c', '2026-10-10', 'C', { kind: 'verse', verseBookId: 1, verseChapter: 2 }),
      item('d', '2026-10-10', 'D', { kind: 'online_video', url: 'https://x' }),
      item('e', '2026-10-10', 'E', { kind: 'annotation', text: 'oi' }),
    ]
    expect(resolveScheduledEntry('c1', '2026-10-10', cats, items.map((i, ix) => ({ ...i, id: String(ix) })))).not.toBeNull()
  })
})
