import type {
  MediaLyricSlide,
  MediaTrackRecord,
} from '../types/media'

import { authHeaders, getAuthSession } from './auth-client'

export function customHeaders(headers?: HeadersInit): Record<string, string> {
  const source = new Headers(headers)
  const merged = Object.fromEntries(source)
  const authorization = source.get('Authorization')
  if (authorization) delete merged.authorization
  return {
    ...merged,
    ...(authorization ? { authorization } : {}),
    'X-Tenant': 'piano',
  }
}
import { enqueue, newClientUuid } from './outbox'
import { loadMediaTrack } from './media-catalog'
import { resolveRemoteFileUrl } from './media-audio'
import {
  createLocalCollection,
  createLocalLyric,
  createLocalMusic,
  deleteLocalCollection,
  deleteLocalLyric,
  deleteLocalMusic,
  getLocalCollection,
  getLocalMusic,
  isLocalId,
  listAllLocalMusicsWithLyrics,
  listLocalCollections,
  listLocalMusics,
  updateLocalCollection,
  updateLocalLyric,
  updateLocalMusic,
  type LocalMusic,
} from './local-custom-store'

/**
 * Catálogo de músicas customizadas (Minhas Coletâneas) via API /v1/custom
 *
 * Formato de resposta do GET /v1/custom/musics/{id}:
 * { id_music, id_collection, name, lyric, auxiliary_lyric,
 *   audio_url, instrumental_url, image_url, image_position,
 *   lyrics: [{ id_lyric, lyric, aux_lyric, image_url, image_position,
 *              time, instrumental_time, show_slide, order }] }
 */

/**
 * Namespace de IDs: custom_musics.id_music e custom_collections.id_collection
 * são AUTOINCREMENT próprios (1, 2, 3...) e colidem com music_{id} do catálogo
 * oficial (1..90167). Na Central de Mídia usamos IDs deslocados:
 * - música custom = id_music + CUSTOM_MUSIC_ID_OFFSET (1.000.000+)
 * - coletânea custom = id_collection + CUSTOM_COLLECTION_ID_OFFSET (2.000.000+)
 * O dispatcher resolveMediaTrack() usa o offset para escolher o loader certo.
 */
export const CUSTOM_MUSIC_ID_OFFSET = 1_000_000
export const CUSTOM_COLLECTION_ID_OFFSET = 2_000_000

export function isCustomMusicId(musicId: number): boolean {
  return Number.isFinite(musicId) && musicId >= CUSTOM_MUSIC_ID_OFFSET
}

export function toCustomMusicId(musicId: number): number {
  return musicId + CUSTOM_MUSIC_ID_OFFSET
}

export function fromCustomMusicId(musicId: number): number {
  return musicId - CUSTOM_MUSIC_ID_OFFSET
}

export function isCustomCollectionId(collectionId: number | string): boolean {
  const n = Number(collectionId)
  return Number.isFinite(n) && n >= CUSTOM_COLLECTION_ID_OFFSET
}

export function toCustomCollectionId(collectionId: number): number {
  return collectionId + CUSTOM_COLLECTION_ID_OFFSET
}

export function fromCustomCollectionId(collectionId: number | string): number {
  return Number(collectionId) - CUSTOM_COLLECTION_ID_OFFSET
}

type CustomLyricRow = {
  lyric?: string
  aux_lyric?: string | null
  image_url?: string | null
  image_position?: string | number | null
  time?: string
  instrumental_time?: string
  show_slide?: number | string | boolean
  order?: number | string
}

type CustomMusicRow = {
  id_music?: number
  id_collection?: number
  name?: string
  lyric?: string | null
  auxiliary_lyric?: string | null
  audio_url?: string | null
  instrumental_url?: string | null
  image_url?: string | null
  image_position?: string | number | null
  duration?: number | null
  official_music_id?: number | null
  lyrics?: CustomLyricRow[]
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseShowSlide(value: unknown): boolean {
  if (value === false || value === 0 || value === '0') return false
  return true
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeTime(value: unknown): string {
  const s = asNullableString(value)
  if (!s) return '00:00:00'
  // API retorna HH:MM ou HH:MM:SS — normalizar para HH:MM:SS
  const parts = s.split(':')
  if (parts.length === 2) return `${s}:00`
  return s
}

function mapCustomLyrics(raw: CustomLyricRow[]): MediaLyricSlide[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row, index) => ({
      order: asNumber(row.order, index + 1),
      lyric: asNullableString(row.lyric) ?? '',
      auxLyric: asNullableString(row.aux_lyric),
      showSlide: parseShowSlide(row.show_slide),
      time: normalizeTime(row.time),
      instrumentalTime: normalizeTime(row.instrumental_time),
      imageUrl: asNullableString(row.image_url),
      imagePosition: row.image_position != null ? String(row.image_position) : null,
      isCover: index === 0,
    }))
    .sort((a, b) => a.order - b.order)
}

