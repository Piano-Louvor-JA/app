import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { YoutubeChannelResult, YoutubeChannelSearchResult, YoutubePlaylistResult, YoutubeSearchItem } from '@shared/types/desktop-bridge'

import { filterYoutubeHistory } from './youtube-history'
import { fetchYoutubePlaylist } from './youtube-player'

/**
 * Playlist de um canal. Capa: `thumbnail` (canais cadastrados) ou a miniatura do
 * `coverVideoId` (canais padrão, o primeiro vídeo da playlist).
 */
export type YoutubeChannelPlaylist = {
  id: string
  name: string
  coverVideoId?: string
  thumbnail?: string
  videoCount?: number
}

/**
 * Canal que já vem no app (somente leitura). As playlists são fixas; os vídeos
 * de cada uma são lidos do YouTube quando a pessoa abre (sempre atualizados).
 * `merged`: abrir o canal lista os vídeos de todas as playlists numa só lista.
 */
export type YoutubeChannel = {
  id: string
  name: string
  subtitle?: string
  url: string
  merged?: boolean
  /** Id do canal no YouTube (`UC…`). */
  youtubeId?: string
  avatar?: string
  /** Cadastrado pelo operador (pode excluir); os padrão vêm no código. */
  userAdded?: boolean
  addedAt?: number
  playlists: readonly YoutubeChannelPlaylist[]
}

/** Casa Publicadora Brasileira: o Novo Hinário Adventista completo (hinos 1 a 600+). */
export const CPB_CHANNEL: YoutubeChannel = {
  id: 'cpb',
  name: 'Casa Publicadora Brasileira',
  subtitle: 'Novo Hinário Adventista',
  url: 'https://www.youtube.com/@casapublicadora',
  youtubeId: 'UCQhkLOO40bmTMeLcbspKW8A',
  merged: true,
  playlists: [
    { id: 'PLAPpcKnpMfeO9Fydpl1tTKC9CRRnIMMSK', name: 'Novo Hinário Adventista 1 - 100', coverVideoId: 'FDpludwY46U' },
    { id: 'PLAPpcKnpMfeOsWzlaY0bXm1Q5pnQQxn_y', name: 'Novo Hinário Adventista 101 - 200', coverVideoId: 'yey65PRKnwY' },
    { id: 'PLAPpcKnpMfeMnCMuGcdWKVkgpi2P_sRkE', name: 'Novo Hinário Adventista 201 - 300', coverVideoId: 'kUuN3BnJnaI' },
    { id: 'PLAPpcKnpMfeNIrE1nk3w2OkcUdxuY6y1l', name: 'Novo Hinário Adventista 301 - 400', coverVideoId: 'X6AAFwBkfEM' },
    { id: 'PLAPpcKnpMfePvD6DLI-Y5TR-RVVo62s6Z', name: 'Novo Hinário Adventista 401 - 500', coverVideoId: 'Dg2XiFULn3Q' },
    { id: 'PLAPpcKnpMfePWEOuIu4B4F3PVljyD8DoO', name: 'Novo Hinário Adventista 501 - 600', coverVideoId: 'FlHMYuWZK0g' },
  ],
}

const DEFAULT_YOUTUBE_CHANNELS: readonly YoutubeChannel[] = [CPB_CHANNEL]

const CHANNEL_ID = /^UC[\w-]{22}$/
const PLAYLIST_ID = /^(PL|UU|LL|FL|OL|RD)[\w-]{10,}$/

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function sanitizePlaylists(raw: unknown): YoutubeChannelPlaylist[] {
  const seen = new Set<string>()
  const list: YoutubeChannelPlaylist[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const id = str(p.id)
    const name = str(p.name).trim()
    if (!PLAYLIST_ID.test(id) || !name || seen.has(id)) continue
    seen.add(id)
    list.push({ id, name, thumbnail: str(p.thumbnail), videoCount: num(p.videoCount) })
  }
  return list
}

function sanitizeUserChannel(raw: unknown): YoutubeChannel | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const id = str(c.id)
  const name = str(c.name).trim()
  if (!CHANNEL_ID.test(id) || !name) return null
  return {
    id,
    name,
    url: str(c.url) || `https://www.youtube.com/channel/${id}`,
    youtubeId: id,
    avatar: str(c.avatar),
    userAdded: true,
    addedAt: num(c.addedAt),
    playlists: sanitizePlaylists(c.playlists),
  }
}

