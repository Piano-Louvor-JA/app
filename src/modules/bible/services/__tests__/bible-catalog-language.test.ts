import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ language: 'pt-BR' }))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => {
    const prefix = state.language.slice(0, 2).toLowerCase()
    return prefix === 'es' ? 'es' : 'pt'
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
    vi.resetModules()
    state.language = 'pt-BR'
  })

  it('pt: carrega livros/versões pt (Gênesis id 1, ARA)', async () => {
    const mod = await import('../bible-catalog')
    const books = await mod.loadBibleBooks()
    const versions = await mod.loadBibleVersions()
    expect(books[0]?.name).toBe('Gênesis')
    expect(books[0]?.id).toBe(1)
    expect(versions[0]?.abbreviation).toBe('ARA')
  })

  it('es: carrega livros/versões es (Génesis id 67, Reina-Valera)', async () => {
    state.language = 'es-ES'
    const mod = await import('../bible-catalog')
    const books = await mod.loadBibleBooks()
    const versions = await mod.loadBibleVersions()
    expect(books[0]?.name).toBe('Génesis')
    expect(books[0]?.id).toBe(67)
    expect(versions[0]?.abbreviation).toBe('RV')
  })

  it('en: sem catálogo próprio — herda pt (mesma regra do hinário)', async () => {
    state.language = 'en-US'
    const mod = await import('../bible-catalog')
    const books = await mod.loadBibleBooks()
    expect(books[0]?.id).toBe(1)
  })
})
