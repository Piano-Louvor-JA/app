import { beforeEach, describe, expect, it } from 'vitest'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import {
  YOUTUBE_COLLECTION_NAME_MAX,
  YOUTUBE_COLLECTION_VIDEOS_MAX,
  addVideoToYoutubeCollection,
  addVideosToYoutubeCollection,
  collectionHasVideo,
  createYoutubeCollection,
  deleteYoutubeCollection,
  listYoutubeCollections,
  moveVideoInYoutubeCollection,
  removeVideoFromYoutubeCollection,
  renameYoutubeCollection,
  reorderVideosInYoutubeCollection,
  reorderYoutubeCollections,
} from '../services/youtube-collections'

const A = 'AAAAAAAAAAA'
const B = 'BBBBBBBBBBB'
const C = 'CCCCCCCCCCC'

function create(name = 'Culto jovem', now = 1) {
  const { created } = createYoutubeCollection(name, now)
  if (!created) throw new Error('não criou')
  return created
}

describe('coletâneas online do módulo YouTube', () => {
  beforeEach(() => localStorage.clear())

  it('arrastar reordena as coletâneas e os vídeos de uma coletânea', () => {
    const one = create('Um', 1)
    const two = create('Dois', 2)
    const three = create('Três', 3)
    expect(reorderYoutubeCollections(three.id, one.id).map((c) => c.name)).toEqual(['Três', 'Um', 'Dois'])
    expect(listYoutubeCollections().map((c) => c.name)).toEqual(['Três', 'Um', 'Dois'])
    expect(two.id).toBeTruthy()

    addVideosToYoutubeCollection(one.id, [{ videoId: A, title: 'A' }, { videoId: B, title: 'B' }, { videoId: C, title: 'C' }], 5)
    const moved = reorderVideosInYoutubeCollection(one.id, A, C, 9).find((c) => c.id === one.id)
    expect(moved?.videos.map((v) => v.videoId)).toEqual([B, C, A])
    expect(moved?.updatedAt).toBe(9)
    const same = reorderVideosInYoutubeCollection(one.id, A, A, 10).find((c) => c.id === one.id)
    expect(same?.updatedAt).toBe(9)
    expect(reorderVideosInYoutubeCollection('nao-existe', A, B)).toHaveLength(3)
  })

  it('roundtrip: criar e adicionar vídeos sobrevive a recarregar', () => {
    const col = create('  Culto   jovem  ', 10)
    addVideoToYoutubeCollection(col.id, { videoId: A, title: ' Sim Eu Creio ', channel: 'Arautos do Rei', thumbnail: 'a.jpg', durationText: '3:11' }, 20)
    addVideoToYoutubeCollection(col.id, { videoId: B, title: '' }, 30)
    const [reloaded] = listYoutubeCollections()
    expect(reloaded).toEqual({
      id: col.id,
      name: 'Culto jovem',
      createdAt: 10,
      updatedAt: 30,
      videos: [
        { videoId: A, title: 'Sim Eu Creio', channel: 'Arautos do Rei', thumbnail: 'a.jpg', durationText: '3:11', addedAt: 20 },
        { videoId: B, title: B, channel: '', thumbnail: '', durationText: '', addedAt: 30 },
      ],
    })
    expect(collectionHasVideo(reloaded, A)).toBe(true)
    expect(collectionHasVideo(reloaded, C)).toBe(false)
  })

  it('nome vazio não cria; nome longo é cortado; id único por coletânea', () => {
    expect(createYoutubeCollection('   ').created).toBeNull()
    const long = create('x'.repeat(200))
    expect(long.name).toHaveLength(YOUTUBE_COLLECTION_NAME_MAX)
    expect(create('Outra').id).not.toBe(long.id)
    expect(listYoutubeCollections()).toHaveLength(2)
  })

  it('renomear, excluir e id desconhecido', () => {
    const col = create('Velho')
    expect(renameYoutubeCollection(col.id, ' Novo ', 5)[0]).toMatchObject({ name: 'Novo', updatedAt: 5 })
    expect(renameYoutubeCollection(col.id, '  ', 6)[0]).toMatchObject({ name: 'Novo', updatedAt: 5 })
    expect(renameYoutubeCollection('nao-existe', 'x')).toHaveLength(1)
    expect(deleteYoutubeCollection(col.id)).toEqual([])
  })

  it('não repete vídeo, ignora id inválido e respeita o limite', () => {
    const col = create()
    addVideoToYoutubeCollection(col.id, { videoId: A, title: 'a' })
    addVideoToYoutubeCollection(col.id, { videoId: A, title: 'de novo' })
    expect(addVideoToYoutubeCollection(col.id, { videoId: 'ruim', title: 'x' })[0].videos).toHaveLength(1)
    for (let i = 0; i < YOUTUBE_COLLECTION_VIDEOS_MAX + 2; i++) {
      addVideoToYoutubeCollection(col.id, { videoId: `id${String(i).padStart(9, '0')}`, title: `v${i}` })
    }
    expect(listYoutubeCollections()[0].videos).toHaveLength(YOUTUBE_COLLECTION_VIDEOS_MAX)
  })

  it('mover para cima/baixo e remover', () => {
    const col = create()
    for (const id of [A, B, C]) addVideoToYoutubeCollection(col.id, { videoId: id, title: id })
    const ids = () => listYoutubeCollections()[0].videos.map((v) => v.videoId)
    moveVideoInYoutubeCollection(col.id, C, -1)
    expect(ids()).toEqual([A, C, B])
    moveVideoInYoutubeCollection(col.id, A, -1)
    moveVideoInYoutubeCollection(col.id, B, 1)
    moveVideoInYoutubeCollection(col.id, 'naoexiste01', 1)
    expect(ids()).toEqual([A, C, B])
    moveVideoInYoutubeCollection(col.id, A, 1)
    expect(ids()).toEqual([C, A, B])
    removeVideoFromYoutubeCollection(col.id, A)
    removeVideoFromYoutubeCollection(col.id, A)
    expect(ids()).toEqual([C, B])
  })

  it('ignora dado corrompido no storage', () => {
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeCollections, JSON.stringify({ x: 1 }))
    expect(listYoutubeCollections()).toEqual([])
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeCollections, JSON.stringify([
      null,
      { id: '', name: 'sem id' },
      { id: 'a', name: '  ' },
      { id: 'b', name: 'Boa', createdAt: 'x', videos: [{ videoId: A, title: 't' }, { videoId: A }, { videoId: 'ruim' }, 5] },
      { id: 'b', name: 'Duplicada' },
      { id: 'c', name: 'Sem lista', videos: 'nada' },
    ]))
    expect(listYoutubeCollections()).toEqual([
      { id: 'b', name: 'Boa', createdAt: 0, updatedAt: 0, videos: [{ videoId: A, title: 't', channel: '', thumbnail: '', durationText: '', addedAt: 0 }] },
      { id: 'c', name: 'Sem lista', createdAt: 0, updatedAt: 0, videos: [] },
    ])
  })
})

