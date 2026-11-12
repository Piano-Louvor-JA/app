import { ref } from 'vue'

import { notifyObsChanged, type ObsModule } from './obs-connections'
import { palcoTvKey, palcoTvTarget, setPalcoTvPinned, type PalcoClient } from './palco-clients'
import { palcoSession } from './palco-session'

export type PalcoTvMode = 'overlay' | 'share'

/**
 * Projeção independente nas TVs do Palco (paridade com as Conexões Remotas
 * do OBS): a TV marcada num módulo sai da transmissão geral e mostra só
 * esse módulo. Chave = a mesma do servidor (id da TV ou IP + plataforma).
 */
export const tvAssignments = ref<Record<string, ObsModule>>({})
/**
 * Sobrepor: a TV sai da transmissão e mostra só o módulo.
 * Compartilhar: a TV segue na transmissão e o módulo ocupa metade da tela.
 */
export const tvAssignmentModes = ref<Record<string, PalcoTvMode>>({})

export async function assignPalcoTv(tv: PalcoClient, module: ObsModule | null, mode: PalcoTvMode = 'overlay'): Promise<void> {
  const key = palcoTvKey(tv)
  const wasShared = tvAssignmentModes.value[key] === 'share'
  const next = { ...tvAssignments.value }
  const modes = { ...tvAssignmentModes.value }
  if (module) { next[key] = module; modes[key] = mode }
  else { delete next[key]; delete modes[key] }
  tvAssignments.value = next
  tvAssignmentModes.value = modes
  await setPalcoTvPinned(tv, module !== null && mode === 'overlay')
  // Saiu do compartilhar: a TV volta a ter a tela inteira.
  if (wasShared && (!module || mode !== 'share')) palcoSession.syncTvShare(palcoTvTarget(tv), false)
  notifyObsChanged()
}

/** Encerrou a projeção independente do módulo: as TVs dele voltam à transmissão. */
export async function clearPalcoTvModule(module: string, tvs: PalcoClient[]): Promise<void> {
  for (const tv of tvs) {
    if (tvAssignments.value[palcoTvKey(tv)] === module) await assignPalcoTv(tv, null)
  }
}
