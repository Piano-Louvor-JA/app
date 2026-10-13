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

  it('RED: cadastro manual mínimo aceita data + número do hino sem título', () => {
    const dlg = useScheduledDialog()
    const rotation = dlg.createRotation('Hino Inicial')

    dlg.addEntry(rotation, {
      dateISO: '2026-10-03',
      content: { kind: 'music', musicId: 15 },
      name: 'Hino 15',
    })

    expect(dlg.entriesOf(rotation)).toMatchObject([
      { date: '2026-10-03', name: 'Hino 15', content: { kind: 'music', musicId: 15 } },
    ])
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

describe('agendar qualquer item (vídeo online)', () => {
  it('aceita vídeo online (YouTube/Vimeo) como conteúdo agendado', () => {
    const dlg = useScheduledDialog()
    const rot = dlg.createRotation('Vídeos do culto')
    dlg.addEntry(rot, {
      dateISO: '2026-10-10',
      content: { kind: 'online_video', url: 'https://youtube.com/watch?v=abc', name: 'Clipe' },
      name: 'Clipe',
    })
    const items = dlg.entriesOf(rot)
    expect(items[0]!.content?.kind).toBe('online_video')
    expect(items[0]!.content?.url).toContain('youtube.com')
  })
})

describe('colar link de vídeo', () => {
  it('URL http(s) colada vira online_video (não file)', () => {
    const dlg = useScheduledDialog()
    const rot = dlg.createRotation('Vídeos')
    dlg.applyQuarterPaste('10/10\nvideo: https://youtube.com/watch?v=abc123', {
      year: 2026,
      slotMapping: { video: rot },
    })
    const items = dlg.entriesOf(rot)
    expect(items[0]!.content?.kind).toBe('online_video')
    expect(items[0]!.content?.url).toBe('https://youtube.com/watch?v=abc123')
  })
})

describe('modo newbie — slot desconhecido cria rotação sozinho', () => {
  it('slot "inicial es" não mapeado vira rotação "Inicial Es" com todas as entradas', () => {
    const dlg = useScheduledDialog()
    const report = dlg.applyQuarterPaste(
      '03/10\ninicial es: 278\nfinal es: 435\n\n10/10\ninicial es: 123\nfinal es: 307',
      { year: 2026, slotMapping: {}, autoCreateSlots: true },
    )
    // 4 entradas criadas, ZERO pendentes
    expect(report.created).toBe(4)
    expect(report.unmappedSlots).toHaveLength(0)

    // rotações criadas com o nome do slot (bonitinho) — só as novas deste paste
    const names = dlg.rotations.value
      .filter((r) => ['Inicial Es', 'Final Es'].includes(r.name))
      .map((r) => r.name)
      .sort()
    expect(names).toEqual(['Final Es', 'Inicial Es'])

    // entradas na rotação certa
    const rot = dlg.rotations.value.find((r) => r.name === 'Inicial Es')!
    expect(dlg.entriesOf(rot.id).map((e) => e.date)).toEqual(['2026-10-03', '2026-10-10'])
  })

  it('mapping explícito ainda vence quando fornecido (backward-compat)', () => {
    const dlg = useScheduledDialog()
    const manual = dlg.createRotation('Minha Rotação')
    dlg.applyQuarterPaste('03/10\nslotx: 55', { year: 2026, slotMapping: { slotx: manual }, autoCreateSlots: true })
    const rotNames = dlg.rotations.value.map((r) => r.name)
    expect(rotNames).toContain('Minha Rotação')
    expect(rotNames).not.toContain('Slotx')
    expect(dlg.entriesOf(manual)).toHaveLength(1)
  })
})

describe('modo form — adicionar por data sem escolher rotação antes', () => {
  it('adiciona na rotação default criada sob demanda (Provai e Vede)', () => {
    const dlg = useScheduledDialog()
    const rotId = dlg.ensureDefaultRotation()
    expect(dlg.rotations.value.some((r) => r.id === rotId)).toBe(true)
    expect(dlg.rotations.value.find((r) => r.id === rotId)!.name).toBe('Provai e Vede')

    // segunda chamada REUSA a mesma rotação (não duplica)
    const rotId2 = dlg.ensureDefaultRotation()
    expect(rotId2).toBe(rotId)

    dlg.addEntry(rotId, { dateISO: '2026-10-10', content: { kind: 'music', musicId: 55 }, name: 'Hino 55' })
    expect(dlg.entriesOf(rotId)).toHaveLength(1)
  })

  it('todasAsEntradasPorData: lista plana de todas as rotações ordenada por data', () => {
    const dlg = useScheduledDialog()
    const a = dlg.createRotation('A')
    const b = dlg.createRotation('B')
    dlg.addEntry(b, { dateISO: '2026-10-03', content: { kind: 'music', musicId: 1 }, name: 'X' })
    dlg.addEntry(a, { dateISO: '2026-10-10', content: { kind: 'music', musicId: 2 }, name: 'Y' })
    dlg.addEntry(a, { dateISO: '2026-09-26', content: { kind: 'music', musicId: 3 }, name: 'Z' })

    const all = dlg.entriesByDate.value.filter((e) => ['X', 'Y', 'Z'].includes(e.name))
    expect(all.map((e) => e.date)).toEqual(['2026-09-26', '2026-10-03', '2026-10-10'])
    // o nome da rotação vem junto na grade (sem precisar saber o id)
    expect(all.map((e) => e.rotationName)).toEqual(expect.arrayContaining(['A', 'B']))
  })
})

describe('busca de música no modo form (mesma do item de música)', () => {
  it(
    'filterLiturgyMusicOptions acha por título e número do hinário',
    { timeout: 20_000 },
    async () => {
    const { filterLiturgyMusicOptions } = await import(
      '../services/liturgy-catalog'
    )
    const options = [
      { id: 278, name: 'A Voz de Deus', albumNames: 'Hinario Adventista', hymnalTrack: 278, durationMs: 180_000 },
      { id: 1660, name: 'Missão', albumNames: 'Adoradores 4', hymnalTrack: null, durationMs: 194_000 },
    ] as never

    const byTitle = filterLiturgyMusicOptions(options, 'voz', null)
    expect(byTitle.map((o) => o.id)).toContain(278)

    const byTrack = filterLiturgyMusicOptions(options, '278', null)
    expect(byTrack.map((o) => o.id)).toContain(278)

    const byCommunity = filterLiturgyMusicOptions(options, 'missão', null)
    expect(byCommunity.map((o) => o.id)).toContain(1660)
    },
  )
})
