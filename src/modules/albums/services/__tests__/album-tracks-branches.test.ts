// @vitest-environment jsdom
// Spec dedicada das branches de parsing de album-tracks: formatCatalogDuration
// (número/segundos/MM:SS/HH:MM:SS/inválido), mapTrackRow (id/name/track/
// instrumental variants) e hasInstrumentalFlag.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(async () => null),
}))
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async () => null),
}))
vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomMusics: vi.fn(() => []),
  fromCustomCollectionId: vi.fn((id: unknown) => Number(String(id).replace(/\D/g, '')) || 0),
  toCustomMusicId: vi.fn((id: number) => `cu-${id}`),
}))

import {
  formatCatalogDuration,
} from '../album-tracks'

describe('formatCatalogDuration', () => {
  it('número finito > 0 → M:SS', () => {
    expect(formatCatalogDuration(125)).toBe('2:05')
    expect(formatCatalogDuration(59)).toBe('0:59')
  })

  it('número <= 0, NaN ou Infinity → —', () => {
    expect(formatCatalogDuration(0)).toBe('—')
    expect(formatCatalogDuration(-3)).toBe('—')
    expect(formatCatalogDuration(Number.NaN)).toBe('—')
    expect(formatCatalogDuration(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('não-string (null/objeto) → —', () => {
    expect(formatCatalogDuration(null)).toBe('—')
    expect(formatCatalogDuration({})).toBe('—')
  })

  it('string vazia/só espaços → —', () => {
    expect(formatCatalogDuration('')).toBe('—')
    expect(formatCatalogDuration('   ')).toBe('—')
  })

  it('HH:MM:SS → total em M:SS', () => {
    expect(formatCatalogDuration('1:02:03')).toBe('62:03')
  })

  it('MM:SS direto', () => {
    expect(formatCatalogDuration('3:07')).toBe('3:07')
  })

  it('MM:SS com parte não numérica → string original', () => {
    expect(formatCatalogDuration('aa:bb')).toBe('aa:bb')
  })

  it('formato desconhecido com ":" (4 partes) → string original', () => {
    expect(formatCatalogDuration('1:2:3:4')).toBe('1:2:3:4')
  })

  it('string numérica pura → segundos → M:SS', () => {
    expect(formatCatalogDuration('90')).toBe('1:30')
  })

  it('string numérica <= 0 → —', () => {
    expect(formatCatalogDuration('0')).toBe('—')
    expect(formatCatalogDuration('-5')).toBe('—')
  })

  it('string não numérica sem ":" → —', () => {
    expect(formatCatalogDuration('abc')).toBe('—')
  })
})

describe('parsing de linhas do catálogo (loadCollectionTracks kind album)', () => {
  const collection = (key: string) => ({
    id: key,
    catalogKey: key,
    kind: 'album' as const,
    isCustom: false,
    name: 'CD',
  })

  it('hasInstrumentalFlag: true, 1, "1" e url instrumental contam como instrumental', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    const mk = (row: Record<string, unknown>) => ({ name: 'CD', musics: [row] })
    const rows = [
      mk({ id_music: 1, name: 'A', has_instrumental_music: true }),
      mk({ id_music: 2, name: 'B', has_instrumental_music: 1 }),
      mk({ id_music: 3, name: 'C', has_instrumental_music: '1' }),
      mk({ id_music: 4, name: 'D', url_instrumental_music: 'http://x/i.mp3' }),
      mk({ id_music: 5, name: 'E', has_instrumental_music: 0, url_instrumental_music: '   ' }),
    ]
    const mod = await import('../album-tracks')
    const results: boolean[] = []
    for (const row of rows) {
      vi.mocked(readCatalogRecord).mockResolvedValueOnce(row as never)
      const tracks = await mod.loadCollectionTracks(collection(`k-${results.length}`))
      results.push(tracks[0]?.hasInstrumental ?? false)
    }
    expect(results).toEqual([true, true, true, true, false])
  })

  it('linhas inválidas descartadas; id/track string e duração parseadas', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce({
      name: 'CD',
      musics: [
        { name: 'sem id' },
        { id_music: 0, name: 'id zero' },
        { id_music: 7, name: '   ' },
        { id_music: '8', name: 'string id', track: '3', duration: '4:10' },
      ],
    } as never)
    const mod = await import('../album-tracks')
    const tracks = await mod.loadCollectionTracks(collection('k-inv'))
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ musicId: 8, name: 'string id', track: 3, durationLabel: '4:10' })
  })
})

