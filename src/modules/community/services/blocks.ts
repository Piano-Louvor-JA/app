/**
 * Bloqueio de autores (App Store 1.2 — conteúdo gerado por usuários).
 *
 * Quem bloqueia deixa de ver as coletâneas do autor na Comunidade
 * (filtro na própria API). Paridade com apk e web.
 */

import { communityBaseUrl, communityRequest } from './community-http'
import { authHeaders } from './ranking'

export type BlockedAuthor = { id: number; name: string }

function toAuthor(row: { id_user?: unknown; displayName?: unknown }): BlockedAuthor | null {
  const id = Number(row.id_user)
  if (!Number.isInteger(id) || id <= 0) return null
  const name = typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : ''
  return { id, name }
}

/** Bloqueia o autor da coletânea. Retorna o autor bloqueado ou null. */
export async function blockAuthor(collectionId: number, sessionToken: string | null): Promise<BlockedAuthor | null> {
  if (!sessionToken) return null
  try {
    const response = await fetch(
      `${communityBaseUrl()}/collections/${collectionId}/block-author`,
      communityRequest({ method: 'POST', headers: authHeaders(sessionToken) }),
    )
    if (!response.ok) return null
    const json = (await response.json()) as { blocked?: { id_user?: unknown; displayName?: unknown } }
    return json.blocked ? toAuthor(json.blocked) : null
  } catch {
    return null
  }
}

/** Autores bloqueados. Falha → null (a UI mostra erro). */
export async function listBlockedAuthors(sessionToken: string | null): Promise<BlockedAuthor[] | null> {
  if (!sessionToken) return null
  try {
    const response = await fetch(
      `${communityBaseUrl()}/blocks`,
      communityRequest({ headers: authHeaders(sessionToken) }),
    )
    if (!response.ok) return null
    const json = (await response.json()) as { data?: Array<{ id_user?: unknown; displayName?: unknown }> }
    return (json.data ?? []).map(toAuthor).filter((a): a is BlockedAuthor => a !== null)
  } catch {
    return null
  }
}

/** Desbloqueia o autor. */
export async function unblockAuthor(userId: number, sessionToken: string | null): Promise<boolean> {
  if (!sessionToken) return false
  try {
    const response = await fetch(
      `${communityBaseUrl()}/blocks/${userId}`,
      communityRequest({ method: 'DELETE', headers: authHeaders(sessionToken) }),
    )
    return response.ok
  } catch {
    return false
  }
}