function customBaseUrl(): string {
  // Default da nossa API — sem env, '/v1/custom' relativo dá 404 no desktop
  // (coletâneas não baixam). .env é gitignored / CI não injeta (hotfix 14/09).
  const base =
    import.meta.env.VITE_PALCO_API_URL ?? 'https://api.pianolouvorja.com.br'
  if (base) return `${base.replace(/\/$/, '')}/v1/custom`
  return '/v1/custom'
}

/**
 * Formata duração da API para m:ss.
 * API pode retornar: null, segundos (number), "mm:ss" ou "hh:mm:ss".
 */
export function formatDurationLabel(value: unknown): string {
  const raw = asNullableString(value)
  if (raw) {
    // Já vem formatado ("3:45" / "00:03:45") — só limpar horas vazias
    const parts = raw.split(':').map((p) => p.padStart(2, '0'))
    if (parts.length === 3 && parts[0] === '00') return parts.slice(1).join(':')
    if (parts.length >= 2) return raw
    const secs = Number(raw)
    if (Number.isFinite(secs) && secs > 0) return formatSeconds(secs)
    return '0:00'
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return formatSeconds(value)
  }
  return '0:00'
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Carrega uma música customizada pela API e mapeia para MediaTrackRecord.
 * Retorna null se a API não responder ou a música não existir.
 */
export async function loadCustomMusicTrack(
  musicId: number,
): Promise<MediaTrackRecord | null> {
  // Música LOCAL (sem auth): monta o record do localStorage. Áudio/capa em
  // IndexedDB (audioMediaId/coverMediaId) resolvem como blob: objectURL;
  // LEGACY pré-fix (audioBase64/image_url data: inline) segue funcionando.
  if (isLocalId(musicId)) {
    const local = getLocalMusic(musicId)
    if (!local) return null
    const localOfficialId = local.officialMusicId ?? null
    if (localOfficialId != null && localOfficialId > 0) {
      const official = await loadMediaTrack(localOfficialId)
      if (official) return { ...official, id: musicId }
      return null
    }
    const { getMedia } = await import('./local-media-store')
    const audioBlob = local.audioMediaId
      ? await getMedia(local.audioMediaId)
      : null
    const coverBlob = local.coverMediaId
      ? await getMedia(local.coverMediaId)
      : null
    const audioUrl = audioBlob
      ? URL.createObjectURL(audioBlob)
      : local.audioBase64
        ? audioDataUrlFromBase64(local.audioBase64)
        : null
    const coverUrl = coverBlob
      ? URL.createObjectURL(coverBlob)
      : (local.image_url ?? null)
    const lyrics = await Promise.all(local.lyrics.map(async (l) => {
      const imageBlob = l.imageMediaId ? await getMedia(l.imageMediaId) : null
      return {
        order: l.order,
        lyric: l.lyric ?? '',
        auxLyric: l.aux_lyric ?? null,
        showSlide: l.show_slide !== false && l.show_slide !== 0,
        time: l.time ?? '00:00:00',
        instrumentalTime: l.instrumental_time ?? '00:00:00',
        imageUrl: imageBlob ? URL.createObjectURL(imageBlob) : (l.image_url ?? null),
        imagePosition: l.image_position ?? null,
        isCover: l.order === 1 && Boolean(l.image_url ?? l.imageMediaId),
      }
    }))
    return {
      id: musicId,
      name: local.name,
      durationLabel: '0:00',
      audioUrl,
      instrumentalUrl: null,
      coverUrl,
      coverPosition: null,
      albums: [],
      categories: ['Minhas Coletâneas'],
      lyrics,
      status: local.status ?? 'published',
    } satisfies MediaTrackRecord
  }
  if (!Number.isFinite(musicId) || musicId <= 0) return null

  try {
    const response = await fetch(`${customBaseUrl()}/musics/${musicId}`, {
      headers: customHeaders(authHeaders()),
    })
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const row = (await response.json()) as CustomMusicRow
    if (!row || !row.name) return null

    // Link p/ hino oficial: delega ao catálogo oficial (letra, áudio, capa,
    // instrumental — tudo de lá). Mantém o id custom p/ fila/estado do player.
    const officialId =
      typeof row.official_music_id === 'number' && row.official_music_id > 0
        ? row.official_music_id
        : null
    if (officialId != null) {
      const official = await loadMediaTrack(officialId)
      if (official) return { ...official, id: row.id_music ?? musicId }
      return null
    }

    const lyrics = mapCustomLyrics(row.lyrics ?? [])
    // Capa: image_url da música; fallback = bg do primeiro slide que tiver imagem
    const coverUrl =
      asNullableString(row.image_url) ??
      lyrics.find((slide) => slide.imageUrl)?.imageUrl ??
      null

    return {
      id: row.id_music ?? musicId,
      name: row.name,
      durationLabel: formatDurationLabel(row.duration),
      audioUrl: asNullableString(row.audio_url),
      instrumentalUrl: asNullableString(row.instrumental_url),
      coverUrl,
      coverPosition: row.image_position != null ? String(row.image_position) : null,
      albums: [],
      categories: ['Minhas Coletâneas'],
      lyrics,
    } satisfies MediaTrackRecord
  } catch (error) {
    console.error('[custom-catalog] fetch falhou', error)
    return null
  }
}

/** Lista coletâneas customizadas (para a Central de Mídia). */
export type CollectionVisibility = 'public' | 'private'

export type CustomCollectionSummary = {
  id: number
  name: string
  description: string | null
  coverUrl?: string | null
  /** Dono (null = coletânea legado/pública, sem dono). */
  ownerId?: number | null
  /** Nome do criador exibido na listagem (opcional, informativo). */
  authorName?: string | null
  /** Privacidade da coletânea na rede (padrão legado da API: 'public'). */
  visibility?: CollectionVisibility
  musicsCount: number
}

/** Atualiza campos de uma coletânea custom (nome, descrição, cover). */
export async function updateCustomCollection(
  collectionId: number,
  patch: {
    name?: string
    description?: string | null
    cover_url?: string | null
    visibility?: CollectionVisibility
  },
): Promise<CustomCollectionSummary | null> {
  if (isLocalId(collectionId)) {
    const ok = updateLocalCollection(collectionId, {
      name: patch.name,
      description: patch.description,
    })
    if (!ok) return null
    return {
      id: collectionId,
      name: patch.name ?? '',
      description: patch.description ?? null,
      musicsCount: listLocalMusics(collectionId).length,
      ownerId: null,
      authorName: null,
    }
  }
  try {
    const response = await fetch(`${customBaseUrl()}/collections/${collectionId}`, {
      method: 'PUT',
      headers: customHeaders({ 'content-type': 'application/json', ...authHeaders() }),
      body: JSON.stringify(patch),
    })
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const row = (await response.json()) as {
      id_collection: number
      name: string
      description: string | null
      cover_url?: string | null
      visibility?: CollectionVisibility
      musics_count?: number
    }
    return {
      id: row.id_collection,
      name: row.name,
      description: row.description ?? null,
      coverUrl: row.cover_url ?? null,
      visibility: row.visibility ?? patch.visibility,
      musicsCount: row.musics_count ?? 0,
    }
  } catch (error) {
    console.error('[custom-catalog] fetch falhou', error)
    return null
  }
}

export async function listCustomCollections(opts?: {
  signal?: AbortSignal
}): Promise<CustomCollectionSummary[]> {
  // Locais (ids negativos, só desta máquina) entram primeiro na lista.
  const locals: CustomCollectionSummary[] = listLocalCollections().map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    musicsCount: listLocalMusics(c.id).length,
    ownerId: null,
    authorName: null,
  }))
  try {
    const response = await fetch(`${customBaseUrl()}/collections`, {
      headers: customHeaders(authHeaders()),
      signal: opts?.signal,
    })
    if (!response.ok) return locals
    const json = (await response.json()) as {
      data?: Array<{
        id_collection: number
        name: string
        description: string | null
        cover_url?: string | null
        owner_id?: number | null
        author_name?: string | null
        visibility?: CollectionVisibility
        musics_count?: number
      }>
    }
    const remote = (json.data ?? []).map((row) => ({
      id: row.id_collection,
      name: row.name,
      description: row.description ?? null,
      coverUrl: row.cover_url ?? null,
      ownerId: row.owner_id ?? null,
      authorName: row.author_name ?? null,
      visibility: row.visibility ?? 'public',
      musicsCount: row.musics_count ?? 0,
    }))
    return [...locals, ...remote]
  } catch {
    return locals
  }
}

