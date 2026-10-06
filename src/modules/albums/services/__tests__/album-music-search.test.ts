import { describe, expect, it, vi } from 'vitest'

// library-catalog → i18n → user-preferences toca localStorage no import
// (fora de browser real). O serviço só usa getCurrentApiPrefix — mock direto.
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'pt',
}))

import { filterAlbumMusicIndex, loadAlbumMusicIndex } from '../album-music-search'

import type { AlbumSearchHit } from '../../types/albums'

function hit(partial: Partial<AlbumSearchHit> & { musicId: number; name: string }): AlbumSearchHit {
  return {
    track: null,
    durationLabel: null,
    hasInstrumental: false,
    albumNames: 'Coletânea',
    displayTitle: partial.name,
    isHymnal: false,
    hymnalTracks: [],
    ...partial,
  }
}

describe('filterAlbumMusicIndex — relevância da busca (apk#127 / SPEC 10)', () => {
  const index: AlbumSearchHit[] = [
    hit({ musicId: 1, name: 'Teu Santo Nome', albumNames: 'Adoradores' }),
    hit({ musicId: 2, name: 'Não Há o Que Temer', albumNames: 'Adoradores, Ao Vivo' }),
    hit({ musicId: 3, name: 'Adoradores da Última Hora', albumNames: 'Outra Coletânea' }),
    hit({ musicId: 4, name: 'Santo Espírito', albumNames: 'Adoradores' }),
  ]

  it('termo que casa com o NOME DO ÁLBUM: match de título vem primeiro (relevância real)', () => {
    const results = filterAlbumMusicIndex(index, 'adoradores')
    // "Adoradores da Última Hora" (título) lidera; as faixas da coletânea
    // "Adoradores" entram só como cauda — nunca engolem a lista (apk#127).
    expect(results[0]?.musicId).toBe(3)
    expect(results.slice(1).map((r) => r.musicId)).toEqual([1, 2, 4])
  })

  it('match de título que COMEÇA com o termo ordena antes de contains (relevância)', () => {
    const results = filterAlbumMusicIndex(index, 'santo')
    // "Santo Espírito" começa com o termo; "Teu Santo Nome" só contém.
    expect(results.map((r) => r.musicId)).toEqual([4, 1])
  })

  it('busca numérica continua funcionando (track do hinário)', () => {
    const hymn = hit({
      musicId: 10,
      name: 'Castelo Forte',
      track: 101,
      albumNames: 'Hinário Adventista',
      isHymnal: true,
      hymnalTracks: [101],
    })
    const results = filterAlbumMusicIndex([...index, hymn], '101')
    expect(results[0]?.musicId).toBe(10)
  })

  it('query vazia retorna lista vazia (não o índice inteiro)', () => {
    expect(filterAlbumMusicIndex(index, '   ')).toEqual([])
  })

  it('loadAlbumMusicIndex continua exportado (contrato do bridge remoto)', () => {
    expect(typeof loadAlbumMusicIndex).toBe('function')
  })
})
