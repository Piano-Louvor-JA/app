import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * RF-03 + ADENDO v1.1.0 (SPEC louvorja-community-copies): /albums NÃO lista
 * NENHUMA coletânea custom — nem produzidas pelo usuário (RF-03 filtrava
 * ownerId; agora a categoria inteira saiu da Central), nem cópias (D2).
 * Produzidas vivem APENAS na aba Comunidade ("Minhas Coletâneas").
 * loadCustomAlbumCategory é sempre null, incondicionalmente.
 */
vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomCollections: vi.fn(),
  customFileUrl: (p: string) => p,
  toCustomCollectionId: (id: number) => `custom:${id}`,
}))
vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: vi.fn(),
}))
vi.mock('@modules/media/services/local-custom-store', () => ({
  getLocalCollection: vi.fn(() => null),
  isLocalId: (id: number) => id < 0,
  listLocalMusics: vi.fn(() => []),
}))
vi.mock('@modules/sync/services/media-paths', () => ({
  resolveCoverUrlsFromDisk: vi.fn(async () => ({})),
  resolveRemoteFileUrl: (p: string) => p,
}))

import { loadCustomAlbumCategory } from '../album-catalog'
import { listCustomCollections } from '@modules/media/services/custom-catalog'

const mockedCustom = vi.mocked(listCustomCollections)

describe('album-catalog — Central SEM coletâneas custom (adendo v1.1.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logado com coletâneas próprias: categoria null (nada entra na Central)', async () => {
    mockedCustom.mockResolvedValue([
      { id: -1, name: 'Minha Local', description: null, coverUrl: null, ownerId: null, authorName: null, musicsCount: 2, visibility: 'private' },
      { id: 2, name: 'Minha Remota', description: null, coverUrl: null, ownerId: 47, authorName: null, musicsCount: 3, visibility: 'private' },
      { id: 3, name: 'De Outro Irmao', description: null, coverUrl: null, ownerId: 49, authorName: 'Outro', musicsCount: 5, visibility: 'public' },
    ] as never)
    expect(await loadCustomAlbumCategory()).toBeNull()
  })

  it('deslogado: categoria null também', async () => {
    mockedCustom.mockResolvedValue([
      { id: -1, name: 'Local Only', description: null, coverUrl: null, ownerId: null, authorName: null, musicsCount: 1, visibility: 'private' },
      { id: 9, name: 'Remota Alheia', description: null, coverUrl: null, ownerId: 12, authorName: null, musicsCount: 2, visibility: 'public' },
    ] as never)
    expect(await loadCustomAlbumCategory()).toBeNull()
  })

  it('remota legada (ownerId null, id positivo): null igualmente', async () => {
    mockedCustom.mockResolvedValue([
      { id: 77, name: 'Legada Orfa', description: null, coverUrl: null, ownerId: null, authorName: 'Antigo', musicsCount: 4, visibility: 'public' },
    ] as never)
    expect(await loadCustomAlbumCategory()).toBeNull()
  })

  it('erro do listCustomCollections: null (nunca lança)', async () => {
    mockedCustom.mockRejectedValue(new Error('x'))
    expect(await loadCustomAlbumCategory()).toBeNull()
  })

  it('lista vazia: null', async () => {
    mockedCustom.mockResolvedValue([] as never)
    expect(await loadCustomAlbumCategory()).toBeNull()
  })
})