/** Lista músicas de uma coletânea customizada. */
export type CustomMusicSummary = {
  id: number
  name: string
  duration: number | null
  hasAudio: boolean
  hasImage: boolean
  audioUrl?: string | null
  /** Link p/ hino oficial da API (null = música própria). */
  officialMusicId?: number | null
  /** Estado de trabalho local (SPEC t_deed74b5) — ausente = published. */
  status?: 'draft' | 'published'
}

/** LocalMusic (localStorage) → resumo no formato da listagem. */
function localMusicToSummary(m: LocalMusic): CustomMusicSummary {
  return {
    id: m.id,
    name: m.name,
    duration: null,
    hasAudio:
      Boolean(m.audioBase64) ||
      Boolean(m.audioMediaId) ||
      Boolean(m.officialMusicId),
    hasImage: Boolean(m.image_url) || Boolean(m.coverMediaId),
    audioUrl: m.audioBase64 ? audioDataUrlFromBase64(m.audioBase64) : null,
    officialMusicId: m.officialMusicId ?? null,
    status: m.status ?? 'published',
  }
}

/** Copia uma música custom existente (outra coletânea) pra coletânea aberta. */
/**
 * Cópia offline (offline-first app#336 fase local): resolve a origem via
 * loadCustomMusicTrack (local ou remota), cria réplica local na coletânea
 * destino e copia os blobs (áudio/capa/fundos) no IndexedDB.
 */
