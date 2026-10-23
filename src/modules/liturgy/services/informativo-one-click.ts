import type { useScheduledStore } from '../stores/useScheduledStore'

import { importInformativoEpisodes } from './informativo-import'
import {
  extractInformativoEpisode,
  informativoPostUrl,
  informativoUpcomingSaturdays,
  type InformativoEpisode,
} from './informativo-source'

export interface InformativoOneClickResult {
  created: number
  skipped: number
  skippedPast: number
  /** Nenhum post respondeu com vídeo — mensagem amigável, sem crash. */
  unavailable: boolean
}

/**
 * Fluxo 1-click do Informativo: consulta os próximos sábados (pontual, 1
 * request por semana), extrai o embed YouTube e agenda como online_video.
 * Idempotente: entrada existente é preservada (conta como skipped).
 */
export async function runInformativoOneClick(
  store: ReturnType<typeof useScheduledStore>,
  opts: {
    fetchText: (url: string) => Promise<string | null>
    onProgress?: (done: number, total: number) => void
    count?: number
  },
): Promise<InformativoOneClickResult> {
  const total = opts.count ?? 13
  const episodes: InformativoEpisode[] = []
  const saturdays = informativoUpcomingSaturdays(new Date(), total)
  for (const [week, dateISO] of saturdays.entries()) {
    opts.onProgress?.(week + 1, total)
    const text = await opts.fetchText(informativoPostUrl(dateISO))
    const episode = text ? extractInformativoEpisode(text, dateISO) : null
    if (episode) episodes.push(episode)
  }
  if (episodes.length === 0) {
    return { created: 0, skipped: 0, skippedPast: 0, unavailable: true }
  }
  const report = importInformativoEpisodes(store, episodes, { onlyUpcoming: true })
  return { ...report, unavailable: false }
}
