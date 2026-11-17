import { beforeEach, describe, expect, it } from 'vitest'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import {
  YOUTUBE_FAVORITES_MAX,
  filterYoutubeHistory,
  isYoutubeFavorite,
  listYoutubeFavorites,
  removeYoutubeFavorite,
  toggleYoutubeFavorite,
} from '../services/youtube-history'

const A = 'AAAAAAAAAAA'
const B = 'BBBBBBBBBBB'

describe('favoritos do módulo YouTube', () => {
  beforeEach(() => localStorage.clear())

  it('roundtrip: favoritar sobrevive a recarregar; o mais novo fica no topo', () => {
    toggleYoutubeFavorite({ videoId: A, title: ' Sim Eu Creio ', channel: 'Arautos do Rei', thumbnail: 'a.jpg', durationText: '3:11' }, 10)
    toggleYoutubeFavorite({ videoId: B, title: '' }, 20)
    const reloaded = listYoutubeFavorites()
    expect(reloaded).toEqual([
      { videoId: B, title: B, channel: '', thumbnail: '', durationText: '', playedAt: 20 },
      { videoId: A, title: 'Sim Eu Creio', channel: 'Arautos do Rei', thumbnail: 'a.jpg', durationText: '3:11', playedAt: 10 },
    ])
    expect(isYoutubeFavorite(reloaded, A)).toBe(true)
    expect(filterYoutubeHistory(reloaded, 'arautos').map((e) => e.videoId)).toEqual([A])
  })

  it('tocar no coração de novo desfavorita; remover e id inválido', () => {
    toggleYoutubeFavorite({ videoId: A, title: 'x' })
    expect(toggleYoutubeFavorite({ videoId: A, title: 'x' })).toEqual([])
    toggleYoutubeFavorite({ videoId: B, title: 'y' })
    expect(removeYoutubeFavorite(B)).toEqual([])
    expect(toggleYoutubeFavorite({ videoId: 'ruim', title: 'z' })).toEqual([])
    expect(isYoutubeFavorite([], A)).toBe(false)
  })

  it('limite e dado corrompido', () => {
    for (let i = 0; i < YOUTUBE_FAVORITES_MAX + 2; i++) {
      toggleYoutubeFavorite({ videoId: `id${String(i).padStart(9, '0')}`, title: `v${i}` }, i)
    }
    expect(listYoutubeFavorites()).toHaveLength(YOUTUBE_FAVORITES_MAX)
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeFavorites, JSON.stringify('x'))
    expect(listYoutubeFavorites()).toEqual([])
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeFavorites, JSON.stringify([{ videoId: A, title: 'a', playCount: 9 }, { videoId: A, title: 'dup' }, null]))
    expect(listYoutubeFavorites()).toEqual([{ videoId: A, title: 'a', channel: '', thumbnail: '', durationText: '', playedAt: 0 }])
  })
})
