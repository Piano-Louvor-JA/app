import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * bible-catalog — bundle-first sync (SPEC piano-bundle-sync).
 *
 * RF-04: capítulo faltante tenta 1x o /db/bible-bundle (1 request) antes
 * do fetch capítulo a capítulo; ADR-03: bundle indisponível (null) cai no
 * fluxo legado sem varredura de capítulos; bundle nunca lança.
 */

const readCatalogRecord = vi.fn()
const syncBundle = vi.fn()
const fetchRemoteCatalogJson = vi.fn()

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => null,
}))
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: (...a: unknown[]) => readCatalogRecord(...a),
  writeCatalogRecord: vi.fn(async () => true),
}))
vi.mock('@shared/services/bundle-sync-client', () => ({
  syncBundle: (...a: unknown[]) => syncBundle(...a),
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: (...a: unknown[]) => fetchRemoteCatalogJson(...a),
}))
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'pt',
}))

import { loadChapterVerses } from '../bible-catalog'

beforeEach(() => {
  vi.clearAllMocks()
  syncBundle.mockResolvedValue(null)
})

describe('loadChapterVerses — bundle-first (SPEC piano-bundle-sync)', () => {
  it('capítulo faltante: bundle aplica => lê do bundle, 1 request, sem fetch item-a-item', async () => {
    const verses = { 1: 'No princípio' }
    readCatalogRecord
      .mockResolvedValueOnce(null) // leitura local: falta
      .mockResolvedValueOnce(verses) // após aplicar o bundle
    syncBundle.mockResolvedValue({ records: { bible_1_1_1: verses } })
    fetchRemoteCatalogJson.mockRejectedValue(new Error('não deveria ser chamado'))

    expect(await loadChapterVerses(1, 1, 1)).toEqual(verses)
    expect(syncBundle).toHaveBeenCalledWith('bible')
    expect(fetchRemoteCatalogJson).not.toHaveBeenCalled()
  })

  it('bundle indisponível (null) => cai no fetch item-a-item e salva (ADR-03)', async () => {
    const verses = { 1: 'versículo' }
    readCatalogRecord.mockResolvedValue(null)
    syncBundle.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockResolvedValue(verses)

    expect(await loadChapterVerses(2, 20, 5)).toEqual(verses)
    expect(syncBundle).toHaveBeenCalledWith('bible')
    expect(fetchRemoteCatalogJson).toHaveBeenCalledWith('bible_2_20_5')
  })

  it('bundle aplica mas capítulo não veio no bundle => fetch item-a-item', async () => {
    readCatalogRecord.mockResolvedValue(null)
    syncBundle.mockResolvedValue({ records: { bible_1_1_1: { 1: 'x' } } })
    fetchRemoteCatalogJson.mockResolvedValue({ 1: 'do remoto' })

    expect(await loadChapterVerses(3, 30, 10)).toEqual({ 1: 'do remoto' })
    expect(fetchRemoteCatalogJson).toHaveBeenCalledWith('bible_3_30_10')
  })

  it('bundle lança exceção => nunca propaga; fluxo legado segue', async () => {
    readCatalogRecord.mockResolvedValue(null)
    syncBundle.mockRejectedValue(new Error('boom'))
    fetchRemoteCatalogJson.mockResolvedValue({ 1: 'ok' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await loadChapterVerses(4, 4, 4)).toEqual({ 1: 'ok' })
    vi.restoreAllMocks()
  })
})
