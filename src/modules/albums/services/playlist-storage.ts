import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

const PLAYLISTS_STORAGE_KEY = BROWSER_STORAGE_KEYS.playlists

export type PlaylistItem = {
  musicId: number
  albumId: number | null
  title: string
}

export type Playlist = {
  id: string
  name: string
  items: PlaylistItem[]
  createdAt: string
  updatedAt: string
}

function read(): Playlist[] {
  try {
    const value = localStorage.getItem(PLAYLISTS_STORAGE_KEY)
    const parsed: unknown = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? (parsed as Playlist[]) : []
  } catch {
    return []
  }
}

function save(playlists: Playlist[]): void {
  localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists))
}

function now(): string {
  return new Date().toISOString()
}

export function listPlaylists(): Playlist[] {
  return read()
}

/** Salva a lista inteira (usado pelo import/merge de arquivos). */
export function savePlaylists(playlists: Playlist[]): void {
  save(playlists)
}

export function createPlaylist(name: string): Playlist {
  const timestamp = now()
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    items: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  save([...read(), playlist])
  return playlist
}

export function renamePlaylist(id: string, name: string): Playlist | null {
  const playlists = read()
  const playlist = playlists.find((entry) => entry.id === id)
  if (!playlist) return null
  playlist.name = name.trim()
  playlist.updatedAt = now()
  save(playlists)
  return playlist
}

export function deletePlaylist(id: string): boolean {
  const playlists = read()
  const next = playlists.filter((playlist) => playlist.id !== id)
  if (next.length === playlists.length) return false
  save(next)
  return true
}

export type AddPlaylistItemResult = {
  playlist: Playlist
  added: boolean
}

export function addPlaylistItem(id: string, item: PlaylistItem): AddPlaylistItemResult | null {
  const playlists = read()
  const playlist = playlists.find((entry) => entry.id === id)
  if (!playlist) return null
  const last = playlist.items.at(-1)
  // Evita toque duplo criar a mesma faixa duas vezes seguidas.
  const added = last?.musicId !== item.musicId || last.albumId !== item.albumId
  if (added) {
    playlist.items.push(item)
    playlist.updatedAt = now()
    save(playlists)
  }
  return { playlist, added }
}

export function removePlaylistItem(id: string, index: number): Playlist | null {
  const playlists = read()
  const playlist = playlists.find((entry) => entry.id === id)
  if (!playlist || index < 0 || index >= playlist.items.length) return null
  playlist.items.splice(index, 1)
  playlist.updatedAt = now()
  save(playlists)
  return playlist
}

export function movePlaylistItem(id: string, from: number, to: number): Playlist | null {
  const playlists = read()
  const playlist = playlists.find((entry) => entry.id === id)
  if (!playlist || !Number.isInteger(from) || !Number.isInteger(to) ||
    from < 0 || to < 0 || from >= playlist.items.length || to >= playlist.items.length) return null
  const [item] = playlist.items.splice(from, 1)
  playlist.items.splice(to, 0, item!)
  playlist.updatedAt = now()
  save(playlists)
  return playlist
}
