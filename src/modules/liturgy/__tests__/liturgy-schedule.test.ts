import { describe, expect, it } from 'vitest'
import { buildLiturgySchedule, exportScheduleCsv } from '../services/liturgy-schedule'
import type { LiturgyItem } from '../types/liturgy'
const moment = (id: string, minutes: number, extra: Partial<LiturgyItem> = {}): LiturgyItem => ({ id, name: id, type: 'annotation', subtitle: '', done: false, durationMs: minutes * 60000, accentColor: '#fff', ...extra })

describe('Cronograma do culto', () => {
  it('calcula horários de cada momento com início da sessão ou da categoria', () => {
    const schedule = buildLiturgySchedule([moment('abertura', 5), moment('leitura', 10), moment('sessão', 0, { type: 'category', startTime: '10:00' }), moment('mensagem', 30)], '09:00')
    expect(schedule.rows.map(row => row.startLabel)).toEqual(['09:00', '09:05', '10:00', '10:00'])
    expect(schedule.endLabel).toBe('10:30')
    expect(schedule.totalDurationMs).toBe(45 * 60000)
  })
  it('mantém a virada do dia e não inventa horários após duração desconhecida', () => {
    expect(buildLiturgySchedule([moment('oração', 15), moment('leitura', 10)], '23:50').rows[1]?.startLabel).toBe('00:05 (+1)')
    const schedule = buildLiturgySchedule([moment('sem duração', 0), moment('próximo', 10)], '09:00')
    expect(schedule.rows[1]?.startLabel).toBe('—')
    expect(schedule.endLabel).toBe('—')
    expect(schedule.unknownDurations).toBe(1)
  })
  it('exporta os dados corretos e neutraliza fórmulas de planilha', () => {
    const schedule = buildLiturgySchedule([moment('=HYPERLINK("x")', 5, { responsible: 'Marie; Jean', notes: 'ligne 1\nligne 2' })], '09:00')
    const csv = exportScheduleCsv(schedule, ['Ordem', 'Horário', 'Momento', 'Duração', 'Responsável', 'Notas'])
    expect(csv).toContain('"\'=HYPERLINK(""x"")"')
    expect(csv).toContain('"Marie; Jean"')
    expect(csv).toContain('09:00')
    expect(csv).toContain('ligne 1\nligne 2')
  })
})
