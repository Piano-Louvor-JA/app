// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  CHANNEL_MAX_PLAYLISTS,
  adventistQuery,
  channelFromRenderer,
  channelPathFromText,
  collectChannelPlaylists,
  fetchYoutubeChannel,
  playlistFromLockup,
  registerYoutubeSearchIpc,
  searchYoutubeChannels,
} from '../youtube-search.mjs'

/** Playlist no formato novo do YouTube (2025+), como vem na aba "Playlists" do canal. */
const lockup = (id, title, count = '31 vídeos') => ({
  lockupViewModel: {
    contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
    contentId: id,
    contentImage: { collectionThumbnailViewModel: { primaryThumbnail: { thumbnailViewModel: {
      image: { sources: [{ url: `https://i.ytimg.com/vi/${id.slice(-11)}/hqdefault.jpg?sqp=-oay&rs=AOn` }] },
      overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: count } }] } }],
    } } } },
    metadata: { lockupMetadataViewModel: { title: { content: title } } },
  },
})
/** Formato antigo, que o YouTube ainda pode servir. */
const grid = (id, title, count = '12') => ({
  gridPlaylistRenderer: {
    playlistId: id,
    title: { runs: [{ text: title }] },
    videoCountText: { runs: [{ text: count }, { text: ' vídeos' }] },
    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/x/default.jpg' }, { url: 'https://i.ytimg.com/vi/GGGGGGGGGGG/hqdefault.jpg?x=1' }] },
  },
})
const continuationNode = (token) => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } })
const metadata = {
  channelMetadataRenderer: {
    title: 'Casa Publicadora Brasileira',
    externalId: 'UCQhkLOO40bmTMeLcbspKW8A',
    vanityChannelUrl: 'http://www.youtube.com/@casapublicadora',
    channelUrl: 'https://www.youtube.com/channel/UCQhkLOO40bmTMeLcbspKW8A',
    avatar: { thumbnails: [{ url: 'https://yt3.googleusercontent.com/avatar=s900' }] },
  },
}
const html = (data) => `<script>var ytInitialData = ${JSON.stringify(data)};</script>"INNERTUBE_API_KEY":"K","INNERTUBE_CLIENT_VERSION":"2.1"`

describe('canal do YouTube: link → caminho', () => {
  it('aceita @handle, link do canal (qualquer aba), /channel/UC…, /c/ e /user/', () => {
    expect(channelPathFromText('@casapublicadora')).toBe('@casapublicadora')
    expect(channelPathFromText(' https://www.youtube.com/@casapublicadora ')).toBe('@casapublicadora')
    expect(channelPathFromText('https://www.youtube.com/@casapublicadora/videos?x=1')).toBe('@casapublicadora')
    expect(channelPathFromText('m.youtube.com/@Arautos.do-Rei_1/playlists')).toBe('@Arautos.do-Rei_1')
    expect(channelPathFromText('https://www.youtube.com/channel/UCQhkLOO40bmTMeLcbspKW8A/featured')).toBe('channel/UCQhkLOO40bmTMeLcbspKW8A')
    expect(channelPathFromText('UCQhkLOO40bmTMeLcbspKW8A')).toBe('channel/UCQhkLOO40bmTMeLcbspKW8A')
    expect(channelPathFromText('https://youtube.com/c/NovoTempo')).toBe('c/NovoTempo')
    expect(channelPathFromText('https://youtube.com/user/voxmusic')).toBe('user/voxmusic')
  })

  it('aceita @handle com acento, colado ou no link (codificado)', () => {
    expect(channelPathFromText('@HinárioAntigoAdventista')).toBe('@HinárioAntigoAdventista')
    expect(channelPathFromText('https://www.youtube.com/@S%C3%B3Louvor-z2o')).toBe('@SóLouvor-z2o')
    expect(channelPathFromText('https://www.youtube.com/@SóLouvor-z2o/videos')).toBe('@SóLouvor-z2o')
  })

  it('recusa vídeo, playlist, outro site e texto qualquer', () => {
    expect(channelPathFromText('https://www.youtube.com/watch?v=AAAAAAAAAAA')).toBeNull()
    expect(channelPathFromText('https://www.youtube.com/playlist?list=PLabcdefghij1234')).toBeNull()
    expect(channelPathFromText('https://example.com/@casapublicadora')).toBeNull()
    expect(channelPathFromText('casa publicadora')).toBeNull()
    expect(channelPathFromText('@')).toBeNull()
    expect(channelPathFromText('')).toBeNull()
    expect(channelPathFromText(undefined)).toBeNull()
  })
})

