import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  chapterRecordKey,
  loadBibleBooks,
  loadBibleVersions,
  loadChapterVerses,
  pickDefaultVersionId,
  resolveBookTone,
  resolveTestament,
  resolveVersionAbbreviation,
} from '../services/bible-catalog'

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(),
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(),
}))

import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'

const mockRead = vi.mocked(readCatalogRecord)
const mockFetch = vi.mocked(fetchRemoteCatalogJson)

beforeEach(() => {
  mockRead.mockReset()
  mockFetch.mockReset()
})

describe('resolveVersionAbbreviation', () => {
  it('usa a abreviação do campo quando presente', () => {
    expect(resolveVersionAbbreviation('ARA', 'Almeida Revista e Atualizada')).toBe('ARA')
  })

  it('trata "null" como vazio e deriva do nome', () => {
    expect(resolveVersionAbbreviation('null', 'Nova Almeida Atualizada')).toBe('NAA')
  })

  it('deriva do nome para cada versão conhecida', () => {
    const casos: Array<[string, string]> = [
      ['Almeida Corrigida e Revisada Fiel', 'ACRF'],
      ['Almeida Corrigida e Fiel', 'ACF'],
      ['Almeida Revisada Imprensa', 'ARIB'],
      ['Almeida Revista e Corrigida', 'ARC'],
      ['King James Atualizada', 'KJA'],
      ['Nova Versão Internacional', 'NVI'],
      ['Sagradas Escrituras', 'SEV'],
      ['Reina-Valera 1989', 'RVA'],
      ['Reina Valera', 'RV'],
    ]
    for (const [nome, abbr] of casos) {
      expect(resolveVersionAbbreviation(null, nome)).toBe(abbr)
    }
  })

  it('deriva do id quando nome não casa com padrão', () => {
    expect(resolveVersionAbbreviation(null, 'Versão estranha', 'naa')).toBe('NAA')
  })

  it('retorna vazio quando nada casa (id longo demais)', () => {
    expect(resolveVersionAbbreviation(null, '', 'versao-longa')).toBe('')
  })

  it('retorna vazio quando tudo é null/undefined', () => {
    expect(resolveVersionAbbreviation(undefined, undefined, undefined)).toBe('')
  })
})

describe('resolveTestament', () => {
  it('livros 1-39 são AT', () => {
    expect(resolveTestament(1)).toBe('ot')
    expect(resolveTestament(39)).toBe('ot')
  })

  it('livros 40+ são NT', () => {
    expect(resolveTestament(40)).toBe('nt')
    expect(resolveTestament(66)).toBe('nt')
  })
})

describe('resolveBookTone', () => {
  it('faixas canônicas de tom', () => {
    expect(resolveBookTone(1)).toBe('law')
    expect(resolveBookTone(5)).toBe('law')
    expect(resolveBookTone(6)).toBe('history')
    expect(resolveBookTone(17)).toBe('history')
    expect(resolveBookTone(18)).toBe('prophets')
    expect(resolveBookTone(39)).toBe('prophets')
    expect(resolveBookTone(40)).toBe('gospels')
    expect(resolveBookTone(43)).toBe('gospels')
    expect(resolveBookTone(44)).toBe('letters')
    expect(resolveBookTone(66)).toBe('letters')
  })

  it('número fora do cânon é neutral', () => {
    expect(resolveBookTone(99)).toBe('neutral')
  })
})

describe('chapterRecordKey', () => {
  it('monta chave do workspace', () => {
    expect(chapterRecordKey(2, 1, 3)).toBe('bible_2_1_3')
  })
})

