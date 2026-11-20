// @vitest-environment jsdom
// F1 (t_8e652bfe): música LOCAL (id negativo) em /albums não pode ser
// empacotada como toCustomMusicId(-N) = 1M−N — esse id cai no loader OFICIAL
// no dispatcher do media store (não é >= 1M nem < 0) e toca hino errado.
// Id local negativo deve permanecer negativo (o dispatcher resolve via isLocalId).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listCustomMusics = vi.fn()
vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomMusics: (...a: unknown[]) => listCustomMusics(...a),
  loadCustomMusicTrack: vi.fn(async () => null),
  isCustomMusicId: (id: number) => Number.isFinite(id) && id >= 1_000_000,
  fromCustomMusicId: (id: number) => id - 1_000_000,
  fromCustomCollectionId: (id: number | string) => Number(id) - 2_000_000,
  toCustomMusicId: (id: number) => id + 1_000_000,
}))

import { loadCollectionTracks } from '../services/album-tracks'
import type { AlbumCollection } from '../types/albums'

const custom = (localId: number): AlbumCollection =>
  ({
    id: 2_000_000 + Math.abs(localId),
    kind: 'album',
    catalogKey: 'cat.json',
    name: 'C',
    isCustom: true,
  }) as unknown as AlbumCollection

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadCollectionTracks — F1 misrouting de música local (t_8e652bfe)', () => {
  it('id local negativo permanece negativo (não vira 1M−N que cai no loader oficial)', async () => {
    listCustomMusics.mockResolvedValue([
      { id: -10, name: 'Hino local', duration: null, officialMusicId: null },
    ])
    const tracks = await loadCollectionTracks(custom(1))
    // mutante: toCustomMusicId(-10) = 999.990 → dispatcher trata como oficial
    expect(tracks[0]?.musicId).toBe(-10)
    expect(tracks[0]?.musicId).toBeLessThan(0)
  })

  it('música custom REMOTA (id positivo) continua com offset 1M+', async () => {
    listCustomMusics.mockResolvedValue([
      { id: 42, name: 'Custom remota', duration: null, officialMusicId: null },
    ])
    const tracks = await loadCollectionTracks(custom(1))
    expect(tracks[0]?.musicId).toBe(1_000_042)
  })

  it('link de hino oficial continua sem offset (prioridade sobre o id local)', async () => {
    listCustomMusics.mockResolvedValue([
      { id: -10, name: 'Link oficial', duration: null, officialMusicId: 77 },
    ])
    const tracks = await loadCollectionTracks(custom(1))
    expect(tracks[0]?.musicId).toBe(77)
  })
})
