/**
 * Controle remoto do módulo YouTube: o celular manda `youtube.play` com o link
 * e o título, e o desktop toca no MESMO player do vídeo do YouTube da liturgia
 * (barra de vídeo, sem projetar — quem projeta é a seta da barra no celular).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  play: vi.fn(async () => true),
  record: vi.fn(),
}))

vi.mock('@modules/youtube/services/youtube-player', async (original) => ({
  ...(await original<typeof import('@modules/youtube/services/youtube-player')>()),
  playYoutubeVideo: mocks.play,
}))
vi.mock('@modules/youtube/services/youtube-history', async (original) => ({
  ...(await original<typeof import('@modules/youtube/services/youtube-history')>()),
  recordYoutubePlay: mocks.record,
}))

import {
  listYoutubeFavorites,
  listYoutubeHistory,
  toggleYoutubeFavorite,
} from '@modules/youtube/services/youtube-history'
import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import { createModuleHandlers } from '../renderer/module-handlers'
import {
  createYoutubeLibraryFeed,
  favoriteYoutubeFromRemote,
  playYoutubeFromRemote,
  youtubeLibraryFromRemote,
} from '../renderer/youtube-remote'

beforeEach(() => {
  localStorage.clear()
  mocks.play.mockReset()
  mocks.play.mockResolvedValue(true)
  mocks.record.mockReset()
})

describe('playYoutubeFromRemote', () => {
  it('toca o vídeo no player da liturgia, sem projetar, e guarda no histórico do desktop', async () => {
    expect(await playYoutubeFromRemote('https://www.youtube.com/watch?v=AAAAAAAAAAA', ' Castelo Forte ', 'Arautos do Rei')).toBe(true)
    expect(mocks.play).toHaveBeenCalledWith('AAAAAAAAAAA', 'Castelo Forte', false)
    expect(mocks.record).toHaveBeenCalledWith({ videoId: 'AAAAAAAAAAA', title: 'Castelo Forte', channel: 'Arautos do Rei' })
  })

  it('aceita youtu.be e shorts; sem título usa o id', async () => {
    await playYoutubeFromRemote('https://youtu.be/BBBBBBBBBBB?si=x')
    expect(mocks.play).toHaveBeenLastCalledWith('BBBBBBBBBBB', 'BBBBBBBBBBB', false)
    await playYoutubeFromRemote('https://www.youtube.com/shorts/CCCCCCCCCCC', '   ')
    expect(mocks.play).toHaveBeenLastCalledWith('CCCCCCCCCCC', 'CCCCCCCCCCC', false)
  })

  it('link que não é vídeo do YouTube não toca', async () => {
    expect(await playYoutubeFromRemote('https://example.com/video')).toBe(false)
    expect(await playYoutubeFromRemote('')).toBe(false)
    expect(mocks.play).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('falha do player devolve false (o histórico fica, como no módulo do desktop)', async () => {
    mocks.play.mockResolvedValueOnce(false)
    expect(await playYoutubeFromRemote('https://www.youtube.com/watch?v=AAAAAAAAAAA', 'X')).toBe(false)
  })
})

describe('favoriteYoutubeFromRemote', () => {
  it('favoritar pelo celular grava nos favoritos do desktop (e sobrevive a recarregar)', () => {
    const changed = vi.fn()
    window.addEventListener('youtube-library-changed', changed)
    expect(favoriteYoutubeFromRemote('https://www.youtube.com/watch?v=AAAAAAAAAAA', true, ' Vai Começar ', 'Quarteto Athus')).toBe(true)
    expect(listYoutubeFavorites()).toMatchObject([{ videoId: 'AAAAAAAAAAA', title: 'Vai Começar', channel: 'Quarteto Athus' }])
    expect(changed).toHaveBeenCalledTimes(1)
    window.removeEventListener('youtube-library-changed', changed)
  })

  it('é idempotente: favoritar de novo não desfaz; desfavoritar remove', () => {
    const url = 'https://youtu.be/AAAAAAAAAAA'
    favoriteYoutubeFromRemote(url, true, 'X')
    favoriteYoutubeFromRemote(url, true, 'X')
    expect(listYoutubeFavorites()).toHaveLength(1)
    expect(favoriteYoutubeFromRemote(url, false)).toBe(true)
    expect(listYoutubeFavorites()).toEqual([])
    expect(favoriteYoutubeFromRemote(url, false)).toBe(true)
  })

  it('link inválido não grava', () => {
    expect(favoriteYoutubeFromRemote('https://example.com', true)).toBe(false)
    expect(listYoutubeFavorites()).toEqual([])
  })
})

describe('namespace youtube nos handlers do remoto', () => {
  it('youtube.favorite repassa link, marcação, título e canal', async () => {
    const favorite = vi.fn(() => true)
    const handlers = createModuleHandlers({ youtube: { play: vi.fn(), favorite } })
    expect(await handlers.execute('youtube', 'youtube.favorite', { url: 'https://youtu.be/AAAAAAAAAAA', enabled: true, name: 'Hino', channel: 'Canal' })).toBe(true)
    expect(favorite).toHaveBeenCalledWith('https://youtu.be/AAAAAAAAAAA', true, 'Hino', 'Canal')
    // sem marcação ou sem link: recusa
    expect(await handlers.execute('youtube', 'youtube.favorite', { url: 'u' })).toBe(false)
    expect(await handlers.execute('youtube', 'youtube.favorite', { enabled: true })).toBe(false)
    expect(favorite).toHaveBeenCalledTimes(1)
  })

  it('youtube.play repassa link, título e canal', async () => {
    const play = vi.fn(async () => true)
    const handlers = createModuleHandlers({ youtube: { play } })
    expect(await handlers.execute('youtube', 'youtube.play', { url: 'https://youtu.be/AAAAAAAAAAA', name: 'Hino', channel: 'Canal' })).toBe(true)
    expect(play).toHaveBeenCalledWith('https://youtu.be/AAAAAAAAAAA', 'Hino', 'Canal')
  })

  it('sem link, ação desconhecida ou sem a dependência: false', async () => {
    const play = vi.fn(async () => true)
    const handlers = createModuleHandlers({ youtube: { play } })
    expect(await handlers.execute('youtube', 'youtube.play', { name: 'Hino' })).toBe(false)
    expect(await handlers.execute('youtube', 'youtube.outra', { url: 'u' })).toBe(false)
    expect(play).not.toHaveBeenCalled()
    expect(await createModuleHandlers({}).execute('youtube', 'youtube.play', { url: 'u' })).toBe(false)
  })

  it('o estado anuncia que o desktop toca YouTube pelo remoto', () => {
    expect(createModuleHandlers({ youtube: { play: vi.fn() } }).snapshot('youtube')).toEqual({ canPlay: true })
    expect(createModuleHandlers({ youtube: { play: vi.fn(), favorite: vi.fn() } }).snapshot('youtube')).toEqual({ canPlay: true, canFavorite: true })
    expect(createModuleHandlers({}).snapshot('youtube')).toBeNull()
  })
})

const A = 'AAAAAAAAAAA'
const B = 'BBBBBBBBBBB'
const C = 'CCCCCCCCCCC'

function seedHistory(ids: string[]) {
  localStorage.setItem(
    BROWSER_STORAGE_KEYS.youtubeHistory,
    JSON.stringify(ids.map((videoId, i) => ({ videoId, title: videoId, channel: '', thumbnail: '', durationText: '', playedAt: 100 - i, playCount: 1 }))),
  )
}

describe('histórico e favoritos do desktop para o celular', () => {
  it('manda as listas na primeira vez e quando mudam; sem mudança, só a chave', () => {
    seedHistory([A, B])
    toggleYoutubeFavorite({ videoId: C, title: 'Vai Começar' })
    const feed = createYoutubeLibraryFeed()

    const first = feed(false)
    expect(first.history?.map((e) => e.videoId)).toEqual([A, B])
    expect(first.favorites?.map((e) => e.videoId)).toEqual([C])
    expect(first.libraryKey).toBeTruthy()

    const same = feed(false)
    expect(same).toEqual({ libraryKey: first.libraryKey })

    // celular pediu o estado completo: manda de novo
    expect(feed(true).history).toHaveLength(2)

    seedHistory([B])
    const changed = feed(false)
    expect(changed.libraryKey).not.toBe(first.libraryKey)
    expect(changed.history?.map((e) => e.videoId)).toEqual([B])
  })

  it('o celular remove, limpa e reordena o histórico do desktop', () => {
    seedHistory([A, B, C])
    const changed = vi.fn()
    window.addEventListener('youtube-library-changed', changed)

    expect(youtubeLibraryFromRemote('youtube.historyReorder', `https://www.youtube.com/watch?v=${C}`, A)).toBe(true)
    expect(listYoutubeHistory().map((e) => e.videoId)).toEqual([C, A, B])
    expect(youtubeLibraryFromRemote('youtube.historyRemove', `https://youtu.be/${A}`)).toBe(true)
    expect(listYoutubeHistory().map((e) => e.videoId)).toEqual([C, B])
    expect(youtubeLibraryFromRemote('youtube.historyClear')).toBe(true)
    expect(listYoutubeHistory()).toEqual([])
    expect(changed).toHaveBeenCalledTimes(3)
    window.removeEventListener('youtube-library-changed', changed)
  })

  it('o celular reordena os favoritos do desktop', () => {
    toggleYoutubeFavorite({ videoId: A, title: 'A' }, 1)
    toggleYoutubeFavorite({ videoId: B, title: 'B' }, 2)
    expect(listYoutubeFavorites().map((e) => e.videoId)).toEqual([B, A])
    expect(youtubeLibraryFromRemote('youtube.favoritesReorder', A, B)).toBe(true)
    expect(listYoutubeFavorites().map((e) => e.videoId)).toEqual([A, B])
  })

  it('vídeo inválido ou ação desconhecida: recusa', () => {
    seedHistory([A])
    expect(youtubeLibraryFromRemote('youtube.historyRemove', 'https://example.com')).toBe(false)
    expect(youtubeLibraryFromRemote('youtube.historyReorder', A, 'curto')).toBe(false)
    expect(youtubeLibraryFromRemote('youtube.outra', A)).toBe(false)
    expect(listYoutubeHistory()).toHaveLength(1)
  })

  it('os handlers repassam as ações da biblioteca (limpar não precisa de link)', async () => {
    const library = vi.fn(() => true)
    const handlers = createModuleHandlers({ youtube: { play: vi.fn(), library } })
    expect(await handlers.execute('youtube', 'youtube.historyClear', {})).toBe(true)
    expect(library).toHaveBeenLastCalledWith('youtube.historyClear', '', '')
    expect(await handlers.execute('youtube', 'youtube.historyReorder', { url: A, targetId: B })).toBe(true)
    expect(library).toHaveBeenLastCalledWith('youtube.historyReorder', A, B)
    // sem a dependência, recusa
    expect(await createModuleHandlers({ youtube: { play: vi.fn() } }).execute('youtube', 'youtube.historyClear', {})).toBe(false)
  })
})
