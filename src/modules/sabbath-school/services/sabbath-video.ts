import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { resolveMediaUrl } from '@shared/services/workspace-api'

import type { SabbathCustomVideo } from '../types/sabbath-school'

export type SabbathVideoImportResult =
  | { ok: true; video: SabbathCustomVideo }
  | { ok: false; reason: string }

const PROBE_TIMEOUT_MS = 15_000

/** Duração (ms) lida dos metadados; null se o player não abrir o arquivo. */
export function probeVideoDurationMs(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let settled = false
    const finish = (durationMs: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      resolve(durationMs)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    const readDuration = () => {
      const seconds = video.duration
      // webm gravado sem duração no cabeçalho: buscar o fim faz o player calculá-la
      if (seconds === Infinity) {
        video.currentTime = Number.MAX_SAFE_INTEGER
        return
      }
      finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null)
    }

    video.preload = 'metadata'
    video.muted = true
    video.addEventListener('loadedmetadata', readDuration)
    video.addEventListener('durationchange', readDuration)
    video.addEventListener('error', () => finish(null))
    video.src = url
  })
}

/**
 * Abre o diálogo, copia o vídeo para a pasta da Escola Sabatina (apagando o
 * anterior) e lê a duração. Vídeo que o player não abre é apagado e recusado.
 */
export async function pickAndImportSabbathVideo(): Promise<SabbathVideoImportResult> {
  const api = getDesktopBridge()?.sabbathSchool
  if (!api) return { ok: false, reason: 'unavailable' }

  const imported = await api.importVideo()
  if (!imported.ok || !imported.relativePath) return { ok: false, reason: imported.reason ?? 'error' }

  const durationMs = await probeVideoDurationMs(resolveMediaUrl(imported.relativePath))
  if (durationMs == null) {
    await api.clearVideo()
    return { ok: false, reason: 'invalid_video' }
  }

  return {
    ok: true,
    video: {
      relativePath: imported.relativePath,
      name: imported.originalName ?? imported.fileName ?? '',
      durationMs,
    },
  }
}
