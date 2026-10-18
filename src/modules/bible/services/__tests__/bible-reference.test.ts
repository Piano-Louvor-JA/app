import { describe, expect, it } from 'vitest'
import { loadBundledBible, searchBundledBible } from '../bundled-bibles'
import { parseBibleReference } from '../bible-reference'

describe('Recherche par référence biblique', () => {
  it.each(['Jean 3:16-18', 'Jn3.16–18', '  JEAN 3 : 16-18  '])('reconnaît %s', async query => {
    const bible = await loadBundledBible()
    expect(parseBibleReference(query, bible.books)).toEqual({ bookId: 43, chapter: 3, verses: [16, 17, 18] })
  })
  it('accepte les livres numérotés et les chapitres entiers', async () => {
    const { books } = await loadBundledBible()
    expect(parseBibleReference('1 Jean 2:1', books)).toEqual({ bookId: 62, chapter: 2, verses: [1] })
    expect(parseBibleReference('Psaumes 23', books)).toEqual({ bookId: 19, chapter: 23, verses: [] })
    expect(parseBibleReference('Genèse 51:1', books)).toBeNull()
    expect(parseBibleReference('Jean 3:18-16', books)).toBeNull()
    expect(parseBibleReference('Dieu aime le monde', books)).toBeNull()
  })
  it('retourne les vrais versets de la référence et respecte les limites', async () => {
    const result = await searchBundledBible(1000001, 'Jean 3:16-18')
    expect(result.total).toBe(3)
    expect(result.hits.map(hit => hit.verse)).toEqual([16, 17, 18])
    expect(result.hits[0]?.text).toContain('Car Dieu a tant aimé le monde')
    expect((await searchBundledBible(1000001, 'Jean 3:99')).hits).toEqual([])
  })
})