async function copyLocalCustomMusic(
  collectionId: number,
  musicId: number,
): Promise<{ id: number; existed?: boolean } | null> {
  try {
    const source = await loadCustomMusicTrack(musicId)
    if (!source) return null

    // Dedupe por nome+destino (idempotente como o copy remoto por client_uuid).
    const existing = listLocalMusics(collectionId).find(
      (m) => m.name === source.name,
    )
    if (existing) return { id: existing.id, existed: true }

    const music = createLocalMusic(collectionId, { name: source.name })
    const { putMedia } = await import('./local-media-store')

    // Copy preserva o estado de trabalho da origem (SPEC t_deed74b5).
    updateLocalMusic(music.id, { status: source.status === 'draft' ? 'draft' : 'published' })

    // Áudio: blob objectURL → bytes → IndexedDB (audioMediaId).
    if (source.audioUrl?.startsWith('blob:')) {
      const blob = await fetch(source.audioUrl).then((r) => r.blob())
      await putMedia(`local-music-${music.id}-audio`, blob)
      updateLocalMusic(music.id, { audioMediaId: `local-music-${music.id}-audio` })
    }

    // Capa da música.
    if (source.coverUrl?.startsWith('blob:')) {
      const blob = await fetch(source.coverUrl).then((r) => r.blob())
      const coverId = `local-music-${music.id}-cover`
      await putMedia(coverId, blob)
      updateLocalMusic(music.id, { coverMediaId: coverId })
    } else if (source.coverUrl) {
      updateLocalMusic(music.id, { image_url: source.coverUrl })
    }

    for (const l of source.lyrics) {
      let imageMediaId: string | null = null
      if (l.imageUrl?.startsWith('blob:')) {
        const blob = await fetch(l.imageUrl).then((r) => r.blob())
        imageMediaId = `local-lyric-${music.id}-${l.order}-bg`
        await putMedia(imageMediaId, blob)
      }
      createLocalLyric(music.id, {
        lyric: l.lyric,
        aux_lyric: undefined,
        time: l.time,
        order: l.order,
        image_url: l.imageUrl && !l.imageUrl.startsWith('blob:') ? l.imageUrl : null,
        imageMediaId,
        image_position: l.imagePosition,
      })
    }
    return { id: music.id }
  } catch (error) {
    console.error('[custom-catalog] copy local falhou', error)
    return null
  }
}

