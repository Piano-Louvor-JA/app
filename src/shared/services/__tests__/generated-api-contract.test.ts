import { afterEach, describe, expect, it, vi } from 'vitest'

import * as albums from '../../api-generated/albums/albums'
import * as bible from '../../api-generated/bible/bible'
import * as categories from '../../api-generated/categories/categories'
import * as custom from '../../api-generated/custom/custom'
import * as health from '../../api-generated/health/health'
import * as musics from '../../api-generated/musics/musics'
import {
  GetV1AlbumsId200MusicsItemHasInstrumentalMusic,
  GetV1CustomRankingMeWindow,
  GetV1CustomRankingWindow,
  GetV1Musics200DataItemHasInstrumentalMusic,
  GetV1MusicsId200LyricItemShowSlide,
  PostV1CustomCollectionsBodyVisibility,
  PostV1CustomFilesBodyKind,
  PutV1CustomCollectionsIdBodyVisibility,
} from '../../api-generated/model'

type Result = { data: unknown; status: number; headers: Headers }
type Transport = (...args: unknown[]) => Promise<Result>
type Contract = {
  name: string
  call: Transport
  args: unknown[]
  method: string
  path: string
  query?: boolean
  json?: boolean
}

// Contratos de transporte: nenhum request sai do processo. As rotas esperadas
// são explícitas para detectar deriva de URL, método, headers e serialização.
const endpoints: Contract[] = []
function endpoint(
  module: object, name: string, method: string, path: string,
  args: unknown[] = [], extra: Partial<Contract> = {},
) {
  endpoints.push({ name, call: (module as Record<string, Transport>)[name]!, method, path, args, ...extra })
}

for (const [module, name, path, args] of [
  [albums, 'getV1Albums', '/v1/albums', []],
  [albums, 'getV1AlbumsId', '/v1/albums/7', ['7']],
  [musics, 'getV1Musics', '/v1/musics', []],
  [musics, 'getV1MusicsId', '/v1/musics/7', ['7']],
  [categories, 'getV1Categories', '/v1/categories', []],
  [categories, 'getV1CategoriesId', '/v1/categories/7', ['7']],
  [bible, 'getV1Bible', '/v1/bible', []],
  [bible, 'getV1BibleBookIdChapter', '/v1/bible/1/2', ['1', '2']],
  [custom, 'getV1CustomRanking', '/v1/custom/ranking', []],
  [custom, 'getV1CustomRankingMe', '/v1/custom/ranking/me', []],
] as const) {
  endpoint(module, name, 'GET', path, [...args, undefined], { query: true })
}
endpoint(health, 'getV1Health', 'GET', '/v1/health')

for (const [name, method, path, args] of [
  ['getV1CustomCollections', 'GET', '/collections', []],
  ['getV1CustomCollectionsId', 'GET', '/collections/7', ['7']],
  ['deleteV1CustomCollectionsId', 'DELETE', '/collections/7', ['7']],
  ['getV1CustomMusics', 'GET', '/musics', []],
  ['getV1CustomCollectionsIdMusics', 'GET', '/collections/7/musics', ['7']],
  ['postV1CustomCollectionsIdMusicsMusicIdCopy', 'POST', '/collections/7/musics/11/copy', ['7', '11']],
  ['getV1CustomMusicsId', 'GET', '/musics/7', ['7']],
  ['deleteV1CustomMusicsId', 'DELETE', '/musics/7', ['7']],
  ['getV1CustomMusicsIdLyrics', 'GET', '/musics/7/lyrics', ['7']],
  ['deleteV1CustomLyricsId', 'DELETE', '/lyrics/7', ['7']],
  ['postV1CustomAuthFirebaseSession', 'POST', '/auth/firebase-session', []],
  ['postV1CustomAuthLogout', 'POST', '/auth/logout', []],
  ['getV1CustomAuthMe', 'GET', '/auth/me', []],
  ['postV1CustomCollectionsIdUse', 'POST', '/collections/7/use', ['7']],
  ['getV1CustomWeeklyTasks', 'GET', '/weekly-tasks', []],
  ['postV1CustomWeeklyTasksTaskIdComplete', 'POST', '/weekly-tasks/7/complete', ['7']],
  ['getV1CustomNotifications', 'GET', '/notifications', []],
  ['postV1CustomNotificationsReadAll', 'POST', '/notifications/read-all', []],
  ['getV1CustomSeasonalEvent', 'GET', '/seasonal-event', []],
] as const) {
  endpoint(custom, name, method, `/v1/custom${path}`, [...args])
}

