import { getDesktopBridge, isElectronShell } from '@shared/services/desktop-bridge'
import { defaultFilesBase } from '@shared/services/api-env'

/** Remove prefix de pasta pública (`/musics/`, `/images/`, `/covers/`, etc.). */
export function toRelativeMediaPath(urlPath: string): string {
  let path = urlPath.trim()
  if (!path) return ''

  path = path.replace(/^https?:\/\/[^/]+\/(?:file\/)?/i, '')
  path = path.replace(/^\/+/, '')
  path = path.replace(/^(musics|images|covers|imagens|capas|musicas)\//i, '')
  return path
}

/** URL HTTP do arquivo remoto (capas ainda não baixadas). */
export function resolveRemoteFileUrl(urlPath: string): string {
  // API oficial (14/09/2026): url_image/url_music agora vêm como URL absoluta
  // (host próprio do Mayco ou R2/Cloudflare) — usar na íntegra, sem remontar.
  if (/^https?:\/\//i.test(urlPath)) return urlPath
  const cleanPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
  const base = import.meta.env.VITE_URL_FILES ?? defaultFilesBase()
  return `${base}/${cleanPath}`
}

/**
 * URL de exibição sem checar disco.
 * No Electron prefere `local://` (pode cair no fallback HTTP do protocolo se faltar).
 */
export function resolveCoverDisplayUrl(urlPath: string | null | undefined): string | null {
  if (!urlPath) return null
  const relative = toRelativeMediaPath(urlPath).replace(/\\/g, '/')
  if (!relative) return resolveRemoteFileUrl(urlPath)

  if (isElectronShell()) {
    return `local://media/covers/${relative}`
  }

  return resolveRemoteFileUrl(urlPath)
}

/**
 * Resolve capas com **um** IPC: usa `local://` só se o arquivo existir no disco.
 * Assim a UI não espera o fallback assíncrono da API no protocolo.
 */
export async function resolveCoverUrlsFromDisk(
  rawUrls: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const relativesByRaw = new Map<string, string>()

  for (const raw of rawUrls) {
    if (!raw || relativesByRaw.has(raw)) continue
    const relative = toRelativeMediaPath(raw).replace(/\\/g, '/')
    if (!relative) continue
    relativesByRaw.set(raw, relative)
  }

  if (relativesByRaw.size === 0) return result

  const bridge = getDesktopBridge()
  const uniqueRelatives = [...new Set(relativesByRaw.values())]

  /** @type {Record<string, string | false>} */
  let checked: Record<string, string | false> = {}

  if (bridge?.media.checkMany) {
    checked = await bridge.media.checkMany('covers', uniqueRelatives)
  } else if (bridge?.media.check) {
    await Promise.all(
      uniqueRelatives.map(async (relative) => {
        checked[relative] = await bridge.media.check('covers', relative)
      }),
    )
  }

  for (const [raw, relative] of relativesByRaw) {
    const local = checked[relative]
    if (typeof local === 'string' && local) {
      result.set(raw, local)
    } else {
      result.set(raw, resolveRemoteFileUrl(raw))
    }
  }

  return result
}