describe('playlists de um canal', () => {
  it('lê a playlist do formato novo: id, título, capa sem parâmetros e número de vídeos', () => {
    expect(playlistFromLockup(lockup('PLAPpcKnpMfeO9Fydpl1tTKC9CRRnIMMSK', ' Novo Hinário 1-100 ', '1.234 vídeos').lockupViewModel)).toEqual({
      id: 'PLAPpcKnpMfeO9Fydpl1tTKC9CRRnIMMSK',
      title: 'Novo Hinário 1-100',
      thumbnail: 'https://i.ytimg.com/vi/C9CRRnIMMSK/hqdefault.jpg',
      videoCount: 1234,
    })
    expect(playlistFromLockup({ contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'AAAAAAAAAAA' })).toBeNull()
    expect(playlistFromLockup({ contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentId: 'PLabcdefghij1234' })).toBeNull()
    expect(playlistFromLockup({ contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentId: 'x', metadata: { lockupMetadataViewModel: { title: { content: 'T' } } } })).toBeNull()
    expect(playlistFromLockup({ contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentId: 'PLabcdefghij1234', metadata: { lockupMetadataViewModel: { title: { content: 'Sem capa' } } } }))
      .toEqual({ id: 'PLabcdefghij1234', title: 'Sem capa', thumbnail: '', videoCount: 0 })
  })

  it('junta os dois formatos, na ordem, sem repetir, e pega o token da próxima página', () => {
    const root = { a: [lockup('PLaaaaaaaaaa01', 'Um'), grid('PLbbbbbbbbbb02', 'Dois'), lockup('PLaaaaaaaaaa01', 'Um de novo'), continuationNode('T1')] }
    const { items, token } = collectChannelPlaylists(root)
    expect(items.map((p) => p.title)).toEqual(['Um', 'Dois'])
    expect(items[1]).toEqual({ id: 'PLbbbbbbbbbb02', title: 'Dois', thumbnail: 'https://i.ytimg.com/vi/GGGGGGGGGGG/hqdefault.jpg', videoCount: 12 })
    expect(token).toBe('T1')
  })
})

