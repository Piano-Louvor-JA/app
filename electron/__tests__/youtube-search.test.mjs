// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  collectSearchResults,
  extractJsonAfter,
  fetchYoutubePlaylist,
  playlistIdFromText,
  videoFromLockup,
  registerYoutubeSearchIpc,
  searchYoutube,
  searchYoutubeMore,
  videoFromRenderer,
} from '../youtube-search.mjs'

const renderer = (id, title, extra = {}) => ({
  videoRenderer: {
    videoId: id,
    title: { runs: [{ text: title }] },
    ownerText: { runs: [{ text: 'Arautos do Rei' }] },
    lengthText: { simpleText: '4:12' },
    shortViewCountText: { simpleText: '1,2 mi de visualizações' },
    publishedTimeText: { simpleText: 'há 3 anos' },
    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/x/default.jpg' }, { url: `https://i.ytimg.com/vi/${id}/hq720.jpg?sqp=abc` }] },
    ...extra,
  },
})
const continuationNode = (token) => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } })
const initialData = {
  contents: {
    sectionListRenderer: {
      contents: [
        { itemSectionRenderer: { contents: [renderer('AAAAAAAAAAA', 'Arautos do Rei - Hino 1'), { adSlotRenderer: {} }, renderer('BBBBBBBBBBB', 'Vox - Hino 2')] } },
        continuationNode('TOKEN-1'),
      ],
    },
  },
}
const page = (data) => `<script>var ytInitialData = ${JSON.stringify(data)};</script><script>ytcfg.set({"INNERTUBE_API_KEY":"KEY123","INNERTUBE_CLIENT_VERSION":"2.20990101.00.00"});</script>`

