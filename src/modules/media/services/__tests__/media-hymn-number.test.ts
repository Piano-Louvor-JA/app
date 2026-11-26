import { describe, expect, it } from 'vitest'

import { resolveHymnNumber } from '../hymn-number'
import { normalizeMediaRuntime } from '../media-runtime'
import type { MediaTrackRecord } from '../../types/media'

function track(albums: MediaTrackRecord['albums']): MediaTrackRecord {
  return {
    id: 1,
    name: 'Santo, Santo, Santo!',
    durationLabel: '3:00',
    audioUrl: null,
    instrumentalUrl: null,
    coverUrl: null,
    coverPosition: null,
    albums,
    categories: [],
    lyrics: [],
  }
}

describe('número do hino (capa do hinário)', () => {
  it('é a faixa no Hinário Adventista', () => {
    expect(resolveHymnNumber(track([{ id: 9, name: 'Hinário Adventista', track: 1, imageUrl: null }]), null)).toBe(1)
  })

  it('usa o hinário aberto: atual ou edição 1996', () => {
    const t = track([
      { id: 9, name: 'Hinário Adventista', track: 1, imageUrl: null },
      { id: 10, name: 'Hinário Adventista - Edição 1996', track: 3, imageUrl: null },
    ])
    expect(resolveHymnNumber(t, 10)).toBe(3)
    expect(resolveHymnNumber(t, 9)).toBe(1)
  })

  it('aberta por outro álbum (CD), mostra o número do hinário mesmo assim', () => {
    const t = track([
      { id: 50, name: 'Maranata 2024', track: 7, imageUrl: null },
      { id: 9, name: 'Hinário Adventista', track: 45, imageUrl: null },
    ])
    expect(resolveHymnNumber(t, 50)).toBe(45)
  })

  it('espanhol (Himnario Adventista) também', () => {
    expect(resolveHymnNumber(track([{ id: 9, name: 'Himnario Adventista', track: 12, imageUrl: null }]), 9)).toBe(12)
  })

  it('música que não é do hinário, ou sem faixa: sem número', () => {
    expect(resolveHymnNumber(track([{ id: 50, name: 'Maranata 2024', track: 7, imageUrl: null }]), 50)).toBeNull()
    expect(resolveHymnNumber(track([{ id: 9, name: 'Hinário Adventista', track: null, imageUrl: null }]), 9)).toBeNull()
    expect(resolveHymnNumber(track([]), null)).toBeNull()
  })

  it('a projeção recebe o número (e ignora valores estranhos)', () => {
    expect(normalizeMediaRuntime({ isCover: true, hymnNumber: 1 }).hymnNumber).toBe(1)
    expect(normalizeMediaRuntime({ hymnNumber: 'um' }).hymnNumber).toBeNull()
    expect(normalizeMediaRuntime({ hymnNumber: 0 }).hymnNumber).toBeNull()
    expect(normalizeMediaRuntime({}).hymnNumber).toBeNull()
  })
})
