/**
 * RF-03 (SPEC-crud-comunidade-hub v1.0.0): /albums (Central de Mídia) lista
 * APENAS catálogo oficial + coletâneas do PRÓPRIO usuário (locais e
 * sincronizadas). Coletâneas públicas de terceiros ficam em /community.
 *
 * Regra:
 * - locais (id negativo): sempre do dispositivo → entram.
 * - logado: remota com ownerId === id_user entra.
 * - deslogado ou ownerId divergente/null-remota: fora.
 */
import type { CustomCollectionSummary } from '@modules/media/services/custom-catalog'
import { getAuthSession } from '@modules/media/services/auth-client'

export function filterCustomCollectionsForAlbums(
  collections: CustomCollectionSummary[],
): CustomCollectionSummary[] {
  const userId = getAuthSession()?.user?.id_user ?? null
  return collections.filter((c) => {
    if (c.id < 0) return true // local: ids negativos são desta máquina
    return userId != null && c.ownerId === userId
  })
}
