import type { useScheduledStore } from '../stores/useScheduledStore'

import type { InformativoEpisode } from './informativo-source'
import { toISODateLocal } from './informativo-source'

export const INFORMATIVO_ROTATION_NAME = 'Informativo'

export interface InformativoImportReport {
  rotationId: string
  created: number
  skipped: number
  skippedPast: number
}

/** Agenda links de vídeo online, idempotente por rotação+data. */
export function importInformativoEpisodes(
  store: ReturnType<typeof useScheduledStore>,
  episodes: InformativoEpisode[],
  options?: { onlyUpcoming?: boolean },
): InformativoImportReport {
  let rotation = store.categories.find((c) => c.name === INFORMATIVO_ROTATION_NAME)
  if (!rotation) {
    const id = `rot-${Date.now()}-informativo`
    store.upsertCategory({ id, name: INFORMATIVO_ROTATION_NAME })
    rotation = { id, name: INFORMATIVO_ROTATION_NAME }
  }
  const todayISO = toISODateLocal(new Date())
  let created = 0
  let skipped = 0
  let skippedPast = 0
  for (const ep of episodes) {
    if (options?.onlyUpcoming && ep.dateISO < todayISO) {
      skippedPast++
      continue
    }
    const existing = store.findOn(rotation.id, ep.dateISO)
    // Qualquer entrada existente (música, arquivo, anotação) é dado do usuário —
    // offline-first: o 1-click jamais sobrescreve, só conta como skipped.
    if (existing) {
      skipped++
      continue
    }
    store.upsertItem({
      id: `sch-${rotation.id}-${ep.dateISO}`,
      categoryId: rotation.id,
      date: ep.dateISO,
      name: ep.title,
      content: { kind: 'online_video', url: ep.url },
    })
    created++
  }
  return { rotationId: rotation.id, created, skipped, skippedPast }
}
