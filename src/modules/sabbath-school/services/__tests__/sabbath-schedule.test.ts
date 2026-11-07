import { describe, expect, it } from 'vitest'

import { msToTime, sabbathDurationMs, timeToMs } from '../sabbath-schedule'

const at = (h: number, m: number) => new Date(2026, 9, 17, h, m, 0)
const MIN = 60_000

describe('timeToMs / msToTime', () => {
  it('HH:MM vira ms desde a meia-noite; formato inválido vira 0', () => {
    expect(timeToMs('10:15')).toBe((10 * 3600 + 15 * 60) * 1000)
    expect(timeToMs('10h15')).toBe(0)
  })

  it('ms volta a HH:MM ignorando os segundos e virando o dia', () => {
    expect(msToTime(9.5 * 3600_000)).toBe('09:30')
    expect(msToTime(25 * 3600_000 + 59_000)).toBe('01:00')
  })
})

describe('sabbathDurationMs', () => {
  it("'duration': a duração escolhida, qualquer que seja a hora", () => {
    const schedule = { scheduleMode: 'duration' as const, durationMs: 45 * MIN, endTime: '10:15' }
    expect(sabbathDurationMs(schedule, at(8, 0))).toBe(45 * MIN)
    expect(sabbathDurationMs(schedule, at(23, 0))).toBe(45 * MIN)
    expect(sabbathDurationMs({ ...schedule, durationMs: -5 }, at(8, 0))).toBe(0)
  })

  it("'endOnly': Término − agora, virando o dia se já passou", () => {
    const end = { scheduleMode: 'endOnly' as const, durationMs: 45 * MIN, endTime: '10:15' }
    expect(sabbathDurationMs(end, at(10, 0))).toBe(15 * MIN)
    expect(sabbathDurationMs(end, at(10, 30))).toBe((24 * 60 - 15) * MIN)
  })

  it("'video': a duração vem do vídeo, não da agenda", () => {
    expect(sabbathDurationMs({ scheduleMode: 'video', durationMs: 45 * MIN, endTime: '10:15' }, at(8, 0))).toBeNull()
  })

  it("'endOnly' com término inválido não tem duração", () => {
    expect(sabbathDurationMs({ scheduleMode: 'endOnly', durationMs: 45 * MIN, endTime: '' })).toBeNull()
  })
})