export async function copyCustomMusic(
  collectionId: number,
  musicId: number,
): Promise<{ id: number; existed?: boolean } | null> {
  // Cópia envolvendo música LOCAL (origem importada offline) ou destino LOCAL
  // (coletânea local, id negativo): replica no localStorage/IndexedDB, sem API
  // — endpoints remotos não conhecem ids negativos (404 comprovado em STG).
  if (isLocalId(collectionId) || isLocalId(musicId)) {
    return copyLocalCustomMusic(collectionId, musicId)
  }
  try {
    const response = await fetch(
      `${customBaseUrl()}/collections/${collectionId}/musics/${musicId}/copy`,
      { method: 'POST', headers: customHeaders(authHeaders()) },
    )
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const json = (await response.json()) as { id_music: number }
    // Dedup de imports (app#336 fase 3): 200 = já existia (mesmo client_uuid)
    // e a API retornou o registro existente; 201 = criado agora.
    return { id: json.id_music, existed: response.status === 200 }
  } catch (error) {
    console.error('[custom-catalog] fetch falhou', error)
    return null
  }
}

/** Todas as músicas custom (qualquer coletânea) — p/ reutilizar no editor. */
export async function listAllCustomMusics(options?: {
  timeoutMs?: number
}): Promise<
  Array<
    CustomMusicSummary & {
      collectionName?: string
      collectionId?: number
      instrumentalUrl?: string | null
    }
  >
> {
  // Músicas LOCAIS (import offline) entram na busca de reuso — ids negativos.
  const localMusics: Array<
    CustomMusicSummary & { collectionName?: string; collectionId?: number }
  > = listAllLocalMusicsWithLyrics().map((m) => {
    const col = getLocalCollection(m.collectionId)
    return {
      id: m.id,
      name: m.name,
      duration: null,
      hasAudio: Boolean(m.audioMediaId ?? m.audioBase64),
      hasImage: Boolean(m.image_url ?? m.coverMediaId),
      status: m.status ?? 'published',
      collectionName: col?.name,
      collectionId: m.collectionId,
    }
  })
  try {
    const response = await fetch(`${customBaseUrl()}/musics`, {
      headers: customHeaders(authHeaders()),
      signal:
        options?.timeoutMs != null
          ? AbortSignal.timeout(options.timeoutMs)
          : undefined,
    })
    if (!response.ok) return localMusics
    const json = (await response.json()) as {
      data?: Array<{
        id_music: number
        name: string | null
        official_music_id?: number | null
        duration?: number | string | null
        audio_url?: string | null
        instrumental_url?: string | null
        image_url?: string | null
        id_collection?: number
        collection_name?: string
      }>
    }
    return [
      ...localMusics,
      ...(json.data ?? []).map((row) => ({
        id: row.id_music,
        name: row.name ?? '',
        duration:
          typeof row.duration === 'string'
            ? Number(row.duration.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)) || null
            : row.duration ?? null,
        hasAudio: Boolean(row.audio_url),
        hasImage: Boolean(row.image_url),
        audioUrl: row.audio_url ?? null,
        instrumentalUrl: asNullableString(row.instrumental_url),
        officialMusicId: row.official_music_id ?? null,
        collectionId: row.id_collection,
        collectionName: row.collection_name,
      })),
    ]
  } catch {
    return localMusics
  }
}

export async function listCustomMusics(
  collectionId: number,
): Promise<CustomMusicSummary[]> {
  if (isLocalId(collectionId)) {
    return listLocalMusics(collectionId).map(localMusicToSummary)
  }
  try {
    const response = await fetch(
      `${customBaseUrl()}/collections/${collectionId}/musics`,
      { headers: customHeaders(authHeaders()) },
    )
    if (!response.ok) return []
    const json = (await response.json()) as {
      data?: Array<{
        id_music: number
        name: string
        duration: number | null
        audio_url?: string | null
        image_url?: string | null
        official_music_id?: number | null
      }>
    }
    const rows = (json.data ?? []).map((row) => ({
      id: row.id_music,
      name: row.name,
      duration: row.duration ?? null,
      hasAudio: Boolean(row.audio_url) || Boolean(row.official_music_id),
      hasImage: Boolean(row.image_url),
      audioUrl: asNullableString(row.audio_url),
      officialMusicId:
        typeof row.official_music_id === 'number' && row.official_music_id > 0
          ? row.official_music_id
          : null,
    }))
    // API não tem duração (null no banco): ler metadata do MP3 no cliente
    // (request range — só o header do arquivo). Não bloqueia a lista.
    void enrichDurations(rows)
    return rows
  } catch {
    return []
  }
}