/** Canais cadastrados pelo operador, na ordem do cadastro. Dado inválido é descartado. */
function listUserChannels(): YoutubeChannel[] {
  const raw = getBrowserItem<unknown>(BROWSER_STORAGE_KEYS.youtubeChannels, [])
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: YoutubeChannel[] = []
  for (const item of raw) {
    const channel = sanitizeUserChannel(item)
    if (!channel || seen.has(channel.id)) continue
    seen.add(channel.id)
    list.push(channel)
  }
  return list
}

function saveUserChannels(list: YoutubeChannel[]) {
  setBrowserItem(BROWSER_STORAGE_KEYS.youtubeChannels, list.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    avatar: c.avatar ?? '',
    addedAt: c.addedAt ?? 0,
    playlists: c.playlists.map((p) => ({ id: p.id, name: p.name, thumbnail: p.thumbnail ?? '', videoCount: p.videoCount ?? 0 })),
  })))
}

/** Os canais padrão primeiro, depois os cadastrados. */
export function listYoutubeChannels(): YoutubeChannel[] {
  return [...DEFAULT_YOUTUBE_CHANNELS, ...listUserChannels()]
}

export function findYoutubeChannel(id: string | null): YoutubeChannel | null {
  if (!id) return null
  return listYoutubeChannels().find((c) => c.id === id) ?? null
}

/**
 * Cadastra (ou atualiza) o canal lido do YouTube. `default`: é um canal que já vem
 * no app; `invalid`: sem canal ou sem playlists.
 */
export function saveYoutubeChannel(result: YoutubeChannelResult, now = Date.now()): {
  status: 'added' | 'updated' | 'default' | 'invalid'
  channel: YoutubeChannel | null
  list: YoutubeChannel[]
} {
  const info = result.channel
  const builtIn = info ? DEFAULT_YOUTUBE_CHANNELS.find((c) => c.youtubeId === info.id) : undefined
  if (builtIn) return { status: 'default', channel: builtIn, list: listYoutubeChannels() }
  const playlists = sanitizePlaylists(result.playlists.map((p) => ({ id: p.id, name: p.title, thumbnail: p.thumbnail, videoCount: p.videoCount })))
  if (!info || !CHANNEL_ID.test(info.id) || !info.name.trim() || playlists.length === 0) {
    return { status: 'invalid', channel: null, list: listYoutubeChannels() }
  }
  const users = listUserChannels()
  const index = users.findIndex((c) => c.id === info.id)
  const channel: YoutubeChannel = {
    id: info.id,
    name: info.name.trim(),
    url: info.url || `https://www.youtube.com/channel/${info.id}`,
    youtubeId: info.id,
    avatar: info.avatar,
    userAdded: true,
    addedAt: index >= 0 ? users[index].addedAt : now,
    playlists,
  }
  if (index >= 0) users[index] = channel
  else users.push(channel)
  saveUserChannels(users)
  return { status: index >= 0 ? 'updated' : 'added', channel, list: listYoutubeChannels() }
}

/** Exclui um canal cadastrado (os padrão não saem). */
export function removeYoutubeChannel(id: string): YoutubeChannel[] {
  saveUserChannels(listUserChannels().filter((c) => c.id !== id))
  return listYoutubeChannels()
}

/** Pesquisa canais sobre o tema (o app desktop acrescenta "adventista"). Nunca lança. */
export async function searchAdventistChannels(query: string): Promise<YoutubeChannelSearchResult> {
  const api = getDesktopBridge()?.ytSearch
  if (!api?.channels) return { items: [], error: 'unavailable' }
  try {
    return (await api.channels(query)) ?? { items: [], error: 'network' }
  } catch {
    return { items: [], error: 'network' }
  }
}

/** Lê o canal no YouTube pelo app desktop (link, @handle ou id). Nunca lança. */
export async function fetchYoutubeChannelInfo(text: string): Promise<YoutubeChannelResult> {
  const api = getDesktopBridge()?.ytSearch
  if (!api?.channel) return { channel: null, playlists: [], error: 'unavailable' }
  try {
    return (await api.channel(text)) ?? { channel: null, playlists: [], error: 'network' }
  } catch {
    return { channel: null, playlists: [], error: 'network' }
  }
}

