import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { bundledBibleVersions, loadBundledBible, searchBundledBible } from '../bundled-bibles'
import { loadBibleBooks, loadChapterVerses } from '../bible-catalog'
import { useBibleStore } from '../../stores/useBibleStore'
import { setUserPreference } from '@shared/services/user-preferences'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { saveApplicationLanguage } from '@shared/services/application-language'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'

vi.mock('@shared/services/remote-catalog', () => ({ fetchRemoteCatalogJson: vi.fn(() => { throw new Error('offline') }) }))
vi.mock('@shared/composables/useProjectionWindow', () => ({ closeProjectionModule: vi.fn(), hasSelectedExtendedProjectionTargets: vi.fn(() => false), isProjectionModuleOpen: vi.fn(() => false), openProjectionModule: vi.fn() }))

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.clearAllMocks() })

describe('French bundled Bibles', () => {
  it('preserva português em uma instalação sem preferências', () => {
    expect(useBibleStore().contentLanguage).toBe('pt')
  })
  it.each([['es', 'es'], ['fr', 'fr'], ['pt-BR', 'pt']])('respeita o idioma legado %s sem preferência separada de Bíblia', (locale, expected) => {
    setUserPreference(USER_PREFERENCE_KEYS.language, locale)
    expect(useBibleStore().contentLanguage).toBe(expected)
  })
  it('abre uma referência com seleção do intervalo e recusa versículos inexistentes', async () => {
    saveApplicationLanguage('fr')
    const store = useBibleStore()
    await store.bootstrap()
    expect(await store.openReference('Jean 3:16-18')).toBe(true)
    expect(store.selectedBookId).toBe(43)
    expect(store.selectedVerses).toEqual([16, 17, 18])
    expect(await store.openReference('Jean 3:99')).toBe(false)
    expect(store.selectedVerses).toEqual([16, 17, 18])
  })
  it.each(bundledBibleVersions)('$abbreviation has all 66 books, 1189 chapters and 31170 source records', async version => {
    const bible = await loadBundledBible(version.id)
    expect(bible.books).toHaveLength(66)
    expect(Object.keys(bible.chapters)).toHaveLength(1189)
    expect(Object.values(bible.chapters).reduce((n, verses) => n + Object.keys(verses).length, 0)).toBe(31170)
    expect(bible.chapters['1:1']['1']).toContain('les cieux et la terre')
    expect(bible.chapters['66:22']['21']).toContain('Jésus')
    expect(bible.books.every(book => bible.chapters[`${book.id}:${book.chapters}`])).toBe(true)
  })
  it('keeps the actual wording and empty records of Darby, without filling from Segond', async () => {
    expect((await loadChapterVerses(1000001, 43, 3))['16']).toContain('ne périsse point')
    expect((await loadChapterVerses(1000002, 43, 3))['16']).toContain('ne périsse pas')
    expect((await loadChapterVerses(1000002, 40, 23))['14']).toBe('')
    expect((await loadBibleBooks('fr', 1000002))[0].name).toBe('Genèse')
    expect(fetchRemoteCatalogJson).not.toHaveBeenCalled()
  })
  it('searches all books with AND terms, independent of accents, case and order', async () => {
    const result = await searchBundledBible(1000001, 'MONDE aime Dieu')
    expect(result.hits.some(hit => hit.bookId === 43 && hit.chapter === 3 && hit.verse === 16)).toBe(true)
    expect(await searchBundledBible(1000001, 'monde aimé dieu')).toEqual(result)
    expect((await searchBundledBible(1000001, 'zzzzintrouvable monde')).hits).toEqual([])
  })
  it('caps displayed results and keeps the real total', async () => {
    const result = await searchBundledBible(1000002, 'Dieu', 3)
    expect(result.hits).toHaveLength(3)
    expect(result.total).toBeGreaterThan(100)
    expect(await searchBundledBible(1000002, '   ')).toEqual({ hits: [], total: 0 })
  })
  it('rejects an unknown edition', async () => { await expect(loadBundledBible(9999)).rejects.toThrow('Unknown bundled Bible') })
  it('restores the global language and selected edition after recreating the store', async () => {
    const first = useBibleStore()
    saveApplicationLanguage('fr')
    await first.bootstrap()
    await first.selectVersion(1000002)
    first.$dispose()
    setActivePinia(createPinia())
    const restored = useBibleStore()
    await restored.bootstrap()
    expect(restored.contentLanguage).toBe('fr')
    expect(restored.selectedVersionId).toBe(1000002)
    expect(restored.verses['1']).toBe('Au commencement Dieu créa les cieux et la terre.')
    expect(fetchRemoteCatalogJson).not.toHaveBeenCalled()
  })
})