describe('busca do YouTube pela página de resultados', () => {
  it('lê o JSON depois do marcador respeitando strings', () => {
    expect(extractJsonAfter('x = {"a":"}{\\""};', 'x = ')).toEqual({ a: '}{"' })
    expect(extractJsonAfter('nada', 'x = ')).toBeNull()
    expect(extractJsonAfter('x = sem objeto', 'x = ')).toBeNull()
    expect(extractJsonAfter('x = {"a": quebrado}', 'x = ')).toBeNull()
    expect(extractJsonAfter('x = {"a": "sem fim', 'x = ')).toBeNull()
  })

  it('converte o videoRenderer; sem id válido ou título não entra', () => {
    expect(videoFromRenderer(renderer('AAAAAAAAAAA', ' Hino ').videoRenderer)).toEqual({
      videoId: 'AAAAAAAAAAA',
      title: 'Hino',
      channel: 'Arautos do Rei',
      durationText: '4:12',
      viewsText: '1,2 mi de visualizações',
      publishedText: 'há 3 anos',
      thumbnail: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hq720.jpg',
      live: false,
    })
    expect(videoFromRenderer({ videoId: 'curto', title: { simpleText: 'x' } })).toBeNull()
    expect(videoFromRenderer({ videoId: 'AAAAAAAAAAA' })).toBeNull()
    const live = videoFromRenderer({
      videoId: 'CCCCCCCCCCC',
      title: { simpleText: 'Culto ao vivo' },
      longBylineText: { runs: [{ text: 'Igreja' }] },
      badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW' } }],
    })
    expect(live).toMatchObject({ channel: 'Igreja', durationText: '', live: true, thumbnail: 'https://i.ytimg.com/vi/CCCCCCCCCCC/hqdefault.jpg' })
  })

  it('junta os vídeos em ordem, sem repetir, e acha o token de continuação', () => {
    const data = { a: [renderer('AAAAAAAAAAA', 'Um'), renderer('AAAAAAAAAAA', 'Repetido'), renderer('BBBBBBBBBBB', 'Dois')], b: continuationNode('T') }
    const { items, token } = collectSearchResults(data)
    expect(items.map((i) => i.title)).toEqual(['Um', 'Dois'])
    expect(token).toBe('T')
    expect(collectSearchResults(null)).toEqual({ items: [], token: null })
  })

  it('busca: monta a URL só de vídeos e devolve itens + continuação', async () => {
    const fetch = vi.fn(async () => ({ ok: true, text: async () => page(initialData) }))
    const result = await searchYoutube('  arautos do rei  ', { fetch })
    expect(String(fetch.mock.calls[0][0])).toContain('search_query=arautos%20do%20rei')
    expect(String(fetch.mock.calls[0][0])).toContain('sp=EgIQAQ%253D%253D')
    expect(result.items.map((i) => i.videoId)).toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB'])
    expect(result.continuation).toEqual({ token: 'TOKEN-1', apiKey: 'KEY123', clientVersion: '2.20990101.00.00' })
  })

  it('busca: vazio, HTTP ruim, página sem dados e rede caída não lançam', async () => {
    const fetch = vi.fn()
    expect(await searchYoutube('   ', { fetch })).toEqual({ items: [], continuation: null })
    expect(fetch).not.toHaveBeenCalled()
    expect(await searchYoutube('x', { fetch: async () => ({ ok: false, status: 429 }) })).toMatchObject({ items: [], error: 'http-429' })
    expect(await searchYoutube('x', { fetch: async () => ({ ok: true, text: async () => '<html></html>' }) })).toMatchObject({ error: 'parse' })
    expect(await searchYoutube('x', { fetch: async () => { throw new Error('offline') } })).toMatchObject({ error: 'network' })
    const noToken = await searchYoutube('x', { fetch: async () => ({ ok: true, text: async () => '<script>ytInitialData = {"a":[]};</script>' }) })
    expect(noToken).toEqual({ items: [], continuation: null })
  })

  it('carregar mais: POST com o token e a próxima continuação', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ onResponseReceivedCommands: [{ appendContinuationItemsAction: { continuationItems: [renderer('DDDDDDDDDDD', 'Três'), continuationNode('TOKEN-2')] } }] }),
    }))
    const result = await searchYoutubeMore({ token: 'TOKEN-1', apiKey: 'KEY123', clientVersion: '2.1' }, { fetch })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toContain('key=KEY123')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ continuation: 'TOKEN-1', context: { client: { clientName: 'WEB', clientVersion: '2.1' } } })
    expect(result.items.map((i) => i.videoId)).toEqual(['DDDDDDDDDDD'])
    expect(result.continuation).toEqual({ token: 'TOKEN-2', apiKey: 'KEY123', clientVersion: '2.1' })
  })

  it('carregar mais: sem token, sem chave, HTTP ruim e rede caída', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    expect(await searchYoutubeMore(null, { fetch })).toEqual({ items: [], continuation: null })
    expect(await searchYoutubeMore({ token: 'T' }, { fetch })).toEqual({ items: [], continuation: null })
    expect(fetch.mock.calls[0][0]).not.toContain('key=')
    expect(await searchYoutubeMore({ token: 'T' }, { fetch: async () => ({ ok: false, status: 500 }) })).toMatchObject({ error: 'http-500' })
    expect(await searchYoutubeMore({ token: 'T' }, { fetch: async () => { throw new Error('x') } })).toMatchObject({ error: 'network' })
  })

  it('registra os canais de IPC', async () => {
    const handlers = {}
    const fetch = vi.fn(async () => ({ ok: true, text: async () => page(initialData), json: async () => ({}) }))
    registerYoutubeSearchIpc({ handle: (channel, fn) => { handlers[channel] = fn } }, { fetch })
    expect((await handlers['youtube-search:query']({}, 'hino')).items).toHaveLength(2)
    expect((await handlers['youtube-search:query']({}, undefined)).items).toEqual([])
    expect(await handlers['youtube-search:more']({}, { token: 'T' })).toEqual({ items: [], continuation: null })
  })
})

