import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useScheduledDialog } from '../composables/useScheduledDialog'

const prefs: Record<string, unknown> = {}
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: vi.fn((k: string, fallback: unknown) => prefs[k] ?? fallback),
  setBrowserItem: vi.fn((k: string, value: unknown) => { prefs[k] = value }),
}))

describe('useScheduledDialog — lógica do dialog de rotações', () => {
  beforeEach(() => {
    Object.keys(prefs).forEach((k) => delete prefs[k])
    setActivePinia(createPinia())
  })

  it('RED: cria rotação e adiciona entrada com conteúdo música', () => {
    const dlg = useScheduledDialog()
    dlg.createRotation('Provai e Vede')
    expect(dlg.rotations.value).toHaveLength(1)

    dlg.addEntry(dlg.rotations.value[0]!.id, {
      dateISO: '2026-10-03',
      content: { kind: 'music', musicId: 1660 },
      name: 'Provai 03/10',
    })
    const items = dlg.entriesOf(dlg.rotations.value[0]!.id)
    expect(items).toHaveLength(1)
    expect(items[0]!.content?.kind).toBe('music')
  })

  it('RED: colar trimestre gera entradas mapeadas por slot→rotação', () => {
    const dlg = useScheduledDialog()
    const rot1 = dlg.createRotation('Hino Inicial ES')
    const rot2 = dlg.createRotation('Momentos de Louvor')

    const text = `
03/10
inicial: 15 - Adoração
ML: 22 - Bassora

10/10
inicial: 19
ML: 31
`
    const mapping = { inicial: rot1, ml: rot2 }
    const report = dlg.applyQuarterPaste(text, { year: 2026, slotMapping: mapping })
    expect(report.created).toBe(4)
    expect(report.errors).toHaveLength(0)
    expect(dlg.entriesOf(rot1)).toHaveLength(2)
    expect(dlg.entriesOf(rot2)).toHaveLength(2)
    // datas corretas (03/10 e 10/10/2026)
    expect(dlg.entriesOf(rot1).map((e) => e.date)).toEqual(['2026-10-03', '2026-10-10'])
  })

  it('RED: slot não mapeado vira aviso (não perde dado silenciosamente)', () => {
    const dlg = useScheduledDialog()
    const rot1 = dlg.createRotation('Hino Inicial ES')
    const text = '03/10\ndesconhecido: 55 - X'
    const report = dlg.applyQuarterPaste(text, { year: 2026, slotMapping: { inicial: rot1 } })
    expect(report.created).toBe(0)
    expect(report.unmappedSlots).toContain('desconhecido')
  })

  it('RED: remapear slot depois importa os pendentes', () => {
    const dlg = useScheduledDialog()
    const rot1 = dlg.createRotation('Hino Inicial ES')
    const rot2 = dlg.createRotation('ML')
    dlg.applyQuarterPaste('03/10\ninicial: 15\nml: 22', { year: 2026, slotMapping: { inicial: rot1 } })
    expect(dlg.pendingCount.value).toBeGreaterThan(0)
    dlg.applySlotMapping('ml', rot2)
    expect(dlg.pendingCount.value).toBe(0)
    expect(dlg.entriesOf(rot2)).toHaveLength(1)
  })

  it('RED: duplicar trimestre — copia entradas de um ano/mês base +N semanas', () => {
    const dlg = useScheduledDialog()
    const rot = dlg.createRotation('ML')
    dlg.addEntry(rot, { dateISO: '2026-10-03', content: { kind: 'music', musicId: 22 }, name: 'ML' })
    dlg.addEntry(rot, { dateISO: '2026-10-10', content: { kind: 'music', musicId: 31 }, name: 'ML' })
    const created = dlg.duplicateQuarter(rot, { fromDate: '2026-10-03', weeks: 4 })
    expect(created).toBe(2)
    const all = dlg.entriesOf(rot)
    expect(all).toHaveLength(4)
    // +28 dias
    expect(all.map((e) => e.date)).toContain('2026-10-31')
    expect(all.map((e) => e.date)).toContain('2026-11-07')
  })
})
