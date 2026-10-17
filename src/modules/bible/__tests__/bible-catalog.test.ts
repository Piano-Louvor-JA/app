import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  chapterRecordKey,
  loadBibleBooks,
  loadBibleVersions,
  loadChapterVerses,
  pickDefaultVersionId,
  requestBibleBundleUpdate,
  resolveBookTone,
  resolveTestament,
  resolveVersionAbbreviation,
} from '../services/bible-catalog'

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(),
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(),
  writeCatalogRecord: vi.fn(),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))

import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord, writeCatalogRecord } from '@shared/services/workspace-api'
import type { LouvorJaBridge } from '@shared/types/desktop-bridge'

const mockRead = vi.mocked(readCatalogRecord)
const mockWrite = vi.mocked(writeCatalogRecord)
const mockFetch = vi.mocked(fetchRemoteCatalogJson)
const mockBridge = vi.mocked(getDesktopBridge)

function bridgeWithBible(getChapter: (...args: number[]) => Promise<unknown>) {
  mockBridge.mockReturnValue({
    bible: { getChapter, listVersions: vi.fn(async () => []) },
  } as unknown as LouvorJaBridge)
}

beforeEach(() => {
  mockRead.mockReset()
  mockWrite.mockReset()
  mockWrite.mockResolvedValue(true)
  mockFetch.mockReset()
  mockBridge.mockReset()
  mockBridge.mockReturnValue(null)
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
    expect(resolveBookTone(18)).toBe('poetry')
    expect(resolveBookTone(39)).toBe('minor-prophet')
    expect(resolveBookTone(40)).toBe('gospels')
    expect(resolveBookTone(43)).toBe('gospels')
    expect(resolveBookTone(44)).toBe('acts')
    expect(resolveBookTone(66)).toBe('apocalyptic')
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

  it('bundle offline (instalador/atualização) vem antes do disco e da API', async () => {
    const getChapter = vi.fn(async () => ({ '1': 'do bundle' }))
    bridgeWithBible(getChapter)
    await expect(loadChapterVerses(2, 43, 3)).resolves.toEqual({ '1': 'do bundle' })
    expect(getChapter).toHaveBeenCalledWith(2, 43, 3)
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sem bundle usa o capítulo salvo no disco', async () => {
    bridgeWithBible(vi.fn(async () => null))
    mockRead.mockResolvedValue({ '1': 'salvo' })
    await expect(loadChapterVerses(2, 43, 3)).resolves.toEqual({ '1': 'salvo' })
    expect(mockRead).toHaveBeenCalledWith('bible_2_43_3')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('bridge que falha não impede o fallback', async () => {
    bridgeWithBible(vi.fn(async () => Promise.reject(new Error('ipc'))))
    mockRead.mockResolvedValue({ '1': 'salvo' })
    await expect(loadChapterVerses(2, 43, 3)).resolves.toEqual({ '1': 'salvo' })
  })

  it('sob demanda: busca na API e salva no disco', async () => {
    mockRead.mockResolvedValue(null)
    mockFetch.mockResolvedValue({ '16': 'Porque Deus amou o mundo' })
    await expect(loadChapterVerses(2, 43, 3)).resolves.toEqual({
      '16': 'Porque Deus amou o mundo',
    })
    expect(mockFetch).toHaveBeenCalledWith('bible_2_43_3')
    expect(mockWrite).toHaveBeenCalledWith('bible_2_43_3', {
      '16': 'Porque Deus amou o mundo',
    })
  })

  it('registro vazio no disco não conta como capítulo: vai à API', async () => {
    mockRead.mockResolvedValue({})
    mockFetch.mockResolvedValue({ '1': 'da API' })
    await expect(loadChapterVerses(2, 1, 1)).resolves.toEqual({ '1': 'da API' })
  })

  it('resposta inválida da API não é salva', async () => {
    mockRead.mockResolvedValue(null)
    for (const invalid of [{}, [], 'texto', null]) {
      mockFetch.mockResolvedValueOnce(invalid as never)
      await expect(loadChapterVerses(2, 1, 1)).resolves.toEqual({})
    }
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('API fora do ar → vazio, sem salvar', async () => {
    mockRead.mockResolvedValue(null)
    mockFetch.mockRejectedValue(new Error('offline'))
    await expect(loadChapterVerses(2, 1, 1)).resolves.toEqual({})
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('falha ao salvar não perde o capítulo baixado', async () => {
    mockRead.mockResolvedValue(null)
    mockFetch.mockResolvedValue({ '1': 'baixado' })
    mockWrite.mockRejectedValue(new Error('disco cheio'))
    await expect(loadChapterVerses(2, 1, 1)).resolves.toEqual({ '1': 'baixado' })
  })

  it('roundtrip: capítulo salvo sob demanda é lido do disco na próxima vez (sem rede)', async () => {
    const disk = new Map<string, unknown>()
    mockWrite.mockImplementation(async (key, data) => {
      disk.set(key, JSON.parse(JSON.stringify(data)))
      return true
    })
    mockRead.mockImplementation(async (key) => (disk.get(key) ?? null) as never)
    mockFetch.mockResolvedValueOnce({ '1': 'primeira vez' })

    await expect(loadChapterVerses(8, 19, 23)).resolves.toEqual({ '1': 'primeira vez' })
    mockFetch.mockRejectedValue(new Error('offline'))
    await expect(loadChapterVerses(8, 19, 23)).resolves.toEqual({ '1': 'primeira vez' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('requestBibleBundleUpdate', () => {
  it('fora do desktop não faz nada', async () => {
    await expect(requestBibleBundleUpdate()).resolves.toBeUndefined()
  })

  it('pede ao main para conferir bundles novos', async () => {
    const checkUpdates = vi.fn(async () => ({ status: 'up-to-date', updated: [], failed: [] }))
    mockBridge.mockReturnValue({
      bible: { getChapter: vi.fn(), listVersions: vi.fn(), checkUpdates },
    } as unknown as LouvorJaBridge)
    await requestBibleBundleUpdate()
    expect(checkUpdates).toHaveBeenCalledTimes(1)
  })

  it('falha do main não vaza para a tela', async () => {
    mockBridge.mockReturnValue({
      bible: {
        getChapter: vi.fn(),
        listVersions: vi.fn(),
        checkUpdates: vi.fn(async () => Promise.reject(new Error('ipc'))),
      },
    } as unknown as LouvorJaBridge)
    await expect(requestBibleBundleUpdate()).resolves.toBeUndefined()
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