for (const [name, method, path, ids, body] of [
  ['postV1CustomCollections', 'POST', '/collections', [], { name: 'Hinário local' }],
  ['putV1CustomCollectionsId', 'PUT', '/collections/7', ['7'], { name: 'Culto' }],
  ['postV1CustomCollectionsIdMusics', 'POST', '/collections/7/musics', ['7'], { name: 'Hino', lyric: 'Fé e esperança' }],
  ['putV1CustomMusicsId', 'PUT', '/musics/7', ['7'], { name: 'Hino revisado' }],
  ['postV1CustomMusicsIdLyrics', 'POST', '/musics/7/lyrics', ['7'], { lyric: 'Esperança' }],
  ['putV1CustomLyricsId', 'PUT', '/lyrics/7', ['7'], { lyric: 'Fé' }],
  ['postV1CustomAuthRegister', 'POST', '/auth/register', [], { email: 'operator@example.test', password: 'test-only-password', displayName: 'Operador' }],
  ['postV1CustomAuthLogin', 'POST', '/auth/login', [], { email: 'operator@example.test', password: 'test-only-password' }],
  ['postV1CustomAuthForgotPassword', 'POST', '/auth/forgot-password', [], { email: 'operator@example.test' }],
  ['postV1CustomAuthResetPassword', 'POST', '/auth/reset-password', [], { token: 'test-only-token', password: 'test-only-password' }],
  ['postV1CustomCollectionsIdReport', 'POST', '/collections/7/report', ['7'], { reason: 'Conteúdo duplicado' }],
  ['postV1CustomAdminPromoteMusic', 'POST', '/admin/promote-music', [], { custom_music_id: 7, official_music_id: 11 }],
] as const) {
  endpoint(custom, name, method, `/v1/custom${path}`, [...ids, body], { json: true })
}

afterEach(() => vi.unstubAllGlobals())

it('mantém os valores públicos usados no protocolo e nos dados persistidos', () => {
  // Flags numéricas não podem virar boolean, nem enums traduzirem seus valores.
  expect([
    GetV1AlbumsId200MusicsItemHasInstrumentalMusic,
    GetV1Musics200DataItemHasInstrumentalMusic,
    GetV1MusicsId200LyricItemShowSlide,
  ]).toEqual(Array(3).fill({ NUMBER_0: 0, NUMBER_1: 1 }))
  expect([GetV1CustomRankingWindow, GetV1CustomRankingMeWindow])
    .toEqual(Array(2).fill({ week: 'week', all: 'all' }))
  expect([PostV1CustomCollectionsBodyVisibility, PutV1CustomCollectionsIdBodyVisibility])
    .toEqual(Array(2).fill({ public: 'public', private: 'private' }))
  expect(PostV1CustomFilesBodyKind).toEqual({ audio: 'audio', imagens: 'imagens' })
})

