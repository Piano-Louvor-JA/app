import { createLiturgyItemId } from './liturgy-item-helpers'
import { normalizeLiturgyTimeHHmm, pad2 } from './liturgy-format'
import type { CustomLiturgy, LiturgyItemType } from '../types/liturgy'

export const LITURGY_TEMPLATES = [
  { id: 'worship', icon: 'ti-building-church', moments: [['welcome', 'annotation', 5], ['openingHymn', 'music', 5], ['prayer', 'prayer', 3], ['reading', 'annotation', 5], ['offering', 'annotation', 5], ['message', 'annotation', 30], ['closingHymn', 'music', 5], ['blessing', 'prayer', 2]] },
  { id: 'sabbath', icon: 'ti-book', moments: [['welcome', 'annotation', 5], ['openingHymn', 'music', 5], ['prayer', 'prayer', 3], ['mission', 'annotation', 10], ['lesson', 'annotation', 35], ['blessing', 'prayer', 2]] },
  { id: 'prayer', icon: 'ti-pray', moments: [['welcome', 'annotation', 3], ['openingHymn', 'music', 5], ['reading', 'annotation', 7], ['requests', 'annotation', 10], ['prayer', 'prayer', 15], ['closingHymn', 'music', 5]] },
] as const
export type LiturgyTemplateId = typeof LITURGY_TEMPLATES[number]['id']

export function buildLiturgyTemplate(id: LiturgyTemplateId, t: (key: string) => string, startTime = '09:00'): CustomLiturgy | null {
  const template = LITURGY_TEMPLATES.find(template => template.id === id)
  const start = normalizeLiturgyTimeHHmm(startTime)
  if (!template || !start) return null
  const [hours, minutes] = start.split(':').map(Number)
  const endMinutes = (hours! * 60 + minutes! + template.moments.reduce((total, moment) => total + moment[2], 0)) % 1440
  const end = `${pad2(Math.floor(endMinutes / 60))}:${pad2(endMinutes % 60)}`
  const categoryId = createLiturgyItemId()
  return {
    id: createLiturgyItemId(), name: t(`liturgyPlan.templates.${id}`), notes: '', startTime: start, endTime: end,
    items: [
      { id: categoryId, type: 'category', name: t(`liturgyPlan.templates.${id}`), subtitle: '', done: false, durationMs: 0, accentColor: '#FFD600', startTime: start, endTime: end },
      ...template.moments.map(([key, type, minutes]) => ({ id: createLiturgyItemId(), type: type as LiturgyItemType, name: t(`liturgyPlan.moments.${key}`), subtitle: type === 'music' ? t('liturgyPlan.selectSong') : '', done: false, durationMs: minutes * 60000, accentColor: type === 'music' ? '#00E676' : '#9ecaff', categoryId })),
    ],
  }
}
