import { describe, expect, it, vi } from 'vitest'

// import do liturgy-catalog puxa i18n/browser-storage — stub ANTES do import
// (hoisted: executa antes das importacoes do modulo)
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }))
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

vi.mock('@shared/services/remote-catalog', () => ({ fetchRemoteCatalogJson: vi.fn() }))
vi.mock('@shared/services/workspace-api', () => ({ readCatalogRecord: vi.fn() }))
vi.mock('@modules/sync/services/library-catalog', () => ({ getCurrentApiPrefix: () => 'pt' }))

import { filterLiturgyMusicOptions, type LiturgyMusicOption } from '../liturgy-catalog'

function opt(partial: Partial<LiturgyMusicOption>): LiturgyMusicOption {
  return {
    id: 1,
    name: 'Oh, Não Temas',
    hymnalTrack: null,
    albumNames: 'Hinário Adventista',
    displayLabel: 'Oh, Não Temas',
    durationMs: null,
    hasInstrumental: false,
    ...partial,
  }
}

const options = [
  opt({ id: 1, name: 'Oh, Não Temas', lyricsText: 'nao temas, eu sou contigo; nao desanimar' }),
  opt({ id: 2, name: 'Nova Santa', lyricsText: 'santa nove e pura' }),
  opt({ id: 3, name: 'Grande és Tu', lyricsText: undefined }),
]

describe('filterLiturgyMusicOptions — busca por letra + fold (issue 348)', () => {
  it('trecho da letra SEM acento acha o hino acentuado', () => {
    const hits = filterLiturgyMusicOptions(options, 'sou contigo', null)
    expect(hits.map((h) => h.id)).toContain(1)
  })

  it('título sem acento casa título acentuado', () => {
    const hits = filterLiturgyMusicOptions(options, 'nao temas', null)
    expect(hits.map((h) => h.id)).toContain(1)
  })

  it('termos espalhados na letra casam', () => {
    const hits = filterLiturgyMusicOptions(options, 'temas desanimar', null)
    expect(hits.map((h) => h.id)).toContain(1)
  })

  it('sem letra, comportamento anterior (nome/álbum) preservado', () => {
    const hits = filterLiturgyMusicOptions(options, 'grande', null)
    expect(hits.map((h) => h.id)).toContain(3)
  })

  it('número do hinário continua funcionando', () => {
    const withTrack = [opt({ id: 9, name: 'Sem título útil', hymnalTrack: 417 })]
    const hits = filterLiturgyMusicOptions(withTrack, '417', null)
    expect(hits.map((h) => h.id)).toContain(9)
  })
})