describe('loadBibleBooks', () => {
  it('mapeia linhas do catálogo', async () => {
    mockRead.mockResolvedValue([
      {
        id_bible_book: '1',
        name: ' Gênesis ',
        abbreviation: 'Gn',
        chapters: '50',
        book_number: '1',
        id_language: 'pt',
      },
    ])
    const books = await loadBibleBooks()
    expect(books).toEqual([
      {
        id: 1,
        name: 'Gênesis',
        abbreviation: 'Gn',
        chapters: 50,
        bookNumber: 1,
        languageId: 'pt',
      },
    ])
  })

  it('retorna vazio quando catálogo é null', async () => {
    mockRead.mockResolvedValue(null)
    mockFetch.mockResolvedValue(null)
    await expect(loadBibleBooks()).resolves.toEqual([])
  })

  it('retorna vazio quando catálogo não é array', async () => {
    mockRead.mockResolvedValue({ quebra: true } as never)
    await expect(loadBibleBooks()).resolves.toEqual([])
  })

  it('fallback remoto quando local é null; falha remota vira vazio', async () => {
    mockRead.mockResolvedValueOnce(null)
    mockFetch.mockResolvedValueOnce([
      {
        id_bible_book: 2,
        name: 'Êxodo',
        abbreviation: null,
        chapters: 40,
        book_number: 2,
        id_language: null,
      },
    ])
    const books = await loadBibleBooks()
    expect(books[0]).toMatchObject({ id: 2, name: 'Êxodo', languageId: 'pt' })

    mockRead.mockResolvedValueOnce(null)
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(loadBibleBooks()).resolves.toEqual([])
    warn.mockRestore()
  })

  it('nome null vira string vazia via String() (mapBook)', async () => {
    mockRead.mockResolvedValue([
      {
        id_bible_book: '3',
        name: null,
        abbreviation: 'Lv',
        chapters: 0,
        book_number: 0,
        id_language: 'pt',
      },
    ])
    const books = await loadBibleBooks()
    expect(books[0]).toMatchObject({ name: '', chapters: 0, bookNumber: 0 })
  })
})

describe('loadBibleVersions', () => {
  it('mapeia versões resolvendo abreviação', async () => {
    mockRead.mockResolvedValue([
      {
        id_bible_version: '1',
        name: 'Almeida Revista e Atualizada',
        abbreviation: null,
        id_language: 'pt',
      },
    ])
    const versions = await loadBibleVersions()
    expect(versions[0]).toMatchObject({
      id: 1,
      abbreviation: 'ARA',
      name: 'Almeida Revista e Atualizada',
    })
  })

  it('retorna vazio quando catálogo é null', async () => {
    mockRead.mockResolvedValue(null)
    mockFetch.mockResolvedValue(null)
    await expect(loadBibleVersions()).resolves.toEqual([])
  })

  it('nome null/undefined cai no fallback String() no mapVersion', async () => {
    mockRead.mockResolvedValue([
      {
        id_bible_version: 7,
        name: undefined,
        abbreviation: 'XY',
        id_language: 'pt',
      },
    ])
    const versions = await loadBibleVersions()
    expect(versions[0]).toMatchObject({ id: 7, name: '', abbreviation: 'XY' })
  })

  it('id_language null vira "pt" no mapVersion', async () => {
    mockRead.mockResolvedValue([
      {
        id_bible_version: 8,
        name: 'Versão X',
        abbreviation: 'VX',
        id_language: null,
      },
    ])
    const versions = await loadBibleVersions()
    expect(versions[0]).toMatchObject({ id: 8, languageId: 'pt' })
  })
})

describe('loadChapterVerses', () => {
  it('retorna versículos do workspace', async () => {
    mockRead.mockResolvedValue({ '1': 'verso um' })
    await expect(loadChapterVerses(1, 1, 1)).resolves.toEqual({ '1': 'verso um' })
  })

  it('retorna objeto vazio quando registro não existe', async () => {
    mockRead.mockResolvedValue(null)
    mockFetch.mockResolvedValue(null)
    await expect(loadChapterVerses(1, 1, 1)).resolves.toEqual({})
  })
})

describe('pickDefaultVersionId', () => {
  const VERSIONS = [
    { id: 1, abbreviation: 'ACF', name: 'Almeida Corrigida e Fiel', languageId: 'pt' },
    { id: 2, abbreviation: 'ara', name: 'Almeida Revista e Atualizada', languageId: 'pt' },
  ]

  it('retorna null sem versões', () => {
    expect(pickDefaultVersionId([], null)).toBeNull()
  })

  it('mantém versão salva quando existe', () => {
    expect(pickDefaultVersionId(VERSIONS, 1)).toBe(1)
  })

  it('salva inexistente cai na ARA (case-insensitive)', () => {
    expect(pickDefaultVersionId(VERSIONS, 99)).toBe(2)
  })

  it('sem ARA e sem salvamento usa a primeira', () => {
    const semAra = [VERSIONS[0]]
    expect(pickDefaultVersionId(semAra, null)).toBe(1)
  })

  it('salvo null também cai no default', () => {
    expect(pickDefaultVersionId(VERSIONS, null)).toBe(2)
  })
})
