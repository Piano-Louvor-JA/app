import { useMediaStore } from '../stores/useMediaStore'
import type { MediaOpenResult, MediaPlaybackMode } from '../types/media'

export type OpenMusicPlayerParams = {
  musicId: number
  mode: MediaPlaybackMode
  albumId?: number | null
  /** Quando omitido, projeta apenas em `no_audio` (contrato Álbuns). */
  project?: boolean
}

/**
 * Abre o player de mídia no mesmo contrato dos Álbuns:
 * cantado / playback / sem áudio (+ projeção quando aplicável).
 */
export async function openMusicPlayer(
  params: OpenMusicPlayerParams,
): Promise<MediaOpenResult> {
  const musicId = Number(params.musicId)
  // app#331: negativo = música LOCAL (import .slja sem login) — válido.
  // Só 0/NaN (sem música) continua fora.
  if (!Number.isFinite(musicId) || musicId === 0) {
    return { ok: false, messageKey: 'media.messages.trackMissing' }
  }

  const mode = params.mode
  const mediaStore = useMediaStore()

  // project: repassar SEM RESOLVER (decisão Rafael 27/08). O contrato do
  // store é opt-out: undefined = projetar se houver destino ATIVO (monitor
  // estendido OU TV Palco conectada); false explícito = não projetar.
  // O legado (?? mode==='no_audio') convertia undefined→false e o hino
  // cantado nunca projetava sozinho — só via botão manual.
  const result = await mediaStore.open({
    musicId,
    mode,
    albumId: params.albumId ?? null,
    minimized: false,
    project: params.project,
  })

  if (!result.ok) return result

  mediaStore.maximize()

  return result
}
