import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ language: 'pt-BR' }))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => {
    const prefix = state.language.slice(0, 2).toLowerCase()
    if (prefix === 'es' || prefix === 'en') return prefix
    return 'pt'
  },
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(async (filename: string) => {
    const fixtures: Record<string, unknown> = {
      pt_bible_version: [
        { id_bible_version: 2, name: 'Almeida Revista e Atualizada', abbreviation: 'ARA' },
      ],
      es_bible_version: [
        { id_bible_version: 10, name: 'Reina-Valera', abbreviation: 'RV' },
      ],
      pt_bible_book: [
        { id_bible_book: 1, book_number: 1, name: 'Gênesis', chapters: 50, abbreviation: 'Gn', testament: 1, keywords: 'genesis', color: '#000' },
      ],
      es_bible_book: [
        { id_bible_book: 67, book_number: 1, name: 'Génesis', chapters: 50, abbreviation: 'Gn', testament: 1, keywords: 'genesis', color: '#000' },
      ],
    }
    return fixtures[filename] ?? null
  }),
}))
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async () => null),
}))

import { loadBibleBooks, loadBibleVersions } from '../bible-catalog'

describe('bible-catalog — idioma ativo (hinário muda, Bíblia não)', () => {
  beforeEach(() => {
    state.language = 'pt-BR'
  })

  it('pt: carrega livros/versões pt (Gênesis id 1, ARA)', async () => {
    const books = await loadBibleBooks()
    const versions = await loadBibleVersions()
    expect(books[0]?.name).toBe('Gênesis')
    expect(books[0]?.id).toBe(1)
    expect(versions[0]?.abbreviation).toBe('ARA')
  })

  it('es: o mesmo módulo passa a carregar livros/versões es', async () => {
    state.language = 'es-ES'
    const books = await loadBibleBooks()
    const versions = await loadBibleVersions()
    expect(books[0]?.name).toBe('Génesis')
    expect(books[0]?.id).toBe(67)
    expect(versions[0]?.abbreviation).toBe('RV')
  })

  it('en: sem catálogo próprio — herda pt (mesma regra do hinário)', async () => {
    state.language = 'en-US'
    const books = await loadBibleBooks()
    expect(books[0]?.id).toBe(1)
  })
})
