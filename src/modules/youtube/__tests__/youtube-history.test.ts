import { beforeEach, describe, expect, it } from 'vitest'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import {
  YOUTUBE_HISTORY_MAX,
  YOUTUBE_RECENT_QUERIES_MAX,
  clearYoutubeHistory,
  filterYoutubeHistory,
  forgetYoutubeQuery,
  listYoutubeHistory,
  listYoutubeRecentQueries,
  recordYoutubePlay,
  rememberYoutubeQuery,
  removeYoutubeHistoryEntry,
  reorderYoutubeFavorites,
  reorderYoutubeHistory,
  toggleYoutubeFavorite,
  listYoutubeFavorites,
} from '../services/youtube-history'

const A = 'AAAAAAAAAAA'
const B = 'BBBBBBBBBBB'

describe('histórico do módulo YouTube', () => {
  beforeEach(() => localStorage.clear())

  it('roundtrip: o que tocou sobrevive a recarregar (lê de novo do storage)', () => {
    recordYoutubePlay({ videoId: A, title: 'Arautos do Rei - Hino', channel: 'Arautos', durationText: '4:12', thumbnail: 't.jpg' }, 1000)
    const reloaded = listYoutubeHistory()
    expect(reloaded).toEqual([
      { videoId: A, title: 'Arautos do Rei - Hino', channel: 'Arautos', thumbnail: 't.jpg', durationText: '4:12', playedAt: 1000, playCount: 1 },
    ])
    expect(JSON.parse(localStorage.getItem(BROWSER_STORAGE_KEYS.youtubeHistory) ?? '[]')).toHaveLength(1)
  })

  it('tocar de novo sobe para o topo, soma reproduções e mantém os dados antigos', () => {
    recordYoutubePlay({ videoId: A, title: 'Um', channel: 'Vox', thumbnail: 'a.jpg', durationText: '3:00' }, 1000)
    recordYoutubePlay({ videoId: B, title: 'Dois' }, 2000)
    const list = recordYoutubePlay({ videoId: A, title: '  ' }, 3000)
    expect(list.map((e) => e.videoId)).toEqual([A, B])
    expect(list[0]).toMatchObject({ title: 'Um', channel: 'Vox', thumbnail: 'a.jpg', durationText: '3:00', playCount: 2, playedAt: 3000 })
    expect(list[1]).toMatchObject({ title: 'Dois', channel: '', playCount: 1 })
  })

  it('id inválido não grava; título vazio vira o id', () => {
    expect(recordYoutubePlay({ videoId: 'x', title: 'y' })).toEqual([])
    expect(recordYoutubePlay({ videoId: A, title: '' }, 5)[0].title).toBe(A)
  })

  it('limite de itens, remover um e limpar tudo', () => {
    for (let i = 0; i < YOUTUBE_HISTORY_MAX + 5; i++) {
      recordYoutubePlay({ videoId: `id${String(i).padStart(9, '0')}`, title: `v${i}` }, i + 1)
    }
    const list = listYoutubeHistory()
    expect(list).toHaveLength(YOUTUBE_HISTORY_MAX)
    expect(list[0].title).toBe(`v${YOUTUBE_HISTORY_MAX + 4}`)
    expect(removeYoutubeHistoryEntry(list[0].videoId)).toHaveLength(YOUTUBE_HISTORY_MAX - 1)
    expect(clearYoutubeHistory()).toEqual([])
    expect(listYoutubeHistory()).toEqual([])
  })

  it('arrastar reordena o histórico e a ordem sobrevive a recarregar; tocar de novo volta ao topo', () => {
    const C = 'CCCCCCCCCCC'
    recordYoutubePlay({ videoId: A, title: 'A' }, 1)
    recordYoutubePlay({ videoId: B, title: 'B' }, 2)
    recordYoutubePlay({ videoId: C, title: 'C' }, 3)
    expect(listYoutubeHistory().map((e) => e.videoId)).toEqual([C, B, A])
    expect(reorderYoutubeHistory(C, A).map((e) => e.videoId)).toEqual([B, A, C])
    expect(listYoutubeHistory().map((e) => e.videoId)).toEqual([B, A, C])
    expect(reorderYoutubeHistory(C, B).map((e) => e.videoId)).toEqual([C, B, A])
    expect(reorderYoutubeHistory(A, 'naoexiste01').map((e) => e.videoId)).toEqual([C, B, A])
    recordYoutubePlay({ videoId: A, title: 'A' }, 4)
    expect(listYoutubeHistory().map((e) => e.videoId)).toEqual([A, C, B])
  })

  it('arrastar reordena os favoritos', () => {
    toggleYoutubeFavorite({ videoId: A, title: 'A' }, 1)
    toggleYoutubeFavorite({ videoId: B, title: 'B' }, 2)
    expect(listYoutubeFavorites().map((e) => e.videoId)).toEqual([B, A])
    expect(reorderYoutubeFavorites(B, A).map((e) => e.videoId)).toEqual([A, B])
    expect(listYoutubeFavorites().map((e) => e.videoId)).toEqual([A, B])
  })

  it('ignora dado corrompido no storage', () => {
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeHistory, JSON.stringify({ nope: true }))
    expect(listYoutubeHistory()).toEqual([])
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeHistory, JSON.stringify([
      null,
      { videoId: 'ruim' },
      { videoId: A, title: 'Ok', playedAt: 'x', playCount: -3 },
      { videoId: A, title: 'Duplicado', playedAt: 99 },
      { videoId: B, title: 7, playedAt: 50, playCount: 2.7 },
    ]))
    // A ordem é a da lista salva (o operador pode ter arrastado), não a data.
    expect(listYoutubeHistory()).toEqual([
      { videoId: A, title: 'Ok', channel: '', thumbnail: '', durationText: '', playedAt: 0, playCount: 1 },
      { videoId: B, title: B, channel: '', thumbnail: '', durationText: '', playedAt: 50, playCount: 2 },
    ])
  })

  it('filtro sem acento e com todos os termos', () => {
    recordYoutubePlay({ videoId: A, title: 'Coração Valente', channel: 'Arautos do Rei' }, 1)
    recordYoutubePlay({ videoId: B, title: 'Deus o Pode', channel: 'Athus' }, 2)
    const list = listYoutubeHistory()
    expect(filterYoutubeHistory(list, '')).toBe(list)
    expect(filterYoutubeHistory(list, 'coracao arautos').map((e) => e.videoId)).toEqual([A])
    expect(filterYoutubeHistory(list, 'ATHUS').map((e) => e.videoId)).toEqual([B])
    expect(filterYoutubeHistory(list, 'athus valente')).toEqual([])
  })

  it('buscas recentes: mais recente primeiro, sem repetir, com limite e roundtrip', () => {
    expect(rememberYoutubeQuery('   ')).toEqual([])
    rememberYoutubeQuery('Arautos')
    rememberYoutubeQuery('Vox')
    expect(rememberYoutubeQuery('arautos')).toEqual(['arautos', 'Vox'])
    for (let i = 0; i < YOUTUBE_RECENT_QUERIES_MAX + 3; i++) rememberYoutubeQuery(`q${i}`)
    expect(listYoutubeRecentQueries()).toHaveLength(YOUTUBE_RECENT_QUERIES_MAX)
    expect(forgetYoutubeQuery(`q${YOUTUBE_RECENT_QUERIES_MAX + 2}`)[0]).toBe(`q${YOUTUBE_RECENT_QUERIES_MAX + 1}`)
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeRecentQueries, JSON.stringify('x'))
    expect(listYoutubeRecentQueries()).toEqual([])
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeRecentQueries, JSON.stringify(['ok', 3, ' ']))
    expect(listYoutubeRecentQueries()).toEqual(['ok'])
  })
})
