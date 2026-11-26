import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import type { YoutubeChannelResult, YoutubePlaylistResult, YoutubeSearchItem } from '@shared/types/desktop-bridge'

import {
  CPB_CHANNEL,
  channelCovers,
  createChannelPlaylistLoader,
  fetchYoutubeChannelInfo,
  filterChannelVideos,
  searchAdventistChannels,
  findYoutubeChannel,
  findYoutubeChannelPlaylist,
  listYoutubeChannels,
  loadChannelVideos,
  playlistCover,
  removeYoutubeChannel,
  saveYoutubeChannel,
} from '../services/youtube-channels'

function item(videoId: string, title = videoId): YoutubeSearchItem {
  return { videoId, title, channel: 'Casa Publicadora Brasileira', durationText: '', viewsText: '', publishedText: '', thumbnail: '', live: false }
}

describe('canais padrão do YouTube', () => {
  it('já vem com o canal da Casa Publicadora Brasileira', () => {
    const channels = listYoutubeChannels()
    expect(channels.map((c) => c.id)).toEqual(['cpb'])
    expect(channels[0]).toBe(CPB_CHANNEL)
    expect(CPB_CHANNEL.name).toBe('Casa Publicadora Brasileira')
    expect(CPB_CHANNEL.url).toBe('https://www.youtube.com/@casapublicadora')
    expect(CPB_CHANNEL.subtitle).toBe('Novo Hinário Adventista')
    // abrir o canal lista todos os hinos numa lista só
    expect(CPB_CHANNEL.merged).toBe(true)
  })

  it('traz o Novo Hinário Adventista completo, em ordem, de 1 a 600', () => {
    expect(CPB_CHANNEL.playlists.map((p) => p.name)).toEqual([
      'Novo Hinário Adventista 1 - 100',
      'Novo Hinário Adventista 101 - 200',
      'Novo Hinário Adventista 201 - 300',
      'Novo Hinário Adventista 301 - 400',
      'Novo Hinário Adventista 401 - 500',
      'Novo Hinário Adventista 501 - 600',
    ])
    for (const p of CPB_CHANNEL.playlists) {
      expect(p.id).toMatch(/^PL[\w-]{32}$/)
      expect(p.coverVideoId).toMatch(/^[\w-]{11}$/)
    }
    expect(new Set(CPB_CHANNEL.playlists.map((p) => p.id)).size).toBe(6)
  })

  it('acha canal e playlist pelo id; id desconhecido dá null', () => {
    expect(findYoutubeChannel('cpb')).toBe(CPB_CHANNEL)
    expect(findYoutubeChannel('outro')).toBeNull()
    expect(findYoutubeChannel(null)).toBeNull()
    const first = CPB_CHANNEL.playlists[0]
    expect(findYoutubeChannelPlaylist(CPB_CHANNEL, first.id)).toBe(first)
    expect(findYoutubeChannelPlaylist(CPB_CHANNEL, 'PLnada')).toBeNull()
    expect(findYoutubeChannelPlaylist(null, first.id)).toBeNull()
    expect(findYoutubeChannelPlaylist(CPB_CHANNEL, null)).toBeNull()
  })

  it('capas: a da playlist é a miniatura do primeiro hino; a do canal, as 4 primeiras playlists', () => {
    const first = CPB_CHANNEL.playlists[0]
    expect(playlistCover(first)).toBe(`https://i.ytimg.com/vi/${first.coverVideoId}/hqdefault.jpg`)
    expect(channelCovers(CPB_CHANNEL)).toEqual(CPB_CHANNEL.playlists.slice(0, 4).map(playlistCover))
  })
})

