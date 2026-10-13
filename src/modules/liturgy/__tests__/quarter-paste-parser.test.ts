import { describe, expect, it } from 'vitest'

import { parseQuarterPaste } from '../services/quarter-paste-parser'

describe('parseQuarterPaste — colar a lista do trimestre (Rafael: "colar 4 listas = ano")', () => {
  it('RED: bloco por data com múltiplas posições', () => {
    const text = `
03/10
inicial: 15 - Adoração
provai: video provai-set.mp4
ML: 22 - Bassora
final: 8 - Doce é o dia

10/10
inicial: 19
ML: 31
`
    const result = parseQuarterPaste(text, { year: 2026 })
    expect(result.errors).toHaveLength(0)
    expect(result.groups).toHaveLength(2)
    const g1 = result.groups[0]!
    expect(g1.dateISO).toBe('2026-10-03')
    expect(g1.entries).toHaveLength(4)
    expect(g1.entries[0]).toMatchObject({ slotKey: 'inicial', musicId: 15, name: 'Adoração' })
    expect(g1.entries[1]).toMatchObject({ slotKey: 'provai', filePath: 'video provai-set.mp4' })
    const g2 = result.groups[1]!
    expect(g2.dateISO).toBe('2026-10-10')
    expect(g2.entries[0]!.slotKey).toBe('inicial')
  })

  it('RED: linha única com data e conteúdo separados por vírgula/traço', () => {
    const text = '11/10 — hino 400 — Meu Lugar no Mundo'
    const result = parseQuarterPaste(text, { year: 2026 })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]!.dateISO).toBe('2026-10-11')
    expect(result.groups[0]!.entries[0]).toMatchObject({ musicId: 400, name: 'Meu Lugar no Mundo' })
  })

  it('RED: data inválida vira erro, não crash', () => {
    const result = parseQuarterPaste('35/15 - hino 1', { year: 2026 })
    expect(result.errors).toHaveLength(1)
    expect(result.groups).toHaveLength(0)
  })

  it('RED: dia da semana derivado da data (sábado/dom entram nos slots?) — só registra weekday', () => {
    const result = parseQuarterPaste('03/10\nML: 22', { year: 2026 })
    // 03/10/2026 é sábado
    expect(result.groups[0]!.weekday).toBe('saturday')
  })

  it('RED: hino sem título → nome vazio (UI preenche do catálogo)', () => {
    const result = parseQuarterPaste('10/10\nML: 31', { year: 2026 })
    expect(result.groups[0]!.entries[0]!.musicId).toBe(31)
    expect(result.groups[0]!.entries[0]!.name).toBe('')
  })
})
