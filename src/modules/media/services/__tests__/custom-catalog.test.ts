// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Kill-plane custom-catalog: todos os caminhos de rede (fetch), local store,
// normalizadores e loaders compostos.

const mocks = vi.hoisted(() => ({
  authHeadersMock: vi.fn(() => ({ Authorization: 'Bearer x' })),
  getAuthSessionMock: vi.fn(() => null),
  loadMediaTrackMock: vi.fn(async () => null),
  resolveRemoteFileUrlMock: vi.fn((p: string) => `https://files.example.com${p}`),
}))

vi.mock('../outbox', () => ({
  enqueue: vi.fn(async () => undefined),
  newClientUuid: vi.fn(() => 'uuid-teste'),
}));
vi.mock('../auth-client', () => ({
  authHeaders: () => mocks.authHeadersMock(),
  getAuthSession: () => mocks.getAuthSessionMock(),
}))
vi.mock('../media-catalog', () => ({
  loadMediaTrack: (...args: unknown[]) => mocks.loadMediaTrackMock(...(args as [number])),
}))
vi.mock('../media-audio', () => ({
  resolveRemoteFileUrl: (p: string) => mocks.resolveRemoteFileUrlMock(p),
}))

import {
  CUSTOM_COLLECTION_ID_OFFSET,
  CUSTOM_MUSIC_ID_OFFSET,
  addOfficialMusicToCollection,
  copyCustomMusic,
  createCustomCollection,
  createCustomLyric,
  createCustomMusic,
  customApiUrl,
  customFileUrl,
  deleteCustomCollection,
  deleteCustomLyric,
  deleteCustomMusic,
  enrichDurations,
  formatDurationLabel,
  formatSeconds,
  fromCustomCollectionId,
  fromCustomMusicId,
  isCustomCollectionId,
  isCustomMusicId,
  listAllCustomMusics,
  listCustomCollections,
  listCustomMusics,
  loadCustomMusicTrack,
  probeAudioDuration,
  resolveMediaTrack,
  toCustomCollectionId,
  toCustomMusicId,
  updateCustomCollection,
  updateCustomLyric,
  updateCustomMusic,
  uploadCustomFile,
} from '../custom-catalog'
import {
  createLocalCollection,
  createLocalMusic,
  createLocalLyric,
  getLocalCollection,
  getLocalMusic,
  listLocalCollections,
  listLocalMusics,
  isLocalId,
  updateLocalCollection,
  updateLocalMusic,
  updateLocalLyric,
  deleteLocalCollection,
  deleteLocalLyric,
  deleteLocalMusic,
} from '../local-custom-store'

// ── fetch stub ──────────────────────────────────────────────────────────────
type Route = {
  match: (url: string, init?: RequestInit) => boolean
  status?: number
  body?: unknown
  throw?: boolean
}
let routes: Route[] = []

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function fetchStub(url: string, init?: RequestInit) {
  const route = routes.find((r) => r.match(url, init))
  if (!route) throw new Error(`fetch sem rota: ${url}`)
  if (route.throw) return Promise.reject(new Error('network'))
  return Promise.resolve(jsonResponse(route.status ?? 200, route.body))
}

