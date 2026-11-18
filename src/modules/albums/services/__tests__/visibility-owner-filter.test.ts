// @vitest-environment jsdom
// RF-03 (SPEC-crud-comunidade-hub v1.0.0): /albums lista APENAS catálogo
// oficial + coletâneas do PRÓPRIO usuário (locais e sincronizadas).
// Coletâneas públicas de terceiros NÃO aparecem em /albums — só em /community.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthSession = vi.fn()
const listCustomCollections = vi.fn()

vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: (...a: unknown[]) => getAuthSession(...a),
}))
vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomCollections: (...a: unknown[]) => listCustomCollections(...a),
  customFileUrl: (p: string) => `cf:${p}`,
  toCustomCollectionId: (id: number) => id + 2_000_000,
}))

import { filterCustomCollectionsForAlbums } from '../visibility-owner-filter'

const SESSION = { token: 'tok', user: { id_user: 4, email: 'a@b.c', displayName: 'A' } }

function col(partial: {
  id: number
  name: string
  ownerId?: number | null
  visibility?: 'public' | 'private'
}) {
  return { description: null, coverUrl: null, musicsCount: 0, ...partial }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  getAuthSession.mockReturnValue(null)
})

describe('filterCustomCollectionsForAlbums — RF-03', () => {
  it('logado: só as coletâneas dele (owner_id === id_user); terceiros fora', () => {
    getAuthSession.mockReturnValue(SESSION)
    const all = [
      col({ id: 1, name: 'Minha sincronizada', ownerId: 4 }),
      col({ id: 2, name: 'De terceiro', ownerId: 9, visibility: 'public' }),
      col({ id: 3, name: 'Minha privada', ownerId: 4, visibility: 'private' }),
    ]
    const out = filterCustomCollectionsForAlbums(all)
    expect(out.map((c) => c.id)).toEqual([1, 3])
  })

  it('deslogado: coletâneas com ownerId ficam de fora (todas são de terceiros)', () => {
    const all = [
      col({ id: 2, name: 'Pública de terceiro', ownerId: 9, visibility: 'public' }),
    ]
    expect(filterCustomCollectionsForAlbums(all)).toEqual([])
  })

  it('deslogado: locais (ownerId null/undefined) entram — ids negativos são desta máquina', () => {
    const all = [
      col({ id: -3, name: 'Local minha', ownerId: null }),
      col({ id: 2, name: 'Pública de terceiro', ownerId: 9 }),
    ]
    expect(filterCustomCollectionsForAlbums(all).map((c) => c.id)).toEqual([-3])
  })

  it('legado owner_id = NULL remota (positiva): NÃO aparece em /albums (RF-06 fora de escopo)', () => {
    getAuthSession.mockReturnValue(SESSION)
    const all = [
      col({ id: 77, name: 'Legada órfã', ownerId: null, visibility: 'public' }),
    ]
    expect(filterCustomCollectionsForAlbums(all)).toEqual([])
  })

  it('cópia salva via comunidade (é do usuário) aparece', () => {
    getAuthSession.mockReturnValue(SESSION)
    const all = [
      col({ id: -10, name: 'Cópia local salva', ownerId: null }),
      col({ id: 50, name: 'Minha via API', ownerId: 4 }),
      col({ id: 51, name: 'Original do autor', ownerId: 12, visibility: 'public' }),
    ]
    expect(filterCustomCollectionsForAlbums(all).map((c) => c.name)).toEqual([
      'Cópia local salva',
      'Minha via API',
    ])
  })
})
