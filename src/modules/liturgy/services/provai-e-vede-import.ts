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

export const PROVAI_E_VEDE_ROTATION_NAME = 'Provai e Vede'

export interface ProvaiImportReport {
  rotationId: string
  created: number
  skipped: number
}

export function importProvaiEVedeEpisodes(
  store: ReturnType<typeof useScheduledStore>,
  episodes: ProvaiEpisode[],
  resolveLocalPath: (ep: ProvaiEpisode) => string,
): ProvaiImportReport {
  // Rotação: reusa se já existe (nome exato), senão cria.
  let rotation = store.categories.find((c) => c.name === PROVAI_E_VEDE_ROTATION_NAME)
  if (!rotation) {
    const id = `rot-${Date.now()}-pv`
    store.upsertCategory({ id, name: PROVAI_E_VEDE_ROTATION_NAME })
    rotation = { id, name: PROVAI_E_VEDE_ROTATION_NAME }
  }
  const rotationId = rotation.id

  let created = 0
  let skipped = 0
  for (const ep of episodes) {
    const existing = store.findOn(rotationId, ep.dateISO)
    if (existing) {
      skipped++
      continue
    }
    store.upsertItem({
      id: `sch-${rotationId}-${ep.dateISO}`,
      categoryId: rotationId,
      date: ep.dateISO,
      name: ep.title,
      content: { kind: 'file', filePath: resolveLocalPath(ep) },
    })
    created++
  }

  return { rotationId, created, skipped }
}