describe('fetchYoutubeChannel', () => {
  const pageData = { metadata, contents: [lockup('PLaaaaaaaaaa01', 'Hinário 1-100'), lockup('PLaaaaaaaaaa02', 'Hinário 101-200'), continuationNode('CH-T1')] }

  it('lê o canal pela aba Playlists e as próximas páginas, sem repetir', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => html(pageData) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ x: [lockup('PLaaaaaaaaaa02', 'Hinário 101-200'), lockup('PLaaaaaaaaaa03', 'Hinário 201-300'), continuationNode('CH-T2')] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ x: [lockup('PLaaaaaaaaaa03', 'Hinário 201-300')] }) })

    const result = await fetchYoutubeChannel('https://www.youtube.com/@casapublicadora/videos', { fetch })

    expect(String(fetch.mock.calls[0][0])).toBe('https://www.youtube.com/@casapublicadora/playlists?hl=pt-BR')
    expect(String(fetch.mock.calls[1][0])).toContain('/youtubei/v1/browse')
    expect(String(fetch.mock.calls[1][0])).toContain('key=K')
    expect(JSON.parse(fetch.mock.calls[1][1].body).continuation).toBe('CH-T1')
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result.error).toBeUndefined()
    expect(result.channel).toEqual({
      id: 'UCQhkLOO40bmTMeLcbspKW8A',
      name: 'Casa Publicadora Brasileira',
      url: 'https://www.youtube.com/@casapublicadora',
      avatar: 'https://yt3.googleusercontent.com/avatar=s900',
    })
    expect(result.playlists.map((p) => p.title)).toEqual(['Hinário 1-100', 'Hinário 101-200', 'Hinário 201-300'])
  })

  it('handle com acento vai codificado na URL', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 404 }))
    await fetchYoutubeChannel('@SóLouvor-z2o', { fetch })
    expect(String(fetch.mock.calls[0][0])).toBe('https://www.youtube.com/@S%C3%B3Louvor-z2o/playlists?hl=pt-BR')
  })

  it('canal sem link curto usa o /channel/UC…; sem avatar fica vazio', async () => {
    const data = { metadata: { channelMetadataRenderer: { title: 'Arautos', externalId: 'UCxxxxxxxxxxxxxxxxxxxxxx', channelUrl: 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx' } }, c: [lockup('PLaaaaaaaaaa01', 'Um')] }
    const result = await fetchYoutubeChannel('UCxxxxxxxxxxxxxxxxxxxxxx', { fetch: async () => ({ ok: true, text: async () => html(data) }) })
    expect(result.channel).toEqual({ id: 'UCxxxxxxxxxxxxxxxxxxxxxx', name: 'Arautos', url: 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx', avatar: '' })
  })

  it(`para em ${CHANNEL_MAX_PLAYLISTS} playlists`, async () => {
    const many = Array.from({ length: CHANNEL_MAX_PLAYLISTS + 5 }, (_, i) => lockup(`PLmany${String(i).padStart(8, '0')}`, `P${i}`))
    const result = await fetchYoutubeChannel('@canal', { fetch: async () => ({ ok: true, text: async () => html({ metadata, c: many }) }) })
    expect(result.playlists).toHaveLength(CHANNEL_MAX_PLAYLISTS)
  })

  it('link inválido, HTTP ruim, página sem dados, canal sem playlists e rede caída', async () => {
    expect(await fetchYoutubeChannel('https://www.youtube.com/watch?v=AAAAAAAAAAA', { fetch: vi.fn() })).toEqual({ channel: null, playlists: [], error: 'invalid' })
    expect(await fetchYoutubeChannel('@canal', { fetch: async () => ({ ok: false, status: 404 }) })).toEqual({ channel: null, playlists: [], error: 'http-404' })
    expect(await fetchYoutubeChannel('@canal', { fetch: async () => ({ ok: true, text: async () => '<html>' }) })).toEqual({ channel: null, playlists: [], error: 'parse' })
    // Página sem os dados do canal (ex.: verificação de robô)
    expect(await fetchYoutubeChannel('@canal', { fetch: async () => ({ ok: true, text: async () => html({ c: [lockup('PLaaaaaaaaaa01', 'Um')] }) }) })).toEqual({ channel: null, playlists: [], error: 'parse' })
    const empty = await fetchYoutubeChannel('@canal', { fetch: async () => ({ ok: true, text: async () => html({ metadata }) }) })
    expect(empty).toMatchObject({ playlists: [], error: 'empty' })
    expect(empty.channel?.name).toBe('Casa Publicadora Brasileira')
    expect(await fetchYoutubeChannel('@canal', { fetch: async () => { throw new Error('x') } })).toEqual({ channel: null, playlists: [], error: 'network' })
    // Próxima página falhando: fica com a primeira.
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => html(pageData) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
    expect((await fetchYoutubeChannel('@canal', { fetch })).playlists).toHaveLength(2)
  })

  it('fica disponível pelo IPC youtube-search:channel', async () => {
    const handlers = {}
    registerYoutubeSearchIpc({ handle: (c, fn) => { handlers[c] = fn } }, { fetch: vi.fn() })
    expect(await handlers['youtube-search:channel']({}, 'nada aqui')).toMatchObject({ error: 'invalid' })
    expect(await handlers['youtube-search:channel']({}, undefined)).toMatchObject({ error: 'invalid' })
  })
})

/** Canal no resultado da busca do YouTube (`channelRenderer`). Os campos vêm trocados: handle em `subscriberCountText`, inscritos em `videoCountText`. */
const channelRenderer = (id, name, handle = '@canal', subscribers = '14 mil inscritos', extra = {}) => ({
  channelRenderer: {
    channelId: id,
    title: { simpleText: name },
    navigationEndpoint: { browseEndpoint: { browseId: id, canonicalBaseUrl: `/${handle}` } },
    thumbnail: { thumbnails: [{ url: '//yt3.ggpht.com/a=s88-c' }, { url: '//yt3.ggpht.com/a=s176-c' }] },
    descriptionSnippet: { runs: [{ text: 'Louvor ', bold: true }, { text: 'adventista para a família.' }] },
    subscriberCountText: { simpleText: handle },
    videoCountText: { simpleText: subscribers },
    ...extra,
  },
})

describe('busca de canais adventistas', () => {
  it('a busca sempre puxa para canais adventistas (sem repetir a palavra)', () => {
    expect(adventistQuery('louvor')).toBe('louvor adventista')
    expect(adventistQuery('  hinos   de   natal ')).toBe('hinos de natal adventista')
    expect(adventistQuery('Igreja Adventista Central')).toBe('Igreja Adventista Central')
    expect(adventistQuery('ADVENTISTAS jovens')).toBe('ADVENTISTAS jovens')
    expect(adventistQuery('   ')).toBe('')
    expect(adventistQuery(undefined)).toBe('')
    expect(adventistQuery('x'.repeat(500))).toHaveLength(200)
  })

  it('lê o canal do resultado: id, nome, @, inscritos, avatar com https e descrição', () => {
    expect(channelFromRenderer(channelRenderer('UCaaaaaaaaaaaaaaaaaaaaaa', ' Vitrola Adventista ', '@vitrolAdventista', '12,1 mil inscritos').channelRenderer)).toEqual({
      id: 'UCaaaaaaaaaaaaaaaaaaaaaa',
      name: 'Vitrola Adventista',
      handle: '@vitrolAdventista',
      subscribers: '12,1 mil inscritos',
      avatar: 'https://yt3.ggpht.com/a=s176-c',
      description: 'Louvor adventista para a família.',
      url: 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa',
    })
    // ordem "certa" dos campos (como o YouTube já serviu) também funciona
    const swapped = channelRenderer('UCaaaaaaaaaaaaaaaaaaaaaa', 'X', '@x1', '5 inscritos', {
      subscriberCountText: { simpleText: '5 inscritos' },
      videoCountText: { simpleText: '@x1' },
    }).channelRenderer
    expect(channelFromRenderer(swapped)).toMatchObject({ handle: '@x1', subscribers: '5 inscritos' })
    // sem handle, sem avatar, sem descrição
    expect(channelFromRenderer({ channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', title: { simpleText: 'Só nome' } }))
      .toEqual({ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Só nome', handle: '', subscribers: '', avatar: '', description: '', url: 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa' })
    expect(channelFromRenderer({ channelId: 'nao', title: { simpleText: 'X' } })).toBeNull()
    expect(channelFromRenderer({ channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', title: { simpleText: ' ' } })).toBeNull()
    expect(channelFromRenderer(null)).toBeNull()
  })

  it('busca pela página de resultados com filtro de canais e devolve a lista sem repetir', async () => {
    const data = { contents: [
      channelRenderer('UCaaaaaaaaaaaaaaaaaaaaaa', 'Louvor Adventista'),
      { videoRenderer: { videoId: 'AAAAAAAAAAA', title: { runs: [{ text: 'vídeo no meio' }] } } },
      channelRenderer('UCbbbbbbbbbbbbbbbbbbbbbb', 'Hinário Adventista', '@HinárioAntigoAdventista'),
      channelRenderer('UCaaaaaaaaaaaaaaaaaaaaaa', 'Louvor Adventista'),
    ] }
    const fetch = vi.fn(async () => ({ ok: true, text: async () => html(data) }))
    const result = await searchYoutubeChannels(' louvor ', { fetch })
    const url = String(fetch.mock.calls[0][0])
    expect(url).toContain('search_query=louvor%20adventista')
    expect(url).toContain('sp=EgIQAg%253D%253D')
    expect(result.error).toBeUndefined()
    expect(result.items.map((c) => c.name)).toEqual(['Louvor Adventista', 'Hinário Adventista'])
  })

  it('texto vazio não busca; HTTP ruim, página sem dados, nada achado e rede caída', async () => {
    const fetch = vi.fn()
    expect(await searchYoutubeChannels('  ', { fetch })).toEqual({ items: [] })
    expect(fetch).not.toHaveBeenCalled()
    expect(await searchYoutubeChannels('louvor', { fetch: async () => ({ ok: false, status: 429 }) })).toEqual({ items: [], error: 'http-429' })
    expect(await searchYoutubeChannels('louvor', { fetch: async () => ({ ok: true, text: async () => '<html>' }) })).toEqual({ items: [], error: 'parse' })
    expect(await searchYoutubeChannels('louvor', { fetch: async () => ({ ok: true, text: async () => html({ contents: [] }) }) })).toEqual({ items: [], error: 'empty' })
    expect(await searchYoutubeChannels('louvor', { fetch: async () => { throw new Error('x') } })).toEqual({ items: [], error: 'network' })
  })

  it('fica disponível pelo IPC youtube-search:channels', async () => {
    const handlers = {}
    registerYoutubeSearchIpc({ handle: (c, fn) => { handlers[c] = fn } }, { fetch: vi.fn() })
    expect(await handlers['youtube-search:channels']({}, undefined)).toEqual({ items: [] })
  })
})
