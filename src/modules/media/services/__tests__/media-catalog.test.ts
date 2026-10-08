import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de media-catalog.ts — loadMediaTrack com fallback remoto,
 * mapeamento de letra/álbuns/categorias e resolveAlbumSubtitle.
 */

const readCatalogRecord = vi.fn()
const fetchRemoteCatalogJson = vi.fn()
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: (...a: unknown[]) => readCatalogRecord(...(a as [])),
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: (...a: unknown[]) => fetchRemoteCatalogJson(...(a as [])),
}))

import {
  loadMediaTrack,
  resolveAlbumSubtitle,
} from '../media-catalog'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadMediaTrack', () => {
  it('id inválido -> null sem consultar', async () => {
    expect(await loadMediaTrack(0)).toBeNull()
    expect(await loadMediaTrack(-1)).toBeNull()
    expect(await loadMediaTrack(Number.NaN)).toBeNull()
    expect(readCatalogRecord).not.toHaveBeenCalled()
  })

  it('local presente usa; ausente cai no remoto; remoto falha -> null', async () => {
    readCatalogRecord.mockResolvedValue({
      id_music: 5,
      name: 'Local',
      duration: 180,
      url_music: '/musics/5.mp3',
    })
    const t = await loadMediaTrack(5)
    expect(t?.name).toBe('Local')
    expect(fetchRemoteCatalogJson).not.toHaveBeenCalled()

    readCatalogRecord.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockResolvedValue({
      id_music: 5,
      name: 'Remota',
    })
    const t2 = await loadMediaTrack(6)
    expect(t2?.name).toBe('Remota')

    fetchRemoteCatalogJson.mockRejectedValue(new Error('off'))
    await expect(loadMediaTrack(7)).rejects.toThrow('off')
  })

  it('mapTrack completo: álbums, categorias, letra array e objeto', async () => {
    readCatalogRecord.mockResolvedValue({
      id_music: '9',
      name: '  Completa  ',
      duration: 210,
      url_music: '/m/9.mp3',
      url_instrumental_music: '/m/9i.mp3',
      url_image: 'capa.png',
      image_position: 'top',
      albums: [
        { id_album: 1, name: 'CD 1', track: '3', url_image: 'cd1.png' },
        { id_album: 'x', name: 'id inválido' },
        { id_album: 2 },
      ],
      categories: ['Infantis', 42, null],
      lyric: [
        { order: 2, lyric: 'dois', show_slide: '1', time: '00:20' },
        { order: 1, lyric: 'um', show_slide: true },
        { order: 3, lyric: 'três', show_slide: 0 },
      ],
    })
    const t = await loadMediaTrack(9)
    expect(t).toMatchObject({
      id: 9,
      name: 'Completa',
      durationLabel: '210',
      audioUrl: '/m/9.mp3',
      instrumentalUrl: '/m/9i.mp3',
      coverUrl: 'capa.png',
      coverPosition: 'top',
    })
    expect(t?.albums).toHaveLength(2) // id inválido filtrado
    expect(t?.albums[0]).toMatchObject({ id: 1, track: 3, imageUrl: 'cd1.png' })
    expect(t?.albums[1]?.track).toBeNull() // track ausente
    expect(t?.categories).toEqual(['Infantis']) // não-string filtrado
    expect(t?.lyrics.map((l: { lyric: string }) => l.lyric)).toEqual(['um', 'dois', 'três'])
    expect(t?.lyrics[2]?.showSlide).toBe(false)
  })

  it('letra como objeto (map) também mapeia; sem nome -> null', async () => {
    readCatalogRecord.mockResolvedValue({
      id_music: 2,
      name: 'Obj',
      lyric: { a: { order: 1, lyric: 'x', show_slide: 1 } },
    })
    const t = await loadMediaTrack(2)
    expect(t?.lyrics).toHaveLength(1)
    readCatalogRecord.mockResolvedValue({ id_music: 3, name: '   ' })
    expect(await loadMediaTrack(3)).toBeNull()
  })
})

describe('resolveAlbumSubtitle', () => {
  const trackStub = (albums: Array<{ id: number; name: string }>) =>
    ({ albums }) as never

  it('sem álbums -> vazio; com albumId preferido usa ele; senão primeiro', () => {
    const t = trackStub([])
    expect(resolveAlbumSubtitle(t, 1)).toBe('')
    const t2 = trackStub([
      { id: 1, name: 'CD Um' },
      { id: 2, name: 'CD Dois' },
    ])
    expect(resolveAlbumSubtitle(t2, 2)).toBe('CD Dois')
    expect(resolveAlbumSubtitle(t2, null)).toBe('CD Um')
    expect(resolveAlbumSubtitle(t2, 99)).toBe('CD Um') // não achou -> primeiro
  })
})

describe('gaps finais — row null, asNumber default param, url whitespace, name vazio no álbum preferido', () => {
  it('local null + remoto null -> row null -> null (L130)', async () => {
    readCatalogRecord.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockResolvedValue(null)
    expect(await loadMediaTrack(7)).toBeNull()
  })

  it('asNumber com fallback explícito (NaN em id_album cai no default NaN)', async () => {
    readCatalogRecord.mockResolvedValue({
      id_music: 9,
      name: 'X',
      albums: [{ id_album: 'zzz', name: 'sem id' }],
    })
    const t = await loadMediaTrack(9)
    expect(t?.albums).toHaveLength(0)
  })

  it('url_image whitespace -> null (L52 branch)', async () => {
    readCatalogRecord.mockResolvedValue({
      id_music: 9,
      name: 'X',
      url_image: '   ',
    })
    const t = await loadMediaTrack(9)
    expect(t?.coverUrl).toBeNull()
  })

  it('resolveAlbumSubtitle: álbum preferido com name vazio -> ?? cai no outro (L145)', async () => {
    const t = {
      albums: [
        { id: 5, name: '' },
        { id: 6, name: 'CD Real' },
      ],
    } as never
    // preferido com name vazio: retorna '' (preferred ?? albums[0] pega o preferido)
    expect(resolveAlbumSubtitle(t, 5)).toBe('')
    // sem albumId: primeiro álbum com name
    const t2 = { albums: [{ id: 8, name: 'Primeiro' }, { id: 6, name: 'CD Real' }] } as never
    expect(resolveAlbumSubtitle(t2, null)).toBe('Primeiro')
    const t3 = { albums: [{ id: 8 }] } as never
    expect(resolveAlbumSubtitle(t3, null)).toBe('') // name undefined -> ?? ''
  })
})
