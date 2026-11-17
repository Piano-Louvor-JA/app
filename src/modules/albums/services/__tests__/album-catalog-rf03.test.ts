import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * RF-03 (SPEC-crud-comunidade-hub-v1.0.0): /albums lista APENAS coletâneas
 * do próprio usuário (locais ownerId=null; remotas ownerId===meu id_user).
 * Públicas de terceiros ficam somente na Comunidade.
 */
vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomCollections: vi.fn(),
  customFileUrl: (p: string) => p,
  toCustomCollectionId: (id: number) => `custom:${id}`,
}))
vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: vi.fn(),
}))
vi.mock('@modules/sync/services/media-paths', () => ({
  resolveCoverUrlsFromDisk: vi.fn(async () => ({})),
  resolveRemoteFileUrl: (p: string) => p,
}))

import { loadCustomAlbumCategory } from '../album-catalog'
import { listCustomCollections } from '@modules/media/services/custom-catalog'
import { getAuthSession } from '@modules/media/services/auth-client'

const mockedCustom = vi.mocked(listCustomCollections)
const mockedSession = vi.mocked(getAuthSession)

describe('album-catalog RF-03 — /albums só Minhas Coletâneas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usuário logado (id 47): esconde pública de terceiro (ownerId 49), mostra a sua (47) e as locais', async () => {
    mockedSession.mockReturnValue({
      token: 't', user: { id_user: 47, email: 'x@y.z' },
    } as never)
    mockedCustom.mockResolvedValue([
      { id: 1, name: 'Minha Local', description: null, coverUrl: null, ownerId: null, authorName: null, musicsCount: 2, visibility: 'private' },
      { id: 2, name: 'Minha Remota', description: null, coverUrl: null, ownerId: 47, authorName: null, musicsCount: 3, visibility: 'private' },
      { id: 3, name: 'De Outro Irmao', description: null, coverUrl: null, ownerId: 49, authorName: 'Outro', musicsCount: 5, visibility: 'public' },
    ] as never)
    const result = await loadCustomAlbumCategory()
    const names = (result?.collections ?? []).map((c) => c.name)
    expect(names).toContain('Minha Local')
    expect(names).toContain('Minha Remota')
    expect(names).not.toContain('De Outro Irmao')
  })

  it('deslogado: só locais (ownerId null) — nada de remotas de ninguém', async () => {
    mockedSession.mockReturnValue(null)
    mockedCustom.mockResolvedValue([
      { id: 1, name: 'Local Only', description: null, coverUrl: null, ownerId: null, authorName: null, musicsCount: 1, visibility: 'private' },
      { id: 9, name: 'Remota Alheia', description: null, coverUrl: null, ownerId: 12, authorName: null, musicsCount: 2, visibility: 'public' },
    ] as never)
    const result = await loadCustomAlbumCategory()
    const names = (result?.collections ?? []).map((c) => c.name)
    expect(names).toContain('Local Only')
    expect(names).not.toContain('Remota Alheia')
  })
})