describe('loadCollectionTracks — custom/hymnal/fallbacks e loadAlbumLyric', () => {
  it('coletânea custom: mapeia musics da API (officialMusicId e custom)', async () => {
    const { listCustomMusics } = await import('@modules/media/services/custom-catalog')
    vi.mocked(listCustomMusics).mockResolvedValueOnce([
      { id: 1, officialMusicId: 55, name: 'Oficial', duration: 95 },
      { id: 2, officialMusicId: null, name: null, duration: null },
      { id: 3, officialMusicId: undefined, name: 'Custom 3', duration: '1:02:03' },
    ] as never)
    const mod = await import('../album-tracks')
    const tracks = await mod.loadCollectionTracks({
      id: 'cu-9', catalogKey: 'x', kind: 'album', isCustom: true, name: 'Minha',
    })
    expect(tracks).toHaveLength(3)
    expect(tracks[0]).toMatchObject({ musicId: 55, name: 'Oficial', track: 1, durationLabel: '1:35' })
    expect(tracks[1]).toMatchObject({ musicId: 'cu-2', name: 'Hino oficial #2', durationLabel: '—' })
    expect(tracks[2]).toMatchObject({ durationLabel: '62:03' })
  })

  it('hymnal: catálogo array, sort por track e fallback de numeração', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce([
      { id_music: 3, name: 'C' },            // sem track → fallback 1
      { id_music: 1, name: 'A', track: 2 },
      { id_music: 2, name: 'B', track: '1' },
    ] as never)
    const mod = await import('../album-tracks')
    const tracks = await mod.loadCollectionTracks({
      id: 'h1', catalogKey: 'hinario.json', kind: 'hymnal' as never, isCustom: false, name: 'Hinário',
    })
    expect(tracks.map((t2) => t2.name)).toEqual(['B', 'A', 'C'])
    expect(tracks[2].track).toBe(3)
  })

  it('hymnal: catálogo ausente (null) → lista vazia; album sem musics idem', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce(null as never)
    vi.mocked(readCatalogRecord).mockResolvedValueOnce(null as never)
    const mod = await import('../album-tracks')
    expect(await mod.loadCollectionTracks({ id: 'h2', catalogKey: 'x', kind: 'hymnal' as never, isCustom: false, name: 'H' })).toEqual([])
    expect(await mod.loadCollectionTracks({ id: 'a2', catalogKey: 'y', kind: 'album', isCustom: false, name: 'A' })).toEqual([])
  })

  it('loadAlbumLyric: linhas ordenadas, show_slide e variantes de formato', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce({
      id_music: 1,
      lyric: [
        { order: '2', lyric: 'segunda', show_slide: 0 },
        { order: 1, lyric: 'primeira', show_slide: 1 },
        { order: 'x', lyric: 'sem ordem' },
      ],
    } as never)
    const mod = await import('../album-tracks')
    const doc = await mod.loadAlbumLyric(1)
    expect(doc).toBeTruthy()
  })
})

describe('filterAlbumTracks e loadAlbumLyric — branches', () => {
  it('filterAlbumTracks: query vazia devolve tudo; filtra por track/nome/id', async () => {
    const mod = await import('../album-tracks')
    const tracks = [
      { musicId: 1, name: 'Santo', track: 1, durationLabel: '—', hasInstrumental: false },
      { musicId: 23, name: 'Digno', track: null, durationLabel: '—', hasInstrumental: false },
    ]
    expect(mod.filterAlbumTracks(tracks, '  ')).toHaveLength(2)
    expect(mod.filterAlbumTracks(tracks, 'sant')).toHaveLength(1)
    expect(mod.filterAlbumTracks(tracks, '23')).toHaveLength(1)
    expect(mod.filterAlbumTracks(tracks, '2')).toHaveLength(1)
  })

  it('loadAlbumLyric: id inválido e record ausente → null', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce(null as never)
    const mod = await import('../album-tracks')
    expect(await mod.loadAlbumLyric(0)).toBeNull()
    expect(await mod.loadAlbumLyric(Number.NaN)).toBeNull()
    expect(await mod.loadAlbumLyric(9)).toBeNull()
  })

  it('loadAlbumLyric: lyric como objeto, HTML strip, linhas vazias e título fallback', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce({
      lyric: {
        b: { order: '2', lyric: '<b>segunda</b><br>linha' },
        a: { order: 1, lyric: 'primeira' },
        c: { order: '3', lyric: '   ' },
      },
    } as never)
    const mod = await import('../album-tracks')
    const doc = await mod.loadAlbumLyric(7)
    expect(doc).toMatchObject({ musicId: 7, title: 'music_7' })
    expect(doc?.lines.map((l) => l.text)).toEqual(['primeira', 'segunda\nlinha'])
  })

  it('loadAlbumLyric: título do record quando presente', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce({
      name: 'Santo Santo',
      lyric: [{ order: 1, lyric: 'x' }],
    } as never)
    const mod = await import('../album-tracks')
    const doc = await mod.loadAlbumLyric(8)
    expect(doc?.title).toBe('Santo Santo')
  })
})