describe.each(endpoints)('$name — contrato HTTP', ({ name, call, args, method, path, query, json }) => {
  // Logout tem resposta de sucesso void no OpenAPI; os demais têm corpo JSON.
  const emptyData = name === 'postV1CustomAuthLogout' ? undefined : {}
  it('preserva opções, método, rota, corpo e resposta JSON', async () => {
    const response = new Response(JSON.stringify({ id: 7, name: 'Fé' }), {
      status: 200, headers: { 'X-Request-Id': 'request-7' },
    })
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    const result = await call(...args, { signal, credentials: 'include' })
    expect(fetch).toHaveBeenCalledWith(path, expect.objectContaining({ method, signal, credentials: 'include' }))
    const init = fetch.mock.calls[0]![1] as RequestInit
    if (json) {
      expect(init.body).toBe(JSON.stringify(args.at(-1)))
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    } else {
      expect(init.body).toBeUndefined()
    }
    expect(result).toEqual({ data: { id: 7, name: 'Fé' }, status: 200, headers: response.headers })
  })

  it.each([204, 205, 304])('não tenta interpretar JSON no status %i', async status => {
    const text = vi.fn().mockRejectedValue(new Error('não deve ler corpo sem conteúdo'))
    const headers = new Headers({ 'ETag': 'version-7' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, headers, text }))
    expect(await call(...args)).toEqual({ data: emptyData, status, headers })
    expect(text).not.toHaveBeenCalled()
  })

  it('aceita resposta vazia e preserva erro HTTP com corpo JSON', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response('{"error":"indisponível"}', { status: 500 }))
    vi.stubGlobal('fetch', fetch)
    expect((await call(...args)).data).toEqual(emptyData)
    expect(await call(...args)).toMatchObject({ status: 500, data: { error: 'indisponível' } })
  })

  it('propaga falha de rede e JSON inválido ao consumidor', async () => {
    const failure = new TypeError('offline')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(new Response('invalid JSON')))
    await expect(call(...args)).rejects.toBe(failure)
    await expect(call(...args)).rejects.toBeInstanceOf(SyntaxError)
  })

  if (query) {
    it('codifica parâmetros, distingue null e omite undefined', async () => {
      const fetch = vi.fn().mockResolvedValue(new Response('[]'))
      vi.stubGlobal('fetch', fetch)
      const values = { lang: 'es', search: 'fé & paz', page: 2, optional: undefined, empty: null }
      await call(...args.slice(0, -1), values)
      const url = new URL(fetch.mock.calls[0]![0] as string, 'http://localhost')
      expect(url.pathname).toBe(path)
      expect([...url.searchParams]).toEqual([
        ['lang', 'es'], ['search', 'fé & paz'], ['page', '2'], ['empty', 'null'],
      ])
    })
  }

  if (json) {
    it.each([
      new Headers({ Authorization: 'Bearer test-only' }),
      [['Authorization', 'Bearer test-only']] as [string, string][],
      { Authorization: 'Bearer test-only', 'X-Omitted': undefined } as unknown as HeadersInit,
    ])('mescla headers sem perder autenticação (%j)', async headers => {
      const fetch = vi.fn().mockResolvedValue(new Response('{}'))
      vi.stubGlobal('fetch', fetch)
      await call(...args, { headers })
      const sent = new Headers((fetch.mock.calls[0]![1] as RequestInit).headers)
      expect(sent.get('Authorization')).toBe('Bearer test-only')
      expect(sent.get('Content-Type')).toBe('application/json')
      expect(sent.has('X-Omitted')).toBe(false)
    })
  }
})

describe('upload de mídia — contrato multipart', () => {
  it.each([undefined, {}, { file: new Blob(['hino'], { type: 'audio/mpeg' }), kind: 'audio' as const }])(
    'envia somente campos fornecidos, sem fixar boundary (%j)', async body => {
      const fetch = vi.fn().mockResolvedValue(new Response('{"id":7}', { status: 201 }))
      vi.stubGlobal('fetch', fetch)
      const response = await custom.postV1CustomFiles(body)
      const [url, init] = fetch.mock.calls[0]! as [string, RequestInit]
      expect(url).toBe('/v1/custom/files')
      expect(init.method).toBe('POST')
      expect(new Headers(init.headers).has('Content-Type')).toBe(false)
      const form = init.body as FormData
      expect(form.has('file')).toBe(body?.file !== undefined)
      expect(form.get('kind')).toBe(body?.kind ?? null)
      if (body?.file) expect((form.get('file') as File).size).toBe(body.file.size)
      expect(response).toMatchObject({ status: 201, data: { id: 7 } })
    },
  )

  it.each([204, 205, 304])('aceita upload sem resposta JSON (%i)', async status => {
    const text = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, headers: new Headers(), text }))
    expect((await custom.postV1CustomFiles()).data).toEqual({})
    expect(text).not.toHaveBeenCalled()
  })

  it('aceita corpo vazio no upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')))
    expect((await custom.postV1CustomFiles()).data).toEqual({})
  })
})
