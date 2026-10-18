import type { LiturgyItem } from '../types/liturgy'
import { normalizeLiturgyTimeHHmm, pad2, formatElapsed } from './liturgy-format'

export interface ScheduledLiturgyRow { item: LiturgyItem; startLabel: string; endLabel: string; durationMs: number }
export interface LiturgySchedule { rows: ScheduledLiturgyRow[]; totalDurationMs: number; unknownDurations: number; endLabel: string }
const DAY = 86400000
function timeMs(value?: string | null): number | null {
  const valid = normalizeLiturgyTimeHHmm(value)
  if (!valid) return null
  const [hours, minutes] = valid.split(':').map(Number)
  return hours! * 3600000 + minutes! * 60000
}
function label(ms: number | null): string {
  if (ms == null) return '—'
  const time = ((ms % DAY) + DAY) % DAY
  const day = Math.floor(ms / DAY)
  return `${pad2(Math.floor(time / 3600000))}:${pad2(Math.floor(time % 3600000 / 60000))}${day > 0 ? ` (+${day})` : ''}`
}

/** Horários estimados, sem atribuir duração fictícia a momentos não preenchidos. */
export function buildLiturgySchedule(items: LiturgyItem[], sessionStart?: string | null): LiturgySchedule {
  let cursor = timeMs(sessionStart)
  let lastKnown = cursor ?? 0
  let totalDurationMs = 0, unknownDurations = 0
  const rows = items.map(item => {
    if (item.type === 'category') {
      const anchor = timeMs(item.startTime)
      if (anchor != null) {
        cursor = anchor
        while (cursor < lastKnown) cursor += DAY
        lastKnown = cursor
      }
      return { item, startLabel: label(cursor), endLabel: label(cursor), durationMs: 0 }
    }
    const durationMs = Number.isFinite(item.durationMs) && item.durationMs > 0 ? item.durationMs : 0
    totalDurationMs += durationMs
    const startLabel = label(cursor)
    if (!durationMs) { unknownDurations++; cursor = null }
    else if (cursor != null) { cursor += durationMs; lastKnown = cursor }
    return { item, startLabel, endLabel: label(cursor), durationMs }
  })
  return { rows, totalDurationMs, unknownDurations, endLabel: items.length ? label(cursor) : '—' }
}

/** CSV UTF-8 avec BOM, champs cités et neutralisation des formules de tableur. */
export function exportScheduleCsv(schedule: LiturgySchedule, headers: string[]): string {
  const field = (value: string) => {
    const safe = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
  }
  return '\uFEFF' + [headers, ...schedule.rows.map((row, index) => [String(index + 1), row.startLabel, row.item.name, row.durationMs ? formatElapsed(row.durationMs) : '', row.item.responsible ?? '', row.item.notes || row.item.subtitle || ''])].map(row => row.map(field).join(';')).join('\r\n')
}
