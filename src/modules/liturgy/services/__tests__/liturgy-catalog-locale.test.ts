import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLiturgyMusicOptions, loadLiturgyBibleBooks } from '../liturgy-catalog'

const mockPrefix = vi.fn<(locale?: string) => string>()
const readCatalogRecord = vi.fn<(filename: string) => Promise<unknown>>()

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: (...args: [string | undefined]) => mockPrefix(...args),
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: (...args: [string]) => readCatalogRecord(...args),
}))

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(async () => null),
}))

vi.mock('@modules/media/services/custom-catalog', () => ({
  listAllCustomMusics: vi.fn(async () => []),
  toCustomMusicId: (id: number) => id + 1_000_000,
}))

vi.mock('@modules/media/services/local-custom-store', () => ({
  listLocalCollections: () => [],
  listLocalMusics: () => [],
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('busca de músicas da liturgia usa catálogo do idioma ativo', () => {
  it('hinário ES quando idioma es', async () => {
    mockPrefix.mockReturnValue('es')
    readCatalogRecord.mockImplementation(async (filename: string) => {
      if (filename === 'es_musics')
        return [
          {
            id_music: 9015,
            name: 'Canta alegremente',
            albums: [{ name: 'Himnario Adventista' }],
          },
        ]
      if (filename === 'es_hymnal')
        return [{ id_music: 9015, name: 'Canta alegremente', track: 15 }]
      return null
    })

    const options = await loadLiturgyMusicOptions()
    const hymn = options.find((option) => option.id === 9015)
    expect(hymn?.name).toBe('Canta alegremente')
    expect(hymn?.hymnalTrack).toBe(15)
  })

  it('não consulta pt_hymnal quando idioma es', async () => {
    mockPrefix.mockReturnValue('es')
    readCatalogRecord.mockResolvedValue(null)

    await loadLiturgyMusicOptions()

    const files = readCatalogRecord.mock.calls.map((call) => call[0])
    expect(files).not.toContain('pt_hymnal')
    expect(files).not.toContain('pt_hymnal_1996')
    expect(files).toContain('es_hymnal')
  })
})

describe('livros bíblicos da liturgia usam idioma ativo', () => {
  it('es_bible_book quando idioma es', async () => {
    mockPrefix.mockReturnValue('es')
    readCatalogRecord.mockImplementation(async (filename: string) => {
      if (filename === 'es_bible_book')
        return [{ id_bible_book: 1, name: 'Génesis', chapters: 50 }]
      return null
    })

    const books = await loadLiturgyBibleBooks()
    expect(books[0]?.name).toBe('Génesis')
    const files = readCatalogRecord.mock.calls.map((call) => call[0])
    expect(files).toContain('es_bible_book')
    expect(files).not.toContain('pt_bible_book')
  })
})