/**
 * Preenche duration (segundos) lendo metadata do áudio em background.
 * Retorna true quando terminou (para o caller re-renderizar).
 */
export async function enrichDurations(
  rows: Array<{ duration: number | null; hasAudio: boolean; audioUrl?: string | null }>,
): Promise<boolean> {
  const CONCURRENCY = 4
  const TIMEOUT_MS = 8000
  const pending = rows.filter((row) => row.duration == null && row.hasAudio)
  if (pending.length === 0) return false
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < pending.length) {
      const row = pending[cursor++]
      const seconds = await probeAudioDuration(row.audioUrl, TIMEOUT_MS).catch(
        () => null,
      )
      if (seconds != null) row.duration = seconds
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
  )
  return true
}

/** Duração do arquivo de áudio via preload=metadata (request range). */
export function probeAudioDuration(
  audioUrl: string | null | undefined,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    // URLs custom (/custom/...) vêm da própria API custom (customFileUrl:
    // respeita VITE_PALCO_API_URL/proxy local). Demais paths do catálogo
    // usam a base de files remota (resolveRemoteFileUrl).
    const src = audioUrl
      ? audioUrl.startsWith('/custom/')
        ? customFileUrl(audioUrl)
        : resolveRemoteFileUrl(audioUrl)
      : null
    if (!src) {
      resolve(null)
      return
    }
    const audio = new Audio()
    audio.preload = 'metadata'
    const done = (value: number | null) => {
      clearTimeout(timer)
      audio.removeAttribute('src')
      audio.load()
      resolve(value)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    audio.addEventListener(
      'loadedmetadata',
      () =>
        done(
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : null,
        ),
      { once: true },
    )
    audio.addEventListener('error', () => done(null), { once: true })
    audio.src = src
  })
}

/** CRUD mínimo para o editor web. */
export async function createCustomCollection(
  name: string,
  description?: string,
  authorName?: string,
  visibility?: CollectionVisibility,
  options?: { queueOffline?: boolean },
): Promise<{ id: number } | null> {
  // Sem auth: cria LOCAL (regra de produto 12/09 — sem identidade não sobe).
  if (!getAuthSession()) {
    const local = createLocalCollection(name, description)
    return { id: local.id }
  }
  try {
    const response = await fetch(`${customBaseUrl()}/collections`, {
      method: 'POST',
      headers: customHeaders({ 'content-type': 'application/json', ...authHeaders() }),
      // SEMPRE envia visibility explícita (default PRIVADO no app — decisão
      // t_35e4d3ea: usuário escolhe publicar; API-default 'public' é pegadinha).
      body: JSON.stringify({
        name,
        description,
        author_name: authorName,
        visibility: visibility ?? 'private',
      }),
    })
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const json = (await response.json()) as { id_collection: number }
    return { id: json.id_collection }
  } catch {
    // O import .slja não pode deixar uma coletânea vazia na fila quando
    // desiste do envio. O editor continua enfileirando.
    if (options?.queueOffline === false) return null
    // Offline (autenticado): enfileira pro sync (B1/B2). O client_uuid dá
    // identidade estável — o próximo flush cria/atualiza no servidor.
    await enqueue({
      entity: 'collection',
      client_uuid: newClientUuid(),
      action: 'upsert',
      payload: {
        name,
        description: description ?? null,
        author_name: authorName ?? null,
        // Mesma regra do POST online (t_35e4d3ea): SEMPRE visibility
        // explícita — sem ela a API aplica default 'public' e a coletânea
        // privada sincronizada offline vaza pra comunidade (t_8e652bfe F2).
        visibility: visibility ?? 'private',
        updated_at: Date.now(),
      },
      updated_at: Date.now(),
      owner_email: getAuthSession()?.user?.email ?? null,
    })
    return { id: 0 }
  }
}