describe('playlist do YouTube', () => {
  const plRenderer = (id, title) => ({
    playlistVideoRenderer: {
      videoId: id,
      title: { runs: [{ text: title }] },
      shortBylineText: { runs: [{ text: 'Arautos do Rei' }] },
      lengthText: { simpleText: '3:11' },
      thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg?x=1` }] },
    },
  })
  const pageData = {
    metadata: { playlistMetadataRenderer: { title: 'Hinos de Natal' } },
    contents: [plRenderer('AAAAAAAAAAA', 'Um'), plRenderer('BBBBBBBBBBB', 'Dois'), continuationNode('PL-T1')],
  }
  const html = (data) => `<script>var ytInitialData = ${JSON.stringify(data)};</script>"INNERTUBE_API_KEY":"K","INNERTUBE_CLIENT_VERSION":"2.1"`

  it('reconhece o id no link ou colado direto', () => {
    expect(playlistIdFromText('https://www.youtube.com/playlist?list=PLabcdefghij1234')).toBe('PLabcdefghij1234')
    expect(playlistIdFromText('youtube.com/watch?v=AAAAAAAAAAA&list=PLabcdefghij1234&index=2')).toBe('PLabcdefghij1234')
    expect(playlistIdFromText('https://music.youtube.com/playlist?list=OLAK5uy_abcdefghijk')).toBe('OLAK5uy_abcdefghijk')
    expect(playlistIdFromText('PLabcdefghij1234')).toBe('PLabcdefghij1234')
    expect(playlistIdFromText('https://www.youtube.com/watch?v=AAAAAAAAAAA')).toBeNull()
    // Como o Flute: qualquer texto com list= (link de vídeo dentro da playlist, youtu.be, com texto em volta).
    expect(playlistIdFromText('https://www.youtube.com/watch?v=ax-25gXlmBk&list=PLyTP3IYISkzAKBIqgfseYGmhBwZxd0h2V')).toBe('PLyTP3IYISkzAKBIqgfseYGmhBwZxd0h2V')
    expect(playlistIdFromText('olha: https://youtu.be/ax-25gXlmBk?si=x&list=PLyTP3IYISkzAKBIqgfseYGmhBwZxd0h2V&t=3')).toBe('PLyTP3IYISkzAKBIqgfseYGmhBwZxd0h2V')
    expect(playlistIdFromText('https://www.youtube.com/watch?v=ax-25gXlmBk&list=curto')).toBeNull()
    expect(playlistIdFromText('')).toBeNull()
    expect(playlistIdFromText('não é link nenhum ://')).toBeNull()
  })

  it('formato novo do YouTube (lockupViewModel): vídeos com canal, duração e capa', async () => {
    const lockup = (id, title, extra = {}) => ({
      lockupViewModel: {
        contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
        contentId: id,
        metadata: { lockupMetadataViewModel: {
          title: { content: title },
          metadata: { contentMetadataViewModel: { metadataRows: [
            { metadataParts: [{ text: { content: 'Adoradores Novo Tempo' } }] },
            { metadataParts: [{ text: { content: '2,1 mi de visualizações' } }, { text: { content: 'há 3 anos' } }] },
          ] } },
        } },
        contentImage: { thumbnailViewModel: {
          image: { sources: [{ url: 'https://i.ytimg.com/vi/x/small.jpg' }, { url: `https://i.ytimg.com/vi/${id}/hq.jpg?sqp=1` }] },
          overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: '4:05' } }] } }],
        } },
        ...extra,
      },
    })
    expect(videoFromLockup(lockup('ax-25gXlmBk', ' Meu Pastor ').lockupViewModel)).toEqual({
      videoId: 'ax-25gXlmBk',
      title: 'Meu Pastor',
      channel: 'Adoradores Novo Tempo',
      durationText: '4:05',
      viewsText: '2,1 mi de visualizações',
      publishedText: 'há 3 anos',
      thumbnail: 'https://i.ytimg.com/vi/ax-25gXlmBk/hq.jpg',
      live: false,
    })
    // Playlist/canal no meio da página e sem dados: fora.
    expect(videoFromLockup({ contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentId: 'PLx' })).toBeNull()
    expect(videoFromLockup({ contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'curto' })).toBeNull()
    expect(videoFromLockup({ contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'AAAAAAAAAAA', metadata: { lockupMetadataViewModel: { title: { content: 'Só título' } } } }))
      .toMatchObject({ channel: '', durationText: '', thumbnail: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' })

    const data = {
      metadata: { playlistMetadataRenderer: { title: 'Adoradores 4' } },
      contents: [lockup('ax-25gXlmBk', 'Meu Pastor'), { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentId: 'PLz' } }, lockup('BBBBBBBBBBB', 'Dois')],
    }
    const fetch = vi.fn(async () => ({ ok: true, text: async () => html(data) }))
    const result = await fetchYoutubePlaylist('https://www.youtube.com/watch?v=ax-25gXlmBk&list=PLyTP3IYISkzAKBIqgfseYGmhBwZxd0h2V', { fetch })
    expect(String(fetch.mock.calls[0][0])).toContain('list=PLyTP3IYISkzAKBIqgfseYGmhBwZxd0h2V')
    expect(result.title).toBe('Adoradores 4')
    expect(result.items.map((i) => i.title)).toEqual(['Meu Pastor', 'Dois'])  })

  it('lê título e vídeos, e as próximas páginas sem repetir', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => html(pageData) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ x: [plRenderer('BBBBBBBBBBB', 'Dois'), plRenderer('CCCCCCCCCCC', 'Três'), continuationNode('PL-T2')] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ x: [plRenderer('CCCCCCCCCCC', 'Três')] }) })
    const result = await fetchYoutubePlaylist('https://www.youtube.com/playlist?list=PLabcdefghij1234', { fetch })
    expect(result.title).toBe('Hinos de Natal')
    expect(result.items.map((i) => i.title)).toEqual(['Um', 'Dois', 'Três'])
    expect(result.items[0]).toMatchObject({ channel: 'Arautos do Rei', durationText: '3:11', thumbnail: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' })
    expect(String(fetch.mock.calls[1][0])).toContain('/youtubei/v1/browse')
    expect(String(fetch.mock.calls[1][0])).toContain('key=K')
    expect(JSON.parse(fetch.mock.calls[1][1].body).continuation).toBe('PL-T1')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('link inválido, HTTP ruim, página sem dados, vazia e rede caída', async () => {
    expect(await fetchYoutubePlaylist('nada', { fetch: vi.fn() })).toMatchObject({ error: 'invalid' })
    const id = 'PLabcdefghij1234'
    expect(await fetchYoutubePlaylist(id, { fetch: async () => ({ ok: false, status: 404 }) })).toMatchObject({ error: 'http-404' })
    expect(await fetchYoutubePlaylist(id, { fetch: async () => ({ ok: true, text: async () => '<html>' }) })).toMatchObject({ error: 'parse' })
    const empty = await fetchYoutubePlaylist(id, { fetch: async () => ({ ok: true, text: async () => html({ header: { playlistHeaderRenderer: { title: { simpleText: 'Vazia' } } } }) }) })
    expect(empty).toEqual({ title: 'Vazia', items: [], error: 'empty' })
    expect(await fetchYoutubePlaylist(id, { fetch: async () => { throw new Error('x') } })).toMatchObject({ error: 'network' })
    // Próxima página falhando: fica com a primeira.
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => html({ microformat: { microformatDataRenderer: { title: 'Micro' } }, c: [plRenderer('AAAAAAAAAAA', 'Um'), continuationNode('T')] }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
    const partial = await fetchYoutubePlaylist(id, { fetch })
    expect(partial).toMatchObject({ title: 'Micro' })
    expect(partial.items).toHaveLength(1)
    const handlers = {}
    registerYoutubeSearchIpc({ handle: (c, fn) => { handlers[c] = fn } }, { fetch: vi.fn() })
    expect(await handlers['youtube-search:playlist']({}, 'nada')).toMatchObject({ error: 'invalid' })
    expect(await handlers['youtube-search:playlist']({}, undefined)).toMatchObject({ error: 'invalid' })
  })
})
