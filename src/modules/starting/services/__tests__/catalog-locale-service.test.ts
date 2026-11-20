import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * app#339 — troca de idioma deve garantir o catálogo do idioma alvo.
 * Hoje changeLanguage só troca locale+pref: os records {lang}_* continuam
 * do idioma antigo até reinstalar. ensureCatalogForLocale baixa os
 * essenciais do idioma novo (serviço retomável) e é idempotente.
 */

const store = new Map<string, unknown>()

vi.mock('@shared/constants/storage-keys', () => ({
  WORKSPACE_RECORD_KEYS: {
    bootstrapComplete: 'bootstrapComplete',
    config: 'config',
  },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => null,
}))

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(async (file: string) => ({ file })),
}))

vi.mock('@shared/services/workspace-api', () => ({
  clearWorkspace: vi.fn(async () => {}),
  readCatalogRecord: vi.fn(async (key: string) => store.get(key) ?? null),
  writeCatalogRecord: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
    return true
  }),
}))

// library-catalog mockado com prefixo CONTROLÁVEL pelo teste
let currentPrefix = 'pt'
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: vi.fn(() => currentPrefix),
  localeToApiPrefix: (locale: string) =>
    ({ 'pt-BR': 'pt', en: 'en', es: 'es' })[locale] ?? 'pt',
}))

import { ensureCatalogForLocale } from '../catalog-locale-service'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

const EN_FILES = [
  'en_categories',
  'en_hymnal',
  'en_hymnal_1996',
  'en_musics',
  'en_bible_book',
  'en_bible_version',
]

describe('ensureCatalogForLocale (app#339)', () => {
  beforeEach(() => {
    store.clear()
    currentPrefix = 'pt'
    vi.mocked(fetchRemoteCatalogJson).mockClear()
  })

  it('idioma novo sem catálogo → baixa os essenciais do idioma alvo', async () => {
    const progress: number[] = []
    await ensureCatalogForLocale('en', (p) => progress.push(p))
    const files = vi
      .mocked(fetchRemoteCatalogJson)
      .mock.calls.map((c) => c[0])
    expect(files).toEqual(EN_FILES)
    expect(progress.at(-1)).toBe(100)
  })

  it('idioma já presente → zero downloads (idempotente)', async () => {
    await ensureCatalogForLocale('en', () => {})
    const calls = vi.mocked(fetchRemoteCatalogJson).mock.calls.length
    await ensureCatalogForLocale('en', () => {})
    expect(
      vi.mocked(fetchRemoteCatalogJson).mock.calls.length - calls,
    ).toBe(0)
  })

  it('volta pro idioma anterior depois de rodar (não coloca o prefixo em estado global)', async () => {
    currentPrefix = 'pt'
    await ensureCatalogForLocale('en', () => {})
    expect(getCurrentApiPrefix()).toBe('pt')
  })
})
