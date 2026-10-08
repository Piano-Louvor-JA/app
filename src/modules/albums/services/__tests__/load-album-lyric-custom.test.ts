// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(async () => {
    throw new Error('catálogo oficial não deve ser consultado')
  }),
}))
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async () => null),
}))

import { loadAlbumLyric } from '../album-tracks'
import {
  createLocalCollection,
  createLocalLyric,
  createLocalMusic,
} from '@modules/media/services/local-custom-store'
import { toCustomMusicId } from '@modules/media/services/custom-catalog'

describe('loadAlbumLyric — custom e local (app#331)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('id local negativo lê a letra do localStorage', async () => {
    const collection = createLocalCollection('Importações .slja')
    const music = createLocalMusic(collection.id, { name: 'Missao Para Todos' })
    createLocalLyric(music.id, { lyric: 'Para todos', time: '00:00:20', order: 1 })

    const doc = await loadAlbumLyric(music.id)
    expect(doc?.title).toBe('Missao Para Todos')
    expect(doc?.lines.map((line) => line.text)).toEqual(['Para todos'])
  })

  it('id custom 1M+ lê a letra da API, não music_<id>', async () => {
    localStorage.setItem(
      'louvorja.custom.auth',
      JSON.stringify({
        token: 'tok-privado',
        user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
      }),
    )
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/musics/7')) {
        return new Response(
          JSON.stringify({
            id_music: 7,
            name: 'Hino Autoral',
            lyrics: [{ order: 1, lyric: 'Verso um', time: '00:00:05' }],
          }),
        )
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const doc = await loadAlbumLyric(toCustomMusicId(7))
      expect(doc?.title).toBe('Hino Autoral')
      expect(doc?.lines[0]?.text).toBe('Verso um')
      const lyricCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).endsWith('/musics/7'),
      )
      const headers = (lyricCall?.[1] as RequestInit | undefined)?.headers as
        | Record<string, string>
        | undefined
      expect(headers?.authorization).toBe('Bearer tok-privado')
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('music_'))).toBe(
        false,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

it('sorts custom lyrics, filters blank text, and falls back to an unnamed title', async () => {
  localStorage.setItem('louvorja.custom.auth', JSON.stringify({ token: 'test', user: { id_user: 1 } }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id_music: 7, name: ' ', lyrics: [{ order: 2, lyric: 'Second' }, { order: 1, lyric: 'First' }, { order: 3, lyric: null }] }))));
  try {
    const result = await loadAlbumLyric(toCustomMusicId(7));
    expect(result?.title).toBe('music_1000007');
    expect(result?.lines.map(line => line.text)).toEqual(['First', 'Second']);
  } finally { vi.unstubAllGlobals(); }
});
it('returns null for a custom song without usable lyrics', async () => {
  localStorage.setItem('louvorja.custom.auth', JSON.stringify({ token: 'test', user: { id_user: 1 } }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id_music: 7, name: 'Blank', lyrics: [] }))));
  try { expect(await loadAlbumLyric(toCustomMusicId(7))).toBeNull(); }
  finally { vi.unstubAllGlobals(); }
});