describe('coletânea a partir de playlist (vários de uma vez)', () => {
  beforeEach(() => localStorage.clear())
  it('adiciona em ordem, sem repetir nem id inválido, até o limite; nada novo não grava', () => {
    const { created } = createYoutubeCollection('Natal', 1)
    const id = created!.id
    addVideoToYoutubeCollection(id, { videoId: A, title: 'já estava' }, 2)
    const list = addVideosToYoutubeCollection(id, [
      { videoId: B, title: ' Dois ', channel: 'Vox' },
      { videoId: A, title: 'repetido' },
      { videoId: 'ruim', title: 'x' },
      { videoId: C, title: '' },
    ], 3)
    expect(list[0].videos.map((v) => [v.videoId, v.title])).toEqual([[A, 'já estava'], [B, 'Dois'], [C, C]])
    expect(list[0].updatedAt).toBe(3)
    expect(addVideosToYoutubeCollection(id, [{ videoId: A, title: 'a' }], 9)[0].updatedAt).toBe(3)
    const many = Array.from({ length: YOUTUBE_COLLECTION_VIDEOS_MAX + 5 }, (_, i) => ({ videoId: `id${String(i).padStart(9, '0')}`, title: `v${i}` }))
    expect(addVideosToYoutubeCollection(id, many)[0].videos).toHaveLength(YOUTUBE_COLLECTION_VIDEOS_MAX)
  })
})
