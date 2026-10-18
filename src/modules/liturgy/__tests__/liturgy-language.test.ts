import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLiturgyBibleBooks, loadLiturgyMusicOptions } from '../services/liturgy-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
const language = vi.hoisted(() => ({ value: 'fr' }))
vi.mock('@modules/sync/services/library-catalog', () => ({ getCurrentApiPrefix: () => language.value }))
vi.mock('@shared/services/workspace-api', () => ({ readCatalogRecord: vi.fn(async () => []) }))
vi.mock('@shared/services/remote-catalog', () => ({ fetchRemoteCatalogJson: vi.fn(async () => []) }))
vi.mock('@modules/media/services/custom-catalog', () => ({ listAllCustomMusics: async () => [], toCustomMusicId: (id: number) => id + 1000000 }))
vi.mock('@modules/media/services/local-custom-store', () => ({ listLocalCollections: () => [], listLocalMusics: () => [] }))
beforeEach(() => { language.value = 'fr'; vi.clearAllMocks() })
describe('Liturgia acompanha o idioma do aplicativo', () => {
  it('usa os livros franceses locais e não mistura o hinário português', async () => {
    const books = await loadLiturgyBibleBooks()
    expect(books[0]?.name).toBe('Genèse')
    expect(books).toHaveLength(66)
    expect(await loadLiturgyMusicOptions()).toEqual([])
    expect(readCatalogRecord).not.toHaveBeenCalled()
    expect(fetchRemoteCatalogJson).not.toHaveBeenCalled()
  })
  it('consulta os livros e hinários espanhóis sem fallback silencioso para português', async () => {
    language.value = 'es'
    await loadLiturgyBibleBooks()
    await loadLiturgyMusicOptions()
    const files = vi.mocked(readCatalogRecord).mock.calls.map(call => call[0])
    expect(files).toContain('es_bible_book')
    expect(files).toContain('es_hymnal')
    expect(files.some(file => file.startsWith('pt_'))).toBe(false)
  })
})