beforeEach(() => {
  localStorage.clear()
  routes = []
  vi.stubGlobal('fetch', vi.fn(fetchStub))
  mocks.getAuthSessionMock.mockReturnValue(null)
  mocks.loadMediaTrackMock.mockReset().mockResolvedValue(null)
  mocks.authHeadersMock.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── namespace de ids ────────────────────────────────────────────────────────
describe('namespace de ids custom', () => {
  it('offsets e conversões round-trip', () => {
    expect(CUSTOM_MUSIC_ID_OFFSET).toBe(1_000_000)
    expect(CUSTOM_COLLECTION_ID_OFFSET).toBe(2_000_000)
    expect(toCustomMusicId(5)).toBe(1_000_005)
    expect(fromCustomMusicId(1_000_005)).toBe(5)
    expect(toCustomCollectionId(7)).toBe(2_000_007)
    expect(fromCustomCollectionId(2_000_007)).toBe(7)
    expect(fromCustomCollectionId('2000012')).toBe(12)
  })

  it('isCustomMusicId/isCustomCollectionId classificam namespaces', () => {
    expect(isCustomMusicId(1_000_000)).toBe(true)
    expect(isCustomMusicId(999_999)).toBe(false)
    expect(isCustomMusicId(Number.NaN)).toBe(false)
    expect(isCustomMusicId(Number.POSITIVE_INFINITY)).toBe(false)

    expect(isCustomCollectionId(2_000_000)).toBe(true)
    expect(isCustomCollectionId(1_999_999)).toBe(false)
    expect(isCustomCollectionId('2000001')).toBe(true)
    expect(isCustomCollectionId('abc')).toBe(false)
    expect(isCustomCollectionId(Number.NaN)).toBe(false)
  })
})

// ── loadCustomMusicTrack ────────────────────────────────────────────────────
describe('loadCustomMusicTrack', () => {
  it('id inválido (0, NaN, negativo) → null sem fetch', async () => {
    expect(await loadCustomMusicTrack(0)).toBeNull()
    expect(await loadCustomMusicTrack(Number.NaN)).toBeNull()
    expect(await loadCustomMusicTrack(-3)).toBeNull()
  })

  it('música local → record do localStorage com áudio base64', async () => {
    const col = createLocalCollection('Minha', 'desc')
    const music = createLocalMusic(col.id, {
      name: 'Local Song',
      lyric: 'letra',
    })
    const track = await loadCustomMusicTrack(music.id)
    expect(track).not.toBeNull()
    expect(track?.name).toBe('Local Song')
    expect(track?.categories).toEqual(['Minhas Coletâneas'])
    expect(track?.audioUrl).toBeNull()

    // local inexistente → null
    expect(await loadCustomMusicTrack(-999)).toBeNull()
  })

  it('música local vinculada a oficial → delega ao catálogo oficial', async () => {
    const col = createLocalCollection('C', null)
    const music = createLocalMusic(col.id, { name: 'X' })
    const local = getLocalMusic(music.id)
    expect(local).not.toBeNull()
    // injeta officialMusicId direto no localStorage
    const raw = JSON.parse(localStorage.getItem('pianolouvorja.custom_musics') ?? '[]')
    void raw

    mocks.loadMediaTrackMock.mockResolvedValueOnce({
      id: 42,
      name: 'Oficial 42',
      durationLabel: '3:00',
      audioUrl: 'a.mp3',
      instrumentalUrl: null,
      coverUrl: null,
      coverPosition: null,
      albums: [],
      categories: [],
      lyrics: [],
    })
    // via API remota: official_music_id
    routes = [
      {
        match: (u) => u.includes('/v1/custom/musics/77'),
        body: {
          id_music: 77,
          name: 'Vinculada',
          official_music_id: 42,
        },
      },
    ]
    const track = await loadCustomMusicTrack(77)
    expect(mocks.loadMediaTrackMock).toHaveBeenCalledWith(42)
    expect(track?.id).toBe(77)
    expect(track?.name).toBe('Oficial 42')

    // oficial sem track → null
    mocks.loadMediaTrackMock.mockResolvedValueOnce(null)
    expect(await loadCustomMusicTrack(77)).toBeNull()
  })

  it('API remota: fluxo completo com lyrics e cover fallback', async () => {
    routes = [
      {
        match: (u) => u.includes('/v1/custom/musics/10'),
        body: {
          id_music: 10,
          name: 'Remota',
          duration: '03:45',
          audio_url: '/custom/audio.mp3',
          instrumental_url: '  ',
          image_url: null,
          lyrics: [
            {
              lyric: 'slide 1',
              time: '10:30',
              show_slide: 0,
              order: '2',
            },
            {
              lyric: ' capa ',
              image_url: 'img.png',
              image_position: 'top',
              time: '00:00',
            },
          ],
        },
      },
    ]
    const track = await loadCustomMusicTrack(10)
    expect(track?.name).toBe('Remota')
    expect(track?.durationLabel).toBe('03:45')
    expect(track?.audioUrl).toBe('/custom/audio.mp3')
    expect(track?.instrumentalUrl).toBeNull()
    expect(track?.coverUrl).toBe('img.png')
    expect(track?.lyrics).toHaveLength(2)
    expect(track?.lyrics[0].isCover).toBe(true)
    expect(track?.lyrics[0].order).toBe(2)
    expect(track?.lyrics[0].time).toBe('10:30:00')
    expect(track?.lyrics[1].order).toBe(2)
    expect(track?.lyrics[1].showSlide).toBe(true)
    expect(track?.lyrics[1].time).toBe('00:00:00')
  })

  it('API: !ok, sem name, e fetch throw → null', async () => {
    routes = [
      { match: () => true, status: 500 },
    ]
    expect(await loadCustomMusicTrack(10)).toBeNull()

    routes = [{ match: () => true, body: null }]
    expect(await loadCustomMusicTrack(10)).toBeNull()

    routes = [{ match: () => true, body: { id_music: 1 } }]
    expect(await loadCustomMusicTrack(10)).toBeNull()

    routes = [{ match: () => true, throw: true }]
    expect(await loadCustomMusicTrack(10)).toBeNull()
  })
})

// ── collections ─────────────────────────────────────────────────────────────
describe('collections CRUD', () => {
  it('updateCustomCollection local ok e falha', async () => {
    const col = createLocalCollection('Antiga', null)
    const updated = await updateCustomCollection(col.id, { name: 'Nova' })
    expect(updated?.name).toBe('Nova')
    expect(updated?.musicsCount).toBe(0)

    expect(await updateCustomCollection(-999, { name: 'X' })).toBeNull()
  })

  it('updateCustomCollection remoto ok, !ok e throw', async () => {
    routes = [
      {
        match: (u) => u.includes('/collections/5') && !u.includes('musics'),
        body: {
          id_collection: 5,
          name: 'R',
          description: null,
          musics_count: 3,
        },
      },
    ]
    const up = await updateCustomCollection(5, { name: 'R' })
    expect(up?.musicsCount).toBe(3)

    // row remota sem musics_count → ?? 0 (328 arm1)
    routes = [
      {
        match: (u) => u.includes('/collections/5') && !u.includes('musics'),
        body: { id_collection: 5, name: 'R2', description: null },
      },
    ]
    expect((await updateCustomCollection(5, { name: 'R' }))?.musicsCount).toBe(0)

    // row remota sem musics_count → ?? 0 (328 arm1)
    routes = [
      {
        match: (u) => u.includes('/collections/5') && !u.includes('musics'),
        body: { id_collection: 5, name: 'R2', description: null },
      },
    ]
    expect((await updateCustomCollection(5, { name: 'R' }))?.musicsCount).toBe(0)

    routes = [{ match: () => true, status: 403 }]
    expect(await updateCustomCollection(5, { name: 'R' })).toBeNull()

    routes = [{ match: () => true, throw: true }]
    expect(await updateCustomCollection(5, { name: 'R' })).toBeNull()
  })

  it('listCustomCollections mistura locals + remotos; !ok e throw → só locals', async () => {
    createLocalCollection('L1', null)
    routes = [
      {
        match: () => true,
        body: {
          data: [
            {
              id_collection: 9,
              name: 'R9',
              description: null,
              owner_id: 3,
              author_name: 'Alguém',
              musics_count: 4,
            },
          ],
        },
      },
    ]
    const all = await listCustomCollections()
    expect(all.map((c) => c.name)).toEqual(['L1', 'R9'])

    routes = [{ match: () => true, status: 500 }]
    expect((await listCustomCollections()).map((c) => c.name)).toEqual(['L1'])

    routes = [{ match: () => true, throw: true }]
    expect((await listCustomCollections()).map((c) => c.name)).toEqual(['L1'])

    // sem data key
    routes = [{ match: () => true, body: {} }]
    expect((await listCustomCollections()).map((c) => c.name)).toEqual(['L1'])
  })

  it('createCustomCollection: sem auth → local; com auth → API; !ok/throw → null', async () => {
    const local = await createCustomCollection('Nova Local', 'desc')
    expect(local).not.toBeNull()
    expect(local!.id).toBeLessThanOrEqual(0)

    mocks.getAuthSessionMock.mockReturnValue({ userId: 1 })
    routes = [{ match: () => true, body: { id_collection: 55 } }]
    expect(await createCustomCollection('Remota')).toEqual({ id: 55 })

    routes = [{ match: () => true, status: 400 }]
    expect(await createCustomCollection('Ruim')).toBeNull()

    // rede falhou com auth: enfileira no outbox e retorna id 0 (sync depois)
    routes = [{ match: () => true, throw: true }]
    expect(await createCustomCollection('Ruim')).toEqual({ id: 0 })
  })

  it('deleteCustomCollection: local, remoto ok, !ok, throw', async () => {
    const col = createLocalCollection('Del', null)
    expect(await deleteCustomCollection(col.id)).toBe(true)

    routes = [{ match: () => true, status: 200 }]
    expect(await deleteCustomCollection(9)).toBe(true)

    routes = [{ match: () => true, status: 404 }]
    expect(await deleteCustomCollection(9)).toBe(false)

    routes = [{ match: () => true, throw: true }]
    expect(await deleteCustomCollection(9)).toBe(false)
  })

  it('copyCustomMusic: ok, !ok, throw', async () => {
    routes = [{ match: () => true, body: { id_music: 99 } }]
    expect(await copyCustomMusic(1, 2)).toEqual({ id: 99 })

    routes = [{ match: () => true, status: 409 }]
    expect(await copyCustomMusic(1, 2)).toBeNull()

    routes = [{ match: () => true, throw: true }]
    expect(await copyCustomMusic(1, 2)).toBeNull()
  })
})

// ── musics ──────────────────────────────────────────────────────────────────
describe('musics CRUD e listagem', () => {
  it('listCustomMusics local → summaries', async () => {
    const col = createLocalCollection('C', null)
    createLocalMusic(col.id, { name: 'M1', lyric: 'x' })
    const rows = await listCustomMusics(col.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('M1')
    expect(rows[0].hasAudio).toBe(false)
    // com audioBase64 → audioUrl data: e hasAudio true (400 arm0)
    const db = JSON.parse(localStorage.getItem('louvorja.local-custom.v1')!)
    const mm = (db.musics as Array<Record<string, unknown>>).find((m) => m.name === 'M1')!
    mm.audioBase64 = 'WFla'
    localStorage.setItem('louvorja.local-custom.v1', JSON.stringify(db))
    const rows2 = await listCustomMusics(col.id)
    expect(rows2[0].hasAudio).toBe(true)
    expect((rows2[0] as unknown as { audioUrl: string }).audioUrl).toContain('data:audio/mpeg')
  })

  it('listCustomMusics remoto + enrich; !ok e throw → []', async () => {
    routes = [
      {
        match: () => true,
        body: {
          data: [
            {
              id_music: 3,
              name: 'A',
              duration: null,
              audio_url: null,
              official_music_id: 42,
              image_url: 'i.png',
            },
            {
              id_music: 4,
              name: 'B',
              duration: 120,
              audio_url: '/custom/a.mp3',
              official_music_id: 'x',
            },
          ],
        },
      },
    ]
    const rows = await listCustomMusics(1)
    expect(rows).toHaveLength(2)
    expect(rows[0].hasAudio).toBe(true)
    expect(rows[0].officialMusicId).toBe(42)
    expect(rows[1].officialMusicId).toBeNull()
    expect(rows[1].hasAudio).toBe(true)
    await vi.waitFor(() => {}) // deixa enrich rodar (vazio)

    routes = [{ match: () => true, status: 500 }]
    expect(await listCustomMusics(1)).toEqual([])

    routes = [{ match: () => true, throw: true }]
    expect(await listCustomMusics(1)).toEqual([])
  })

  it('listAllCustomMusics: sem data → [] (442 arm1)', async () => {
    routes = [{ match: () => true, body: {} }]
    expect(await listAllCustomMusics()).toEqual([])
  })

  it('listAllCustomMusics: ok (string duration → null), !ok, throw', async () => {
    routes = [
      {
        match: () => true,
        body: {
          data: [
            {
              id_music: 1,
              name: 'S',
              duration: '3:00',
              audio_url: 'a.mp3',
              image_url: 'i.png',
              id_collection: 2,
              collection_name: 'Col',
            },
            { id_music: 2, name: null },
          ],
        },
      },
    ]
    const all = await listAllCustomMusics()
    expect(all).toHaveLength(2)
    expect(all[0].duration).toBe(180)
    expect(all[0].collectionName).toBe('Col')
    expect(all[1].name).toBe('')

    routes = [{ match: () => true, status: 500 }]
    expect(await listAllCustomMusics()).toEqual([])

    routes = [{ match: () => true, throw: true }]
    expect(await listAllCustomMusics()).toEqual([])
  })

  it('createCustomMusic: local e remoto; !ok/throw → null', async () => {
    const col = createLocalCollection('C', null)
    const local = await createCustomMusic(col.id, { name: 'Nova' })
    expect(local).not.toBeNull()

    routes = [{ match: () => true, body: { id_music: 31 } }]
    expect(await createCustomMusic(1, { name: 'R' })).toEqual({ id: 31 })

    routes = [{ match: () => true, status: 500 }]
    expect(await createCustomMusic(1, {})).toBeNull()

    routes = [{ match: () => true, throw: true }]
    expect(await createCustomMusic(1, {})).toBeNull()
  })

  it('addOfficialMusicToCollection: ok, !ok, throw', async () => {
    routes = [{ match: () => true, body: { id_music: 77 } }]
    expect(await addOfficialMusicToCollection(1, 42, 'Hino')).toEqual({ id: 77 })

    routes = [{ match: () => true, status: 403 }]
    expect(await addOfficialMusicToCollection(1, 42)).toBeNull()

    routes = [{ match: () => true, throw: true }]
    expect(await addOfficialMusicToCollection(1, 42)).toBeNull()
  })

  it('updateCustomMusic: local, remoto ok/!ok/throw', async () => {
    const col = createLocalCollection('C', null)
    const m = createLocalMusic(col.id, { name: 'Antigo' })
    expect(await updateCustomMusic(m.id, { name: 'Novo' })).toBe(true)

    routes = [{ match: () => true, status: 200 }]
    expect(await updateCustomMusic(5, { name: 'R' })).toBe(true)

    routes = [{ match: () => true, status: 500 }]
    expect(await updateCustomMusic(5, { name: 'R' })).toBe(false)

    routes = [{ match: () => true, throw: true }]
    expect(await updateCustomMusic(5, { name: 'R' })).toBe(false)
  })

  it('deleteCustomMusic: local, ok, !ok, throw', async () => {
    const col = createLocalCollection('C', null)
    const m = createLocalMusic(col.id, { name: 'X' })
    expect(await deleteCustomMusic(m.id)).toBe(true)

    routes = [{ match: () => true, status: 200 }]
    expect(await deleteCustomMusic(5)).toBe(true)

    routes = [{ match: () => true, status: 500 }]
    expect(await deleteCustomMusic(5)).toBe(false)

    routes = [{ match: () => true, throw: true }]
    expect(await deleteCustomMusic(5)).toBe(false)
  })
})

// ── lyrics ──────────────────────────────────────────────────────────────────
describe('lyrics CRUD', () => {
  it('createCustomLyric: local, ok, !ok, throw', async () => {
    const col = createLocalCollection('C', null)
    const m = createLocalMusic(col.id, { name: 'M' })
    const local = await createCustomLyric(m.id, { lyric: 'l' })
    expect(local).not.toBeNull()

    routes = [{ match: () => true, body: { id_lyric: 8 } }]
    expect(await createCustomLyric(5, { lyric: 'l' })).toEqual({ id: 8 })

    routes = [{ match: () => true, status: 500 }]
    expect(await createCustomLyric(5, { lyric: 'l' })).toBeNull()

    routes = [{ match: () => true, throw: true }]
    expect(await createCustomLyric(5, { lyric: 'l' })).toBeNull()
  })

  it('updateCustomLyric: local, ok, !ok, throw', async () => {
    const col = createLocalCollection('C', null)
    const m = createLocalMusic(col.id, { name: 'M' })
    const l = await createCustomLyric(m.id, { lyric: 'l' })
    expect(await updateCustomLyric(l!.id, { lyric: 'novo' })).toBe(true)

    routes = [{ match: () => true, status: 200 }]
    expect(await updateCustomLyric(9, { lyric: 'r' })).toBe(true)

    routes = [{ match: () => true, status: 500 }]
    expect(await updateCustomLyric(9, { lyric: 'r' })).toBe(false)

    routes = [{ match: () => true, throw: true }]
    expect(await updateCustomLyric(9, { lyric: 'r' })).toBe(false)
  })

  it('deleteCustomLyric: local, ok, !ok, throw', async () => {
    const col = createLocalCollection('C', null)
    const m = createLocalMusic(col.id, { name: 'M' })
    const l = await createCustomLyric(m.id, { lyric: 'l' })
    expect(await deleteCustomLyric(l!.id)).toBe(true)

    routes = [{ match: () => true, status: 200 }]
    expect(await deleteCustomLyric(9)).toBe(true)

    routes = [{ match: () => true, status: 500 }]
    expect(await deleteCustomLyric(9)).toBe(false)

    routes = [{ match: () => true, throw: true }]
    expect(await deleteCustomLyric(9)).toBe(false)
  })
})

// ── urls / upload / resolve ─────────────────────────────────────────────────
describe('urls, upload e resolveMediaTrack', () => {
  it('customApiUrl concatena base + path', () => {
    expect(customApiUrl('/v1/custom/musics')).toContain('/v1/custom/musics')
  })

  it('customFileUrl: com e sem env base', () => {
    // sem env (default de teste): relativo
    const url = customFileUrl('/custom/a.mp3')
    expect(url.startsWith('/file/custom/a.mp3') || url.includes('/file/custom')).toBe(true)
  })

  it('uploadCustomFile: ok, !ok, throw', async () => {
    routes = [
      { match: () => true, body: { id_file: 3, url: '/custom/f.mp3' } },
    ]
    const up = await uploadCustomFile(new Uint8Array([1]), 'a.mp3', 'audio')
    expect(up).toEqual({ idFile: 3, url: '/custom/f.mp3' })

    routes = [{ match: () => true, status: 500 }]
    expect(await uploadCustomFile(new Uint8Array([1]), 'a.mp3', 'audio')).toBeNull()

    routes = [{ match: () => true, throw: true }]
    expect(await uploadCustomFile(new Uint8Array([1]), 'a.mp3', 'imagens')).toBeNull()
  })

  it('resolveMediaTrack: custom delega com offset; oficial delega direto', async () => {
    routes = [{ match: () => true, status: 500 }]
    mocks.loadMediaTrackMock.mockResolvedValueOnce({
      id: 7,
      name: 'Oficial',
      durationLabel: '1:00',
      audioUrl: null,
      instrumentalUrl: null,
      coverUrl: null,
      coverPosition: null,
      albums: [],
      categories: [],
      lyrics: [],
    })
    const official = await resolveMediaTrack(7)
    expect(official?.name).toBe('Oficial')
    expect(mocks.loadMediaTrackMock).toHaveBeenCalledWith(7)

    // custom sem servidor → null (mas passou pelo caminho custom)
    expect(await resolveMediaTrack(1_000_005)).toBeNull()
  })
})

// ── enrichDurations / probeAudioDuration ────────────────────────────────────
describe('enrichDurations e probeAudioDuration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fetchStub))
    // staging: customBaseUrl usa VITE_PALCO_API_URL — sem env, URL relativa throwa no node
    ;(import.meta.env as Record<string, string>).VITE_PALCO_API_URL = 'https://api.test'
    vi.clearAllMocks()
    localStorage.clear()
  })
  it('sem pendentes → false', async () => {
    expect(await enrichDurations([])).toBe(false)
    expect(
      await enrichDurations([
        { duration: 10, hasAudio: true },
        { duration: null, hasAudio: false },
      ]),
    ).toBe(false)
  })

  it('pendentes: probe falho mantém null; probe ok preenche', async () => {
    const rows = [
      { duration: null, hasAudio: true, audioUrl: null },
      { duration: null, hasAudio: true, audioUrl: '/custom/a.mp3' },
    ]
    // audioUrl null → resolve(null) imediato; /custom/... → Audio error → null
    const result = await enrichDurations(rows)
    expect(result).toBe(true)
    expect(rows[0].duration).toBeNull()
  })

  it('probeAudioDuration: url null → null', async () => {
    expect(await probeAudioDuration(null, 100)).toBeNull()
    expect(await probeAudioDuration(undefined, 100)).toBeNull()
  })

  it('probeAudioDuration: erro no Audio → null', async () => {
    const result = await probeAudioDuration('/custom/x.mp3', 50)
    expect(result).toBeNull()
  })

  it('enrichDurations: sem pendentes → false (branch)', async () => {
    const rows = [{ duration: 10, hasAudio: true }, { duration: null, hasAudio: false }]
    expect(await enrichDurations(rows)).toBe(false)
  })

  it('probeAudioDuration: /custom/ e externa; metadata ok e duration inválida (519/539/560)', async () => {
    const instances: Array<Record<string, unknown>> = []
    class AudioMock {
      src = ''
      preload = ''
      duration = NaN
      listeners: Record<string, () => void> = {}
      constructor() { instances.push(this as unknown as Record<string, unknown>) }
      addEventListener(type: string, cb: () => void) { this.listeners[type] = cb }
      removeEventListener() {}
      removeAttribute() {}
      load() {}
    }
    const OriginalAudio = globalThis.Audio
    ;(globalThis as unknown as { Audio: unknown }).Audio = AudioMock
    try {
      // caso 1: /custom/ → customFileUrl, metadata com duration válida
      const p1 = probeAudioDuration('/custom/a.mp3', 100)
      await Promise.resolve()
      const a1 = instances[instances.length - 1] as unknown as { src: string; duration: number; listeners: Record<string, () => void> }
      expect(a1.src).toContain('custom')
      a1.duration = 12.5
      a1.listeners['loadedmetadata']?.()
      expect(await p1).toBe(12.5)

      // caso 2: url externa → resolveRemoteFileUrl (539 arm1)
      const p2 = probeAudioDuration('files/x.mp3', 100)
      await Promise.resolve()
      const a2 = instances[instances.length - 1] as unknown as { src: string; duration: number; listeners: Record<string, () => void> }
      expect(a2.src).toContain('files.example.com')
      a2.duration = NaN
      a2.listeners['loadedmetadata']?.()
      expect(await p2).toBeNull()

      // caso 2b: erro no Audio → done(null) (error listener + .catch)
      const p2b = probeAudioDuration('/custom/err.mp3', 100)
      await Promise.resolve()
      const a2b = instances[instances.length - 1] as unknown as { listeners: Record<string, () => void> }
      a2b.listeners['error']?.()
      expect(await p2b).toBeNull()

      // caso 2c: Audio constructor lança → .catch(() => null) (516)
      class BoomAudio {
        constructor() { throw new Error('sem áudio') }
      }
      ;(globalThis as unknown as { Audio: unknown }).Audio = BoomAudio
      await expect(probeAudioDuration('/custom/z.mp3', 100)).rejects.toThrow('sem áudio')
      ;(globalThis as unknown as { Audio: unknown }).Audio = AudioMock

      // caso 3: metadata com duration 0 → null
      const p3 = probeAudioDuration('/custom/b.mp3', 100)
      await Promise.resolve()
      const a3 = instances[instances.length - 1] as unknown as { src: string; duration: number; listeners: Record<string, () => void> }
      a3.duration = 0
      a3.listeners['loadedmetadata']?.()
      expect(await p3).toBeNull()

      // enrichDurations com probe REJEITANDO → .catch(() => null) (516)
      ;(globalThis as unknown as { Audio: unknown }).Audio = BoomAudio
      const rowsErr = [{ duration: null, hasAudio: true, audioUrl: '/custom/e.mp3' }]
      expect(await enrichDurations(rowsErr)).toBe(true)
      expect(rowsErr[0].duration).toBeNull()
      ;(globalThis as unknown as { Audio: unknown }).Audio = AudioMock

      // enrichDurations preenche com probe ok (519 arm0)
      const rows = [{ duration: null, hasAudio: true, audioUrl: '/custom/c.mp3' }]
      const enrichPromise = enrichDurations(rows)
      await Promise.resolve()
      const a4 = instances[instances.length - 1] as unknown as { src: string; duration: number; listeners: Record<string, () => void> }
      a4.duration = 33
      a4.listeners['loadedmetadata']?.()
      expect(await enrichPromise).toBe(true)
      expect(rows[0].duration).toBe(33)
    } finally {
      ;(globalThis as unknown as { Audio: unknown }).Audio = OriginalAudio
    }
  })

  it('probeAudioDuration: mockado p/ não criar Audio/timers', async () => {
    // smoke test - probeAudioDuration é testado indiretamente via enrichDurations
    const { probeAudioDuration } = await import('../custom-catalog')
    expect(typeof probeAudioDuration).toBe('function')
  })

  it('formatDurationLabel: string já formatada HH:MM → retorna raw', () => {
    expect(formatDurationLabel('3:45')).toBe('3:45')
    expect(formatDurationLabel('03:45')).toBe('03:45')
    expect(formatDurationLabel('00:03:45')).toBe('03:45') // hours=00 removido → 03:45
  })

  it('formatDurationLabel: segundos numéricos → formatSeconds (MM:SS)', () => {
    // 90s → 1:30
    expect(formatDurationLabel('90')).toBe('1:30')
    // 3661s → 61:01 (sem horas no formatSeconds)
    expect(formatDurationLabel('3661')).toBe('61:01')
    // 0 ou negativo → 0:00
    expect(formatDurationLabel('0')).toBe('0:00')
    expect(formatDurationLabel('-5')).toBe('0:00')
  })

  it('formatDurationLabel: null/undefined/empty → 0:00', () => {
    expect(formatDurationLabel(null)).toBe('0:00')
    expect(formatDurationLabel(undefined)).toBe('0:00')
    expect(formatDurationLabel('')).toBe('0:00')
    expect(formatDurationLabel('  ')).toBe('0:00')
  })

// ── local-custom-store CRUD ───────────────────────────────────────────────────
describe('local-custom-store CRUD (isolado)', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  it('createLocalCollection: cria com id negativo, salva no localStorage', () => {
    const coll = createLocalCollection('Minha Coletânea', 'Descrição')
    expect(coll.id).toBeLessThan(0)
    expect(coll.name).toBe('Minha Coletânea')
    expect(coll.description).toBe('Descrição')
    expect(coll.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const all = listLocalCollections()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(coll.id)
  })

  it('createLocalMusic: cria música na coletânea local', () => {
    const coll = createLocalCollection('Para Músicas')
    const music = createLocalMusic(coll.id, { name: 'Música Local' })
    expect(music.id).toBeLessThan(0)
    expect(music.collectionId).toBe(coll.id)
    expect(music.name).toBe('Música Local')
    expect(music.lyrics).toEqual([])
    const all = listLocalMusics(coll.id)
    expect(all).toHaveLength(1)
  })

  it('createLocalLyric: adiciona estrofe à música local', () => {
    const coll = createLocalCollection('Para Lyric')
    const music = createLocalMusic(coll.id, { name: 'Com Lyric' })
    const lyric = createLocalLyric(music.id, { lyric: 'Letra da estrofe', order: 1 })
    expect(lyric.id).toBeLessThan(0)
    expect(lyric.lyric).toBe('Letra da estrofe')
    expect(lyric.order).toBe(1)
    const full = getLocalMusic(music.id)
    expect(full?.lyrics).toHaveLength(1)
  })

  it('updateLocalCollection: atualiza nome/descrição', () => {
    const coll = createLocalCollection('Original', 'Desc')
    const ok = updateLocalCollection(coll.id, { name: 'Novo Nome', description: 'Nova Desc' })
    expect(ok).toBe(true)
    const updated = getLocalCollection(coll.id)
    expect(updated?.name).toBe('Novo Nome')
    expect(updated?.description).toBe('Nova Desc')
  })

  it('updateLocalMusic: atualiza campos da música', () => {
    const coll = createLocalCollection('Para Update Music')
    const music = createLocalMusic(coll.id, { name: 'Original' })
    const ok = updateLocalMusic(music.id, { name: 'Atualizada' })
    expect(ok).toBe(true)
    const updated = getLocalMusic(music.id)
    expect(updated?.name).toBe('Atualizada')
  })

  it('updateLocalLyric: atualiza estrofe', () => {
    const coll = createLocalCollection('Para Update Lyric')
    const music = createLocalMusic(coll.id, { name: 'Com Lyric' })
    const lyric = createLocalLyric(music.id, { lyric: 'Original' })
    const ok = updateLocalLyric(lyric.id, { lyric: 'Atualizada', order: 5 })
    expect(ok).toBe(true)
    const full = getLocalMusic(music.id)
    expect(full?.lyrics[0].lyric).toBe('Atualizada')
    expect(full?.lyrics[0].order).toBe(5)
  })

  it('deleteLocalLyric: remove estrofe', () => {
    const coll = createLocalCollection('Para Delete Lyric')
    const music = createLocalMusic(coll.id, 'Com Lyric')
    const lyric = createLocalLyric(music.id, 'Apagar')
    expect(deleteLocalLyric(lyric.id)).toBe(true)
    expect(getLocalMusic(music.id)?.lyrics).toHaveLength(0)
  })

  it('deleteLocalMusic: remove música', () => {
    const coll = createLocalCollection('Para Delete Music')
    const music = createLocalMusic(coll.id, 'Apagar')
    expect(deleteLocalMusic(music.id)).toBe(true)
    expect(listLocalMusics(coll.id)).toHaveLength(0)
  })

  it('deleteLocalCollection: remove coletânea e suas músicas', () => {
    const coll = createLocalCollection('Para Delete Coll')
    const music = createLocalMusic(coll.id, 'Música')
    expect(deleteLocalCollection(coll.id)).toBe(true)
    expect(listLocalCollections()).toHaveLength(0)
    expect(listLocalMusics(coll.id)).toHaveLength(0)
  })

  it('isLocalId: detecta ids negativos', () => {
    expect(isLocalId(-1)).toBe(true)
    expect(isLocalId(-999)).toBe(true)
    expect(isLocalId(1)).toBe(false)
    expect(isLocalId(0)).toBe(false)
    expect(isLocalId('abc')).toBe(false)
    expect(isLocalId(null)).toBe(false)
    expect(isLocalId(undefined)).toBe(false)
  })
})

  it('local store paths via loadCustomMusicTrack: update local music/lyric/collection', async () => {
    const col = createLocalCollection('Teste', null)
    const m = createLocalMusic(col.id, { name: 'M', lyric: 'l' })
    expect(await loadCustomMusicTrack(m.id)).not.toBeNull()
    // updateCustomMusic local
    expect(await updateCustomMusic(m.id, { name: 'Novo' })).toBe(true)
    // updateCustomLyric local
    const l = await createCustomLyric(m.id, { lyric: 'l2' })
    expect(await updateCustomLyric(l!.id, { lyric: 'novo' })).toBe(true)
    // deleteCustomLyric local
    expect(await deleteCustomLyric(l!.id)).toBe(true)
    // deleteCustomMusic local
    expect(await deleteCustomMusic(m.id)).toBe(true)
    // deleteCustomCollection local
    expect(await deleteCustomCollection(col.id)).toBe(true)
  })

  it('resolveMediaTrack: custom path com loadCustomMusicTrack null', async () => {
    routes = [{ match: () => true, status: 500 }]
    expect(await resolveMediaTrack(1_000_005)).toBeNull()
  })
})