export function findYoutubeChannelPlaylist(channel: YoutubeChannel | null, playlistId: string | null): YoutubeChannelPlaylist | null {
  return channel?.playlists.find((p) => p.id === playlistId) ?? null
}

export function playlistCover(playlist: YoutubeChannelPlaylist): string {
  if (playlist.thumbnail) return playlist.thumbnail
  return playlist.coverVideoId ? `https://i.ytimg.com/vi/${playlist.coverVideoId}/hqdefault.jpg` : ''
}

/** Mosaico do card do canal: as capas das 4 primeiras playlists (sem capas, o avatar). */
export function channelCovers(channel: YoutubeChannel): string[] {
  const covers = channel.playlists.map(playlistCover).filter(Boolean).slice(0, 4)
  if (covers.length > 0) return covers
  return channel.avatar ? [channel.avatar] : []
}

/** Vídeos de uma playlist do canal. `error`: `empty`, `network`, `unavailable`, `http-<status>`… */
export type ChannelPlaylistLoad = { items: YoutubeSearchItem[]; error?: string }

/**
 * Lê as playlists dos canais com cache em memória: abrir de novo a mesma
 * playlist não vai à rede, e pedidos simultâneos viram um só. Erro não é guardado.
 */
export function createChannelPlaylistLoader(fetcher: (id: string) => Promise<YoutubePlaylistResult> = fetchYoutubePlaylist) {
  const cache = new Map<string, YoutubeSearchItem[]>()
  const pending = new Map<string, Promise<ChannelPlaylistLoad>>()

  async function fetchOnce(id: string): Promise<ChannelPlaylistLoad> {
    try {
      const result = await fetcher(id)
      if (result.items.length > 0) {
        cache.set(id, result.items)
        return { items: result.items }
      }
      return { items: [], error: result.error || 'empty' }
    } catch {
      return { items: [], error: 'network' }
    }
  }

  return {
    cached(id: string): YoutubeSearchItem[] | null {
      return cache.get(id) ?? null
    },
    load(id: string, { force = false }: { force?: boolean } = {}): Promise<ChannelPlaylistLoad> {
      const hit = cache.get(id)
      if (hit && !force) return Promise.resolve({ items: hit })
      const running = pending.get(id)
      if (running) return running
      const request = fetchOnce(id).finally(() => pending.delete(id))
      pending.set(id, request)
      return request
    },
  }
}

/** Um por app: as playlists abertas ficam guardadas enquanto o app está aberto. */
export const channelPlaylists = createChannelPlaylistLoader()

type PlaylistLoader = Pick<ReturnType<typeof createChannelPlaylistLoader>, 'load'>

/**
 * Canal unido: os vídeos de todas as playlists, na ordem delas, sem repetir.
 * Se alguma playlist falhar, devolve o erro (e nenhum vídeo) para não mostrar o
 * hinário pela metade; as que deram certo ficam no cache e a nova tentativa só
 * busca as que faltaram.
 */
export async function loadChannelVideos(channel: YoutubeChannel, loader: PlaylistLoader = channelPlaylists): Promise<ChannelPlaylistLoad> {
  const results = await Promise.all(channel.playlists.map((p) => loader.load(p.id)))
  const failed = results.find((r) => r.error && r.error !== 'empty')
  if (failed) return { items: [], error: failed.error }
  const seen = new Set<string>()
  const items: YoutubeSearchItem[] = []
  for (const result of results) {
    for (const video of result.items) {
      if (seen.has(video.videoId)) continue
      seen.add(video.videoId)
      items.push(video)
    }
  }
  return items.length > 0 ? { items } : { items: [], error: 'empty' }
}

/**
 * Filtro da lista do canal. Só um número ("15") acha o hino com esse número
 * ("Hino 15", não o 115 nem o 150); texto filtra pelo título, sem acento.
 */
export function filterChannelVideos(list: YoutubeSearchItem[], query: string): YoutubeSearchItem[] {
  const q = query.trim()
  if (/^\d+$/.test(q)) {
    const number = new RegExp(`\\bhino\\s*0*${Number(q)}\\b`, 'i')
    return list.filter((video) => number.test(video.title))
  }
  return filterYoutubeHistory(list, q)
}