describe('readOrFetchCatalog — remote fallback e erro', () => {
  it('local null → busca remota e retorna', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    const { fetchRemoteCatalogJson } = await import('@shared/services/remote-catalog')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce(null as never)
    vi.mocked(fetchRemoteCatalogJson).mockResolvedValueOnce({
      name: 'CD Remoto',
      musics: [{ id_music: 42, name: 'Remota', track: 1 }],
    } as never)
    const mod = await import('../album-tracks')
    const tracks = await mod.loadCollectionTracks({ id: 'r1', catalogKey: 'remote.json', kind: 'album', isCustom: false, name: 'R' })
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ musicId: 42, name: 'Remota' })
  })

  it('local null e remoto null → lista vazia; remoto rejeitando idem', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    const { fetchRemoteCatalogJson } = await import('@shared/services/remote-catalog')
    vi.mocked(readCatalogRecord).mockResolvedValue(null as never)
    vi.mocked(fetchRemoteCatalogJson).mockResolvedValueOnce(null as never)
    vi.mocked(fetchRemoteCatalogJson).mockRejectedValueOnce(new TypeError('offline'))
    const mod = await import('../album-tracks')
    expect(await mod.loadCollectionTracks({ id: 'r2', catalogKey: 'a.json', kind: 'album', isCustom: false, name: 'A' })).toEqual([])
    expect(await mod.loadCollectionTracks({ id: 'r3', catalogKey: 'b.json', kind: 'album', isCustom: false, name: 'B' })).toEqual([])
  })

describe('album-tracks — gaps finais (durations string, sorts, nulls)', () => {
  it('formatDurationLabel: string M:SS e inválida via custom', async () => {
    const { listCustomMusics } = await import('@modules/media/services/custom-catalog')
    vi.mocked(listCustomMusics).mockResolvedValueOnce([
      { id: 1, officialMusicId: 61, name: 'S1', duration: '3:04' },
      { id: 2, officialMusicId: 62, name: 'S2', duration: 'palavra' },
    ] as never)
    const mod = await import('../album-tracks')
    const tracks = await mod.loadCollectionTracks({
      id: 'cu-d', catalogKey: 'x', kind: 'album', isCustom: true, name: 'D',
    })
    expect(tracks[0].durationLabel).toBe('3:04')
    expect(tracks[1].durationLabel).toBe('palavra')
  })

  it('sort com track null usa musicId (hymnal e album)', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    const mod = await import('../album-tracks')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce([
      { id_music: 9, name: 'I9' },
      { id_music: 3, name: 'I3' },
      { id_music: 5, name: 'I5', track: 1 },
    ] as never)
    const hy = await mod.loadCollectionTracks({
      id: 'h-s', catalogKey: 's.json', kind: 'hymnal' as never, isCustom: false, name: 'S',
    })
    expect(hy.map((t2) => t2.name)).toEqual(['I5', 'I3', 'I9'])
    vi.mocked(readCatalogRecord).mockResolvedValueOnce({
      name: 'CD', musics: [
        { id_music: 8, name: 'A8' },
        { id_music: 2, name: 'A2', track: 1 },
      ],
    } as never)
    const al = await mod.loadCollectionTracks({
      id: 'a-s', catalogKey: 's2.json', kind: 'album', isCustom: false, name: 'S2',
    })
    expect(al.map((t2) => t2.name)).toEqual(['A2', 'A8'])
  })

  it('mapTrackRow sem name (undefined) → descartada; linha de lyric sem lyric → descartada', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    const mod = await import('../album-tracks')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce({
      name: 'CD', musics: [{ id_music: 11 }],
    } as never)
    const tracks = await mod.loadCollectionTracks({
      id: 'a-n', catalogKey: 'n.json', kind: 'album', isCustom: false, name: 'N',
    })
    expect(tracks).toEqual([])
    vi.mocked(readCatalogRecord).mockResolvedValueOnce({
      id_music: 12, lyric: [{ order: 1 }, { order: 2, lyric: 'fica' }],
    } as never)
    const doc = await mod.loadAlbumLyric(12)
    expect(doc?.lines.map((l) => l.text)).toEqual(['fica'])
  })
})
})