describe('createChannelPlaylistLoader', () => {
  const ID = CPB_CHANNEL.playlists[0].id

  it('busca a playlist pelo id e guarda o resultado (segunda vez não vai à rede)', async () => {
    const fetcher = vi.fn(async (): Promise<YoutubePlaylistResult> => ({ title: 'x', items: [item('AAAAAAAAAAA'), item('BBBBBBBBBBB')] }))
    const loader = createChannelPlaylistLoader(fetcher)
    expect(loader.cached(ID)).toBeNull()

    const first = await loader.load(ID)
    expect(fetcher).toHaveBeenCalledWith(ID)
    expect(first).toEqual({ items: [item('AAAAAAAAAAA'), item('BBBBBBBBBBB')] })
    expect(loader.cached(ID)).toEqual(first.items)

    const again = await loader.load(ID)
    expect(again.items).toBe(first.items)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('pedidos simultâneos da mesma playlist viram uma requisição só', async () => {
    let resolve: (r: YoutubePlaylistResult) => void = () => {}
    const fetcher = vi.fn(() => new Promise<YoutubePlaylistResult>((r) => { resolve = r }))
    const loader = createChannelPlaylistLoader(fetcher)
    const a = loader.load(ID)
    const b = loader.load(ID)
    resolve({ title: '', items: [item('AAAAAAAAAAA')] })
    expect(await a).toEqual(await b)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('erro não fica guardado: a próxima tentativa vai à rede de novo', async () => {
    const fetcher = vi.fn<(id: string) => Promise<YoutubePlaylistResult>>()
      .mockResolvedValueOnce({ title: '', items: [], error: 'network' })
      .mockResolvedValueOnce({ title: '', items: [item('AAAAAAAAAAA')] })
    const loader = createChannelPlaylistLoader(fetcher)

    expect(await loader.load(ID)).toEqual({ items: [], error: 'network' })
    expect(loader.cached(ID)).toBeNull()
    expect(await loader.load(ID)).toEqual({ items: [item('AAAAAAAAAAA')] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('playlist sem vídeos e sem erro vira erro "empty"', async () => {
    const loader = createChannelPlaylistLoader(async () => ({ title: '', items: [] }))
    expect(await loader.load(ID)).toEqual({ items: [], error: 'empty' })
    expect(loader.cached(ID)).toBeNull()
  })

  it('exceção do fetcher vira erro "network", sem lançar', async () => {
    const loader = createChannelPlaylistLoader(async () => { throw new Error('offline') })
    expect(await loader.load(ID)).toEqual({ items: [], error: 'network' })
  })

  it('force ignora o guardado e busca de novo', async () => {
    const fetcher = vi.fn(async (): Promise<YoutubePlaylistResult> => ({ title: '', items: [item('AAAAAAAAAAA')] }))
    const loader = createChannelPlaylistLoader(fetcher)
    await loader.load(ID)
    await loader.load(ID, { force: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('sem fetcher usa a leitura de playlist do app (sem bridge: "unavailable")', async () => {
    const loader = createChannelPlaylistLoader()
    expect(await loader.load(ID)).toEqual({ items: [], error: 'unavailable' })
  })
})

describe('loadChannelVideos (canal unido)', () => {
  const [p1, p2, p3] = CPB_CHANNEL.playlists
  const channel = { ...CPB_CHANNEL, playlists: [p1, p2, p3] }

  it('junta os vídeos de todas as playlists, na ordem delas, sem repetir', async () => {
    const byId: Record<string, YoutubeSearchItem[]> = {
      [p1.id]: [item('AAAAAAAAAAA', 'Hino 1'), item('BBBBBBBBBBB', 'Hino 2')],
      [p2.id]: [item('CCCCCCCCCCC', 'Hino 101'), item('BBBBBBBBBBB', 'Hino 2')],
      [p3.id]: [item('DDDDDDDDDDD', 'Hino 201')],
    }
    const loader = createChannelPlaylistLoader(async (id) => ({ title: '', items: byId[id] }))
    const result = await loadChannelVideos(channel, loader)
    expect(result.error).toBeUndefined()
    expect(result.items.map((v) => v.title)).toEqual(['Hino 1', 'Hino 2', 'Hino 101', 'Hino 201'])
  })

  it('uma playlist vazia não impede as outras', async () => {
    const loader = createChannelPlaylistLoader(async (id) => ({ title: '', items: id === p2.id ? [] : [item(id.slice(-11), id)] }))
    const result = await loadChannelVideos(channel, loader)
    expect(result.items).toHaveLength(2)
    expect(result.error).toBeUndefined()
  })

  it('se uma playlist falha, não mostra o hinário pela metade; a nova tentativa só busca a que faltou', async () => {
    const fetcher = vi.fn(async (id: string): Promise<YoutubePlaylistResult> => ({ title: '', items: [item(id.slice(-11), id)] }))
    fetcher.mockImplementationOnce(async (id) => ({ title: '', items: [item(id.slice(-11), id)] }))
      .mockImplementationOnce(async () => ({ title: '', items: [], error: 'network' }))
    const loader = createChannelPlaylistLoader(fetcher)

    expect(await loadChannelVideos(channel, loader)).toEqual({ items: [], error: 'network' })
    const retry = await loadChannelVideos(channel, loader)
    expect(retry.items).toHaveLength(3)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('todas vazias vira "empty"', async () => {
    const loader = createChannelPlaylistLoader(async () => ({ title: '', items: [] }))
    expect(await loadChannelVideos(channel, loader)).toEqual({ items: [], error: 'empty' })
  })
})

describe('filterChannelVideos', () => {
  const list = [
    item('AAAAAAAAAAA', 'Novo Hinário Adventista • Hino 1  • Santo Santo Santo! • (Lyrics)'),
    item('BBBBBBBBBBB', 'Novo Hinário Adventista • Hino 15 • Castelo Forte • (Lyrics)'),
    item('CCCCCCCCCCC', 'Novo Hinário Adventista • Hino 115 • Olhar • (Lyrics)'),
    item('DDDDDDDDDDD', 'Novo Hinário Adventista • Hino 150 • Graça • (Lyrics)'),
  ]

  it('número acha exatamente o hino com esse número', () => {
    expect(filterChannelVideos(list, '15').map((v) => v.videoId)).toEqual(['BBBBBBBBBBB'])
    expect(filterChannelVideos(list, ' 1 ').map((v) => v.videoId)).toEqual(['AAAAAAAAAAA'])
    expect(filterChannelVideos(list, '015').map((v) => v.videoId)).toEqual(['BBBBBBBBBBB'])
    expect(filterChannelVideos(list, '999')).toEqual([])
  })

  it('texto filtra pelo título, sem acento e sem diferenciar maiúsculas', () => {
    expect(filterChannelVideos(list, 'graca').map((v) => v.videoId)).toEqual(['DDDDDDDDDDD'])
    expect(filterChannelVideos(list, 'CASTELO forte').map((v) => v.videoId)).toEqual(['BBBBBBBBBBB'])
  })

  it('vazio devolve a lista toda', () => {
    expect(filterChannelVideos(list, '  ')).toEqual(list)
  })
})

describe('canais cadastrados pelo usuário', () => {
  const result = (id = 'UCaaaaaaaaaaaaaaaaaaaaaa', name = 'Arautos do Rei', playlists = 2): YoutubeChannelResult => ({
    channel: { id, name, url: 'https://www.youtube.com/@arautos', avatar: 'https://yt3.googleusercontent.com/a=s900' },
    playlists: Array.from({ length: playlists }, (_, i) => ({ id: `PLarautos${String(i).padStart(6, '0')}`, title: `Álbum ${i + 1}`, thumbnail: `https://i.ytimg.com/vi/thumb${i}/hqdefault.jpg`, videoCount: 10 + i })),
  })

  beforeEach(() => localStorage.clear())

  it('cadastra o canal depois do padrão, com as playlists, e sobrevive a recarregar (roundtrip)', () => {
    const saved = saveYoutubeChannel(result(), 1000)
    expect(saved.status).toBe('added')
    expect(saved.channel).toMatchObject({ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Arautos do Rei', userAdded: true, addedAt: 1000, avatar: 'https://yt3.googleusercontent.com/a=s900' })
    expect(saved.list.map((c) => c.id)).toEqual(['cpb', 'UCaaaaaaaaaaaaaaaaaaaaaa'])

    // "recarregar": tudo vem do armazenamento
    const reloaded = listYoutubeChannels()
    expect(reloaded.map((c) => c.id)).toEqual(['cpb', 'UCaaaaaaaaaaaaaaaaaaaaaa'])
    const channel = findYoutubeChannel('UCaaaaaaaaaaaaaaaaaaaaaa')
    expect(channel?.merged).toBeFalsy()
    expect(channel?.url).toBe('https://www.youtube.com/@arautos')
    expect(channel?.playlists).toEqual([
      { id: 'PLarautos000000', name: 'Álbum 1', thumbnail: 'https://i.ytimg.com/vi/thumb0/hqdefault.jpg', videoCount: 10 },
      { id: 'PLarautos000001', name: 'Álbum 2', thumbnail: 'https://i.ytimg.com/vi/thumb1/hqdefault.jpg', videoCount: 11 },
    ])
    expect(playlistCover(channel!.playlists[0])).toBe('https://i.ytimg.com/vi/thumb0/hqdefault.jpg')
  })

  it('cadastrar de novo atualiza (nome e playlists) sem duplicar e sem perder a data', () => {
    saveYoutubeChannel(result(), 1000)
    const again = saveYoutubeChannel(result('UCaaaaaaaaaaaaaaaaaaaaaa', 'Arautos (novo)', 3), 2000)
    expect(again.status).toBe('updated')
    expect(listYoutubeChannels().map((c) => c.name)).toEqual(['Casa Publicadora Brasileira', 'Arautos (novo)'])
    expect(findYoutubeChannel('UCaaaaaaaaaaaaaaaaaaaaaa')).toMatchObject({ addedAt: 1000 })
    expect(findYoutubeChannel('UCaaaaaaaaaaaaaaaaaaaaaa')?.playlists).toHaveLength(3)
  })

  it('o canal da CPB já vem no app: cadastrar não duplica', () => {
    const saved = saveYoutubeChannel(result(CPB_CHANNEL.youtubeId, 'Casa Publicadora Brasileira'))
    expect(saved.status).toBe('default')
    expect(saved.channel).toBe(CPB_CHANNEL)
    expect(listYoutubeChannels()).toHaveLength(1)
  })

  it('resultado sem canal ou sem playlists não cadastra', () => {
    expect(saveYoutubeChannel({ channel: null, playlists: [], error: 'network' }).status).toBe('invalid')
    expect(saveYoutubeChannel(result('UCaaaaaaaaaaaaaaaaaaaaaa', 'Sem nada', 0)).status).toBe('invalid')
    expect(listYoutubeChannels()).toHaveLength(1)
  })

  it('exclui o canal cadastrado; o padrão não sai', () => {
    saveYoutubeChannel(result())
    expect(removeYoutubeChannel('UCaaaaaaaaaaaaaaaaaaaaaa').map((c) => c.id)).toEqual(['cpb'])
    expect(removeYoutubeChannel('cpb').map((c) => c.id)).toEqual(['cpb'])
    expect(listYoutubeChannels()).toHaveLength(1)
  })

  it('dado salvo inválido é descartado (id, nome, playlists repetidas ou sem id)', () => {
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeChannels, JSON.stringify([
      { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: ' Vox ', url: 'https://www.youtube.com/@vox', avatar: 7, addedAt: 'x', playlists: [
        { id: 'PLvox000000001', name: 'Um', thumbnail: 'https://i.ytimg.com/vi/x/hqdefault.jpg', videoCount: 3 },
        { id: 'PLvox000000001', name: 'Repetida' },
        { id: 'curto', name: 'Inválida' },
        { id: 'PLvox000000002', name: '' },
        'lixo',
      ] },
      { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Vox repetido', playlists: [] },
      { id: 'nao-e-canal', name: 'X', playlists: [] },
      { id: 'UCcccccccccccccccccccccc', name: '', playlists: [] },
      null,
    ]))
    const channels = listYoutubeChannels()
    expect(channels.map((c) => c.id)).toEqual(['cpb', 'UCbbbbbbbbbbbbbbbbbbbbbb'])
    expect(channels[1]).toMatchObject({ name: 'Vox', url: 'https://www.youtube.com/@vox', avatar: '', addedAt: 0, userAdded: true })
    expect(channels[1].playlists).toEqual([{ id: 'PLvox000000001', name: 'Um', thumbnail: 'https://i.ytimg.com/vi/x/hqdefault.jpg', videoCount: 3 }])
    // sem url salva: monta o link pelo id
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeChannels, JSON.stringify([{ id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Vox', playlists: [] }]))
    expect(listYoutubeChannels()[1].url).toBe('https://www.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb')
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeChannels, '{"x":1}')
    expect(listYoutubeChannels()).toHaveLength(1)
  })

  it('capa do canal cadastrado: as capas das playlists; sem capas, o avatar', () => {
    const { channel } = saveYoutubeChannel(result('UCaaaaaaaaaaaaaaaaaaaaaa', 'A', 5))
    expect(channelCovers(channel!)).toEqual([0, 1, 2, 3].map((i) => `https://i.ytimg.com/vi/thumb${i}/hqdefault.jpg`))
    const bare = { ...channel!, playlists: channel!.playlists.map((p) => ({ ...p, thumbnail: '' })) }
    expect(channelCovers(bare)).toEqual(['https://yt3.googleusercontent.com/a=s900'])
    expect(channelCovers({ ...bare, avatar: '' })).toEqual([])
  })
})

describe('fetchYoutubeChannelInfo', () => {
  it('sem o app desktop: "unavailable"', async () => {
    expect(await fetchYoutubeChannelInfo('@arautos')).toEqual({ channel: null, playlists: [], error: 'unavailable' })
  })

  it('usa a ponte do desktop; exceção vira "network"', async () => {
    const channel = vi.fn(async () => ({ channel: null, playlists: [], error: 'invalid' }))
    ;(window as unknown as { louvorja: unknown }).louvorja = { ytSearch: { channel } }
    try {
      expect(await fetchYoutubeChannelInfo('x')).toEqual({ channel: null, playlists: [], error: 'invalid' })
      expect(channel).toHaveBeenCalledWith('x')
      channel.mockResolvedValueOnce(undefined as never)
      expect(await fetchYoutubeChannelInfo('x')).toEqual({ channel: null, playlists: [], error: 'network' })
      channel.mockRejectedValueOnce(new Error('ipc'))
      expect(await fetchYoutubeChannelInfo('x')).toEqual({ channel: null, playlists: [], error: 'network' })
    } finally {
      delete (window as unknown as { louvorja?: unknown }).louvorja
    }
  })
})

describe('searchAdventistChannels', () => {
  it('sem o app desktop: "unavailable"', async () => {
    expect(await searchAdventistChannels('louvor')).toEqual({ items: [], error: 'unavailable' })
  })

  it('usa a ponte do desktop; resposta vazia ou exceção vira "network"', async () => {
    const item = { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Louvor', handle: '', subscribers: '', avatar: '', description: '', url: 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa' }
    const channels = vi.fn(async () => ({ items: [item] }))
    ;(window as unknown as { louvorja: unknown }).louvorja = { ytSearch: { channels } }
    try {
      expect(await searchAdventistChannels('louvor')).toEqual({ items: [item] })
      expect(channels).toHaveBeenCalledWith('louvor')
      channels.mockResolvedValueOnce(undefined as never)
      expect(await searchAdventistChannels('x')).toEqual({ items: [], error: 'network' })
      channels.mockRejectedValueOnce(new Error('ipc'))
      expect(await searchAdventistChannels('x')).toEqual({ items: [], error: 'network' })
    } finally {
      delete (window as unknown as { louvorja?: unknown }).louvorja
    }
  })
})
