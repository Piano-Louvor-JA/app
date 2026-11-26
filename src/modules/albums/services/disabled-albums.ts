import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

/**
 * Álbuns desativados (paridade com o "Ignorar álbuns" do Classic): as músicas
 * deles aparecem desativadas na busca e o seletor pula. Preferência local
 * (offline-first), por chave de álbum — a mesma do card da Central de Mídia:
 * hinários por `hymnal`/`hymnal_1996`, demais pelo id do álbum.
 */
export const DISABLED_ALBUMS_PREFERENCE = 'disabledAlbums'

export function loadDisabledAlbums(): string[] {
  const stored = getUserPreference<unknown>(DISABLED_ALBUMS_PREFERENCE, [])
  if (!Array.isArray(stored)) return []
  return [...new Set(stored.filter((key): key is string => typeof key === 'string' && key.length > 0))]
}

export function saveDisabledAlbums(keys: string[]): void {
  setUserPreference(
    DISABLED_ALBUMS_PREFERENCE,
    [...new Set(keys.filter((key) => typeof key === 'string' && key.length > 0))],
  )
}

type AlbumRef = { id_album?: number | string | null; name?: string | null; type?: string | null }

/** Chave do álbum de uma música do catálogo (mesma do card do álbum). */
export function albumDisableKey(album: AlbumRef): string | null {
  const type = String(album.type ?? '').toLowerCase()
  const name = String(album.name ?? '')
  // O catálogo às vezes manda "Hinario" sem acento.
  const folded = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (type === 'hymnal_1996') return 'hymnal_1996'
  if (type === 'hymnal') return name.includes('1996') ? 'hymnal_1996' : 'hymnal'
  if (folded.includes('hinario adventista')) return name.includes('1996') ? 'hymnal_1996' : 'hymnal'
  const id = Number(album.id_album)
  return Number.isFinite(id) && id > 0 ? String(id) : null
}
