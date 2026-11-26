import { describe, expect, it } from 'vitest'

import {
  LITURGY_EXPORT_FORMAT,
  appendImportedLiturgy,
  buildLiturgyExport,
  hasLiturgyContent,
  parseLiturgyImport,
  replaceWithImportedLiturgy,
} from '../liturgy-transfer'
import { normalizeLiturgyState } from '../liturgy-preferences'
import type { LiturgyItem, LiturgyPersistedState } from '../../types/liturgy'

function item(id: string, over: Partial<LiturgyItem> = {}): LiturgyItem {
  return { id, type: 'annotation', name: `Item ${id}`, subtitle: '', done: false, durationMs: 0, accentColor: '#FF6D00', ...over } as LiturgyItem
}

function stateWith(over: Partial<LiturgyPersistedState> = {}): LiturgyPersistedState {
  return { ...normalizeLiturgyState(null), ...over }
}

describe('exportar e importar a liturgia da semana', () => {
  it('exporta a semana toda (dias, notas e avulsas), sem horários reais nem cadeados', () => {
    const state = stateWith({
      weekdays: { ...normalizeLiturgyState(null).weekdays, saturday: [item('c1', { type: 'category', name: 'Regência' }), item('a1', { categoryId: 'c1', done: true })] },
      dayNotes: { ...normalizeLiturgyState(null).dayNotes, saturday: 'Equipe de som às 8h' },
      customLiturgies: [{ id: 'x', name: 'Culto Jovem', items: [item('j1')], notes: '' }],
      deletionLocks: { saturday: true },
    })
    const exported = buildLiturgyExport(state, new Date('2026-11-25T10:00:00Z'))
    expect(exported.format).toBe(LITURGY_EXPORT_FORMAT)
    expect(exported.version).toBe(1)
    expect(exported.exportedAt).toBe('2026-11-25T10:00:00.000Z')
    expect(exported.weekdays.saturday).toHaveLength(2)
    // Itens exportados saem desmarcados (concluído é do culto, não da lista).
    expect(exported.weekdays.saturday[1]!.done).toBe(false)
    expect(exported.dayNotes.saturday).toBe('Equipe de som às 8h')
    expect(exported.customLiturgies[0]!.name).toBe('Culto Jovem')
    expect('deletionLocks' in exported).toBe(false)
    expect('daySessionTimes' in exported).toBe(false)
  })

  it('roundtrip: o que foi exportado volta igual ao importar', () => {
    const state = stateWith({
      weekdays: { ...normalizeLiturgyState(null).weekdays, wednesday: [item('c1', { type: 'category', name: 'Abertura' }), item('m1', { categoryId: 'c1' })] },
    })
    const json = JSON.stringify(buildLiturgyExport(state))
    const parsed = parseLiturgyImport(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.weekdays.wednesday.map((i) => i.name)).toEqual(['Abertura', 'Item m1'])
  })

  it('arquivo inválido ou de outro tipo é recusado', () => {
    expect(parseLiturgyImport('não é json')).toEqual({ ok: false, error: 'invalid' })
    expect(parseLiturgyImport(JSON.stringify({ format: 'outra-coisa' }))).toEqual({ ok: false, error: 'invalid' })
    expect(parseLiturgyImport(JSON.stringify({ format: LITURGY_EXPORT_FORMAT, version: 99 }))).toEqual({ ok: false, error: 'version' })
  })

  it('sabe se a semana atual já tem algo (para perguntar antes de importar)', () => {
    expect(hasLiturgyContent(stateWith())).toBe(false)
    expect(hasLiturgyContent(stateWith({ customLiturgies: [{ id: 'x', name: 'A', items: [], notes: '' }] }))).toBe(true)
    expect(hasLiturgyContent(stateWith({ weekdays: { ...normalizeLiturgyState(null).weekdays, monday: [item('a')] } }))).toBe(true)
  })

  it('substituir: troca dias, notas e avulsas; mantém horários reais e cadeados locais', () => {
    const current = stateWith({
      weekdays: { ...normalizeLiturgyState(null).weekdays, saturday: [item('old')] },
      deletionLocks: { saturday: true },
    })
    const imported = buildLiturgyExport(stateWith({
      weekdays: { ...normalizeLiturgyState(null).weekdays, sunday: [item('new')] },
      customLiturgies: [{ id: 'c', name: 'Avulsa', items: [], notes: '' }],
    }))
    const next = replaceWithImportedLiturgy(current, imported)
    expect(next.weekdays.saturday).toEqual([])
    expect(next.weekdays.sunday.map((i) => i.name)).toEqual(['Item new'])
    expect(next.customLiturgies.map((c) => c.name)).toEqual(['Avulsa'])
    expect(next.deletionLocks).toEqual({ saturday: true })
  })

  it('acrescentar: itens vão para o fim de cada dia com ids novos (categorias religadas); avulsas entram como novas', () => {
    const current = stateWith({
      weekdays: { ...normalizeLiturgyState(null).weekdays, saturday: [item('c1', { type: 'category' })] },
      dayNotes: { ...normalizeLiturgyState(null).dayNotes, saturday: 'Nota atual' },
      customLiturgies: [{ id: 'same', name: 'Culto Jovem', items: [], notes: '' }],
    })
    const imported = buildLiturgyExport(stateWith({
      weekdays: { ...normalizeLiturgyState(null).weekdays, saturday: [item('c1', { type: 'category', name: 'Importada' }), item('a1', { categoryId: 'c1' })] },
      dayNotes: { ...normalizeLiturgyState(null).dayNotes, saturday: 'Nota importada' },
      customLiturgies: [{ id: 'same', name: 'Culto Jovem', items: [item('j1')], notes: '' }],
    }))
    const next = appendImportedLiturgy(current, imported)
    const sat = next.weekdays.saturday
    expect(sat).toHaveLength(3)
    expect(sat[0]!.id).toBe('c1')
    // Ids novos, e o sub-item continua ligado à categoria importada.
    expect(sat[1]!.id).not.toBe('c1')
    expect(sat[2]!.categoryId).toBe(sat[1]!.id)
    expect(next.dayNotes.saturday).toBe('Nota atual\n\nNota importada')
    expect(next.customLiturgies).toHaveLength(2)
    expect(next.customLiturgies[1]!.id).not.toBe('same')
  })
})
