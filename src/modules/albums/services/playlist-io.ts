import type { Playlist, PlaylistItem } from './playlist-storage'

/** Payload do arquivo de export/import de playlists (spec 28/08 RF-01/02). */
export type PlaylistsExport = {
  version: 1
  exported_at: string
  kind: 'playlists'
  playlists: Playlist[]
}

/** Serializa playlists para o formato de arquivo. */
export function serializePlaylists(playlists: Playlist[]): PlaylistsExport {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    kind: 'playlists',
    playlists: playlists.map((playlist) => ({ ...playlist })),
  }
}

function isValidItem(raw: unknown): raw is PlaylistItem {
  if (!raw || typeof raw !== 'object') return false
  const item = raw as Record<string, unknown>
  return (
    typeof item.musicId === 'number' && Number.isFinite(item.musicId) &&
    (item.albumId === null || typeof item.albumId === 'number') &&
    typeof item.title === 'string' && item.title.trim().length > 0
  )
}

function isValidPlaylist(raw: unknown): raw is Playlist {
  if (!raw || typeof raw !== 'object') return false
  const playlist = raw as Record<string, unknown>
  return (
    typeof playlist.id === 'string' &&
    typeof playlist.name === 'string' && playlist.name.trim().length > 0 &&
    Array.isArray(playlist.items)
  )
}

export type ParseResult = {
  ok: boolean
  playlists: Playlist[]
  discardedItems: number
}

/** Valida e normaliza um JSON importado; itens inválidos são descartados. */
export function parsePlaylistsImport(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, playlists: [], discardedItems: 0 }
  }

  const data = parsed as Record<string, unknown> | null
  if (!data || data.kind !== 'playlists' || data.version !== 1 || !Array.isArray(data.playlists)) {
    return { ok: false, playlists: [], discardedItems: 0 }
  }

  const playlists: Playlist[] = []
  let discardedItems = 0

  for (const entry of data.playlists) {
    if (!isValidPlaylist(entry)) continue
    const items: PlaylistItem[] = []
    for (const item of entry.items) {
      if (isValidItem(item)) items.push(item)
      else discardedItems += 1
    }
    playlists.push({
      id: entry.id,
      name: entry.name.trim(),
      items,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
    })
  }

  if (playlists.length === 0) return { ok: false, playlists: [], discardedItems }
  return { ok: true, playlists, discardedItems }
}
