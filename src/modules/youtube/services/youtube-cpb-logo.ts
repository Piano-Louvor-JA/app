import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import { CPB_CHANNEL } from './youtube-channels'

/**
 * Logo oficial da Casa Publicadora Brasileira: a foto do canal dela no
 * YouTube, buscada pelo app (main) e guardada como imagem embutida — aparece
 * na hora nas próximas aberturas, inclusive sem internet.
 */
const DATA_IMAGE = /^data:image\/(jpeg|png|webp|gif);base64,/

export function cachedCpbLogo(): string {
  const value = getUserPreference<string>(USER_PREFERENCE_KEYS.youtubeCpbLogo, '')
  return typeof value === 'string' && DATA_IMAGE.test(value) ? value : ''
}

let refreshedThisSession = false

/** Uma busca por sessão do app quando já há logo guardado. */
export async function refreshCpbLogo(): Promise<string> {
  if (refreshedThisSession && cachedCpbLogo()) return cachedCpbLogo()
  refreshedThisSession = true
  try {
    const result = await getDesktopBridge()?.ytSearch?.channelLogo?.(CPB_CHANNEL.url)
    const dataUrl = result?.dataUrl ?? ''
    if (DATA_IMAGE.test(dataUrl)) {
      setUserPreference(USER_PREFERENCE_KEYS.youtubeCpbLogo, dataUrl)
      return dataUrl
    }
  } catch {
    // mantém o guardado
  }
  return cachedCpbLogo()
}

/** Para testes: permite buscar de novo na mesma sessão. */
export function resetCpbLogoSession() {
  refreshedThisSession = false
}