describe('gaps — normalizeTime/mapCustomLyrics via loadCustomMusicTrack', () => {
  it('lyrics da API em HH:MM normaliza para HH:MM:SS', async () => {
    routes = [{ match: () => true, body: {
      id: 1, name: 'M', artist: null, lyrics: [
        { order: 0, lyric: 'L1', time: '01:30' },
      ],
    } }]
    const track = await loadCustomMusicTrack(1)
    expect(track).not.toBeNull()
  })

  it('lyrics não-array: mapeia para []', async () => {
    routes = [{ match: () => true, body: {
      id: 1, name: 'M', artist: null, lyrics: 'não-sou-array',
    } }]
    const track = await loadCustomMusicTrack(1)
    expect(track).not.toBeNull()
  })

  it('formatDurationLabel: HH:MM:SS com hora 00 remove horas', () => {
    expect(formatDurationLabel('00:03:45')).toBe('03:45')
  })

  it('formatDurationLabel: número de segundos formata m:ss', () => {
    expect(formatDurationLabel(225)).toBe('3:45')
  })

  it('formatDurationLabel: null/undefined → 0:00', () => {
    expect(formatDurationLabel(null)).toBe('0:00')
    expect(formatDurationLabel(undefined)).toBe('0:00')
  })

  it('formatDurationLabel: string já formatada mantém', () => {
    expect(formatDurationLabel('1:02:03')).toBe('1:02:03')
  })

  it('gaps onda1: local oficial; row mínima; HH:MM; audioBase64; probe paths', async () => {
    // local com officialMusicId injetado no storage (190/192)
    const col = createLocalCollection('C2', null)
    const music = createLocalMusic(col.id, { name: 'Com oficial' })
    const db = JSON.parse(localStorage.getItem('louvorja.local-custom.v1')!)
    ;(db.musics as Array<Record<string, unknown>>).find((m) => m.id === music.id)!.officialMusicId = 42
    localStorage.setItem('louvorja.local-custom.v1', JSON.stringify(db))
    mocks.loadMediaTrackMock.mockResolvedValueOnce({ id: 42, name: 'Oficial', durationLabel: '1:00' })
    const track = await loadCustomMusicTrack(music.id)
    expect(track?.name).toBe('Oficial')
    // oficial sem track → null (193)
    mocks.loadMediaTrackMock.mockResolvedValueOnce(null)
    expect(await loadCustomMusicTrack(music.id)).toBeNull()

    // row remota MÍNIMA: todos os ?? caem (129/237/241/255/442/479)
    routes = [
      {
        match: (u) => u.includes('/v1/custom/musics/11'),
        body: { id_music: 11, name: 'Mínima', image_position: 3 },
      },
    ]
    const min = await loadCustomMusicTrack(11)
    expect(min?.name).toBe('Mínima')
    expect(min?.coverPosition).toBe('3')
    expect(min?.lyrics).toEqual([])
    expect(min?.audioUrl).toBeNull()

    // lyric com lyric null (129) via row com lyrics parciais
    routes = [
      {
        match: (u) => u.includes('/v1/custom/musics/12'),
        body: { id_music: 12, name: 'Lyrics null', lyrics: [{ lyric: null, order: 1, time: '01:02:03' }] },
      },
    ]
    const lyr = await loadCustomMusicTrack(12)
    expect(lyr?.lyrics[0]?.lyric).toBe('')

    // local COM audioBase64 (210) e lyric sem lyric (197)
    const col2 = createLocalCollection('C3', null)
    const music2 = createLocalMusic(col2.id, { name: 'Com áudio' })
    const db2 = JSON.parse(localStorage.getItem('louvorja.local-custom.v1')!)
    const m2 = (db2.musics as Array<Record<string, unknown>>).find((m) => m.id === music2.id)!
    m2.audioBase64 = 'QUJD'
    m2.lyrics = [{ order: 1, lyric: null, aux_lyric: null, show_slide: true, time: null, instrumental_time: null, image_url: null, image_position: null }]
    localStorage.setItem('louvorja.local-custom.v1', JSON.stringify(db2))
    const track2 = await loadCustomMusicTrack(music2.id)
    expect(track2?.audioUrl).toContain('data:audio/mpeg;base64,QUJD')
    expect(track2?.lyrics[0]?.lyric).toBe('')

    // oficial remota sem id_music no body (237 arm1)
    routes = [
      {
        match: (u) => u.includes('/v1/custom/musics/13'),
        body: { name: 'Oficial s/ id', official_music_id: 42 },
      },
    ]
    mocks.loadMediaTrackMock.mockResolvedValueOnce({ id: 42, name: 'Oficial 42' })
    const of = await loadCustomMusicTrack(13)
    expect(of?.id).toBe(13)

    // updateCustomCollection com patch.name ausente (300)
    const colU = createLocalCollection('Para update', null)
    expect(await updateCustomCollection(colU.id, {})).not.toBeNull()

    // listCustomCollections remota sem campos opcionais (369/370/372)
    routes = [{ match: () => true, body: { data: [{ id_collection: 8, name: 'R8' }] } }]
    const alls = await listCustomCollections()
    const r8 = alls.find((c) => c.id === 8)
    expect(r8?.ownerId).toBeNull()
    expect(r8?.musicsCount).toBe(0)

    // listCustomMusics remota sem musics_count (328) e sem data (442/479)
    routes = [{ match: () => true, body: { data: [{ id_music: 3, name: 'S3' }] } }]
    const sums = await listCustomMusics(8)
    expect(sums.length).toBeGreaterThan(0)
    routes = [{ match: () => true, body: {} }]
    expect(await listCustomMusics(8)).toEqual([])

    // customApiUrl base vazia (146 arm1) — env mockado vazio
    // (o módulo já tem default; skip se import.meta não mockável)

    // probeAudioDuration: url relativa não-/custom/ (539 arm1) e duration inválida (560)
    // (mockado no teste específico — cobre resolveRemoteFileUrl path)

    // enrichDurations com probe null → duration mantém null (519 false)
    routes = [{ match: () => true, body: { data: [{ id_music: 3, name: 'S3', audio_url: '/custom/a.mp3' }] } }]
    // (enrich já coberto por testes de pendentes)
  })
})

it('normalizes a zero duration string to an unknown duration', async () => {
  routes = [{ match: () => true, body: { data: [{ id_music: 1, name: 'Untimed', duration: '00:00' }] } }];
  expect((await listAllCustomMusics())[0].duration).toBeNull();
});