export async function createCustomMusic(
  collectionId: number,
  input: {
    name?: string
    lyric?: string
    auxiliary_lyric?: string
    client_uuid?: string
    duration?: number
  },
): Promise<{ id: number; existed?: boolean } | null> {
  if (isLocalId(collectionId)) {
    const local = createLocalMusic(collectionId, {
      name: input.name,
      lyric: input.lyric,
    })
    return { id: local.id }
  }
  try {
    const response = await fetch(
      `${customBaseUrl()}/collections/${collectionId}/musics`,
      {
        method: 'POST',
        headers: customHeaders({ 'content-type': 'application/json', ...authHeaders() }),
        body: JSON.stringify(input),
      },
    )
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const json = (await response.json()) as { id_music: number }
    // Dedup (web#187 paridade): 200 = já existia (mesmo client_uuid)
    return { id: json.id_music, existed: response.status === 200 }
  } catch (error) {
    console.error('[custom-catalog] fetch falhou', error)
    return null
  }
}

/**
 * Adiciona um hino OFICIAL da API (tabela musics) a uma coletânea custom.
 * Cria apenas um link (official_music_id) — playback/letra resolvem pelo
 * catálogo oficial via resolveMediaTrack. Retorna o id custom criado.
 */
export async function addOfficialMusicToCollection(
  collectionId: number,
  officialMusicId: number,
  name?: string,
): Promise<{ id: number } | null> {
  try {
    const response = await fetch(
      `${customBaseUrl()}/collections/${collectionId}/musics`,
      {
        method: 'POST',
        headers: customHeaders({ 'content-type': 'application/json', ...authHeaders() }),
        // name opcional: o catálogo oficial (json_db remoto) é a fonte do nome —
        // o SQLite local pode não ter o hino.
        body: JSON.stringify({ official_music_id: officialMusicId, name }),
      },
    )
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const json = (await response.json()) as { id_music: number }
    return { id: json.id_music }
  } catch (error) {
    console.error('[custom-catalog] fetch falhou', error)
    return null
  }
}

export async function updateCustomMusic(
  musicId: number,
  input: {
    name?: string
    lyric?: string
    auxiliary_lyric?: string
    id_file_audio?: number | null
    id_file_image?: number | null
  },
): Promise<boolean> {
  if (isLocalId(musicId)) {
    return updateLocalMusic(musicId, { name: input.name })
  }
  try {
    const response = await fetch(`${customBaseUrl()}/musics/${musicId}`, {
      method: 'PUT',
      headers: customHeaders({ 'content-type': 'application/json', ...authHeaders() }),
      body: JSON.stringify(input),
    })
    return response.ok
  } catch {
    return false
  }
}

/** URL absoluta para um path de arquivo servido pela API (/file/...) */
export function customApiUrl(path: string): string {
  return `${customBaseUrl()}${path}`
}

export function customFileUrl(urlPath: string): string {
  // objectURL/blob:/data: (áudio/bg locais do import .slja) já são URL final.
  if (/^(blob:|data:|https?:|\/file)/.test(urlPath)) return urlPath
  const base = import.meta.env.VITE_PALCO_API_URL
  if (base) return `${base.replace(/\/$/, '')}/file${urlPath}`
  return `/file${urlPath}`
}

/**
 * MIME de áudio pelo magic bytes do conteúdo base64.
 * Formatos suportados no import/reprodução local: mp3, wav, ogg.
 * Base64 legacy sem cabeçalho reconhecível cai em audio/mpeg (padrão antigo).
 */
export function audioMimeFromBase64(b64: string): string {
  try {
    const head = atob(b64.slice(0, 16))
    if (head.startsWith('RIFF')) return 'audio/wav'
    if (head.startsWith('OggS')) return 'audio/ogg'
  } catch {
    /* base64 inválido/truncado — cai no default */
  }
  return 'audio/mpeg'
}

export function audioDataUrlFromBase64(b64: string): string {
  return `data:${audioMimeFromBase64(b64)};base64,${b64}`
}

/**
 * Upload de mídia extraída de .slja (áudio/imagens).
 * Retorna id_file + url relativa (/custom/...) ou null em falha.
 */
