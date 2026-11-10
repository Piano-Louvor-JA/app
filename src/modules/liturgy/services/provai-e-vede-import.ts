/**
 * Importa episódios do Provai e Vede (extraídos por `provai-e-vede-source.ts`)
 * para o store de agendados: cria a rotação "Provai e Vede" se não existir e
 * agenda cada episódio como conteúdo `file` na data do arquivo.
 *
 * O download em si é responsabilidade do chamador (bridge desktop / browser):
 * `resolveLocalPath(ep)` recebe o episódio e devolve o caminho LOCAL já baixado.
 * Idempotente: entrada existente na mesma rotação+data não é duplicada.
 */
import type { useScheduledStore } from '../stores/useScheduledStore'

import type { ProvaiEpisode } from './provai-e-vede-source'
import type { ProvaiSourceLanguage } from './provai-e-vede-catalog'

export const PROVAI_E_VEDE_ROTATION_NAME = 'Provai e Vede'
export const PROBAD_Y_VED_ROTATION_NAME = 'Probad y Ved'

const ROTATION_BY_LANGUAGE: Record<ProvaiSourceLanguage, string> = {
  pt: PROVAI_E_VEDE_ROTATION_NAME,
  es: PROBAD_Y_VED_ROTATION_NAME,
}

export interface ProvaiImportReport {
  rotationId: string
  created: number
  skipped: number
  /** Episódios ignorados por serem de sábados já passados (onlyUpcoming). */
  skippedPast: number
}

export async function importProvaiEVedeEpisodes(
  store: ReturnType<typeof useScheduledStore>,
  episodes: ProvaiEpisode[],
  resolveLocalPath: (ep: ProvaiEpisode) => string | Promise<string>,
  options?: { onlyUpcoming?: boolean; sourceLanguage?: ProvaiSourceLanguage },
): Promise<ProvaiImportReport> {
  // Rotação canônica da EDIÇÃO (ADR-03): PT "Provai e Vede", ES "Probad y Ved".
  // Coleções distintas — nunca mescladas. Reuso por nome exato mantém a
  // compatibilidade com rotações PT criadas por versões anteriores.
  const rotationName = ROTATION_BY_LANGUAGE[options?.sourceLanguage ?? 'pt']
  let rotation = store.categories.find((c) => c.name === rotationName)
  if (!rotation) {
    const id = `rot-${Date.now()}-pv-${options?.sourceLanguage ?? 'pt'}`
    store.upsertCategory({ id, name: rotationName })
    rotation = { id, name: rotationName }
  }
  const rotationId = rotation.id

  const todayISO = new Date().toISOString().slice(0, 10)
  let created = 0
  let skipped = 0
  let skippedPast = 0
  for (const ep of episodes) {
    // 1-click: doQuarter inteiro, mas só interessa o que ainda vem.
    if (options?.onlyUpcoming && ep.dateISO < todayISO) {
      skippedPast++
      continue
    }
    const existing = store.findOn(rotationId, ep.dateISO)
    // Entrada criada numa tentativa anterior sem download não é "pronta":
    // baixa agora e substitui o filePath vazio. Entradas completas continuam idempotentes.
    if (existing?.content?.filePath) {
      skipped++
      continue
    }
    const localPath = await resolveLocalPath(ep)
    store.upsertItem({
      id: existing?.id ?? `sch-${rotationId}-${ep.dateISO}`,
      categoryId: rotationId,
      date: ep.dateISO,
      name: ep.title,
      content: { kind: 'file', filePath: localPath },
    })
    if (existing) skipped++
    else created++
  }

  return { rotationId, created, skipped, skippedPast }
}