export async function uploadCustomFile(
  bytes: Uint8Array,
  filename: string,
  kind: 'audio' | 'imagens',
): Promise<{ idFile: number; url: string } | null> {
  // AbortController + timeout: WAV de 30MB pode pendurar o POST indefinidamente
  // (observado em prod/STG) e congelar o import com loading eterno.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
    const formData = new FormData()
    formData.append('file', new Blob([bytes as BlobPart]), filename)
    formData.append('kind', kind)
    const response = await fetch(`${customBaseUrl()}/files`, {
      method: 'POST',
      headers: customHeaders(authHeaders()),
      body: formData,
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const data = (await response.json()) as { id_file: number; url: string }
    return { idFile: data.id_file, url: data.url }
  } catch (error) {
    console.error('[custom-catalog] upload falhou', error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function deleteCustomMusic(musicId: number): Promise<boolean> {
  if (isLocalId(musicId)) return deleteLocalMusic(musicId)
  try {
    const response = await fetch(`${customBaseUrl()}/musics/${musicId}`, {
      method: 'DELETE',
      headers: customHeaders(authHeaders()),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function deleteCustomCollection(collectionId: number): Promise<boolean> {
  if (isLocalId(collectionId)) return deleteLocalCollection(collectionId)
  try {
    const response = await fetch(`${customBaseUrl()}/collections/${collectionId}`, {
      method: 'DELETE',
      headers: customHeaders(authHeaders()),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function createCustomLyric(
  musicId: number,
  input: {
    lyric: string
    aux_lyric?: string
    time?: string
    order?: number
    id_file_image?: number
    /** Apenas local: blob de background no IndexedDB. */
    imageMediaId?: string
    image_position?: string | number
  },
): Promise<{ id: number } | null> {
  if (isLocalId(musicId)) {
    try {
      const local = createLocalLyric(musicId, input)
      return { id: local.id }
    } catch {
      return null
    }
  }
  try {
    const response = await fetch(`${customBaseUrl()}/musics/${musicId}/lyrics`, {
      method: 'POST',
      headers: customHeaders({ 'content-type': 'application/json', ...authHeaders() }),
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      console.error('[custom-catalog] HTTP', response.status, response.url)
      return null
    }
    const json = (await response.json()) as { id_lyric: number }
    return { id: json.id_lyric }
  } catch (error) {
    console.error('[custom-catalog] fetch falhou', error)
    return null
  }
}

export async function updateCustomLyric(
  lyricId: number,
  input: {
    lyric?: string
    aux_lyric?: string
    time?: string
    order?: number
  },
): Promise<boolean> {
  if (isLocalId(lyricId)) return updateLocalLyric(lyricId, input)
  try {
    const response = await fetch(`${customBaseUrl()}/lyrics/${lyricId}`, {
      method: 'PUT',
      headers: customHeaders({ 'content-type': 'application/json', ...authHeaders() }),
      body: JSON.stringify(input),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function deleteCustomLyric(lyricId: number): Promise<boolean> {
  if (isLocalId(lyricId)) return deleteLocalLyric(lyricId)
  try {
    const response = await fetch(`${customBaseUrl()}/lyrics/${lyricId}`, {
      method: 'DELETE',
      headers: customHeaders(authHeaders()),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Loader composto: resolve um musicId para MediaTrackRecord consultando o
 * catálogo oficial OU a API custom (Minhas Coletâneas), conforme o namespace.
 * IDs >= 1.000.000 são custom; o restante vai ao catálogo JSON oficial.
 * Retorna null quando nenhuma fonte tem a faixa.
 */
export async function resolveMediaTrack(
  musicId: number,
): Promise<MediaTrackRecord | null> {
  // app#331: música LOCAL (sem auth, localStorage, id negativo) primeiro —
  // o guard de custom (>= 1M) também engole negativos se rodar antes.
  if (isLocalId(musicId)) {
    return loadCustomMusicTrack(musicId)
  }
  if (isCustomMusicId(musicId)) {
    return loadCustomMusicTrack(fromCustomMusicId(musicId))
  }
  const official = await loadMediaTrack(musicId)
  if (!official) return null
  // E13 edits da comunidade (SPEC piano-community-edits v1.0): edit local do
  // autor ou applied do concilio vence a letra/timing oficial (RF-02/RF-08).
  // fetchApplied importado lazy para não puxar a API no boot do módulo.
  const { resolveEditOverride } = await import('../../community-edits/services/edit-resolver')
  return resolveEditOverride(musicId, official, fetchAppliedEdit)
}

/** Busca edit aprovado p/ música na API custom (RF-08). Falha de rede = oficial. */
async function fetchAppliedEdit(musicId: number): Promise<{ lyrics: string | null; timing: string | null } | null> {
  try {
    const res = await fetch(customApiUrl(`/edits/applied?musicIds=${musicId}`), {
      headers: customHeaders(),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { applied?: { musicId: number; lyrics: string | null; timing: string | null }[] }
    return body.applied?.find((e) => e.musicId === musicId) ?? null
  } catch {
    return null // offline → oficial intacta
  }
}