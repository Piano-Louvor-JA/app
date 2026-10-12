// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SPEC es-catalog-stale — Decisão A: revalidação pós-warm-boot.
 * refreshCatalogIfStale: TTL 24h OU cache 0 albums → fetch; write-guard
 * conservador; marcador só avança após tentativa online com payload válido;
 * evento louvorja:catalog-refreshed no sucesso com gravação.
 */

const store = new Map<string, unknown>()

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async (key: string) => store.get(key) ?? null),
  writeCatalogRecord: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
    return true
  }),
  clearWorkspace: vi.fn(async () => {}),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => null,
}))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'es',
}))

const fetchRemoteCatalogJson = vi.fn()

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: (...args: unknown[]) => fetchRemoteCatalogJson(...args),
}))

import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'
import { clearWorkspace } from '@shared/services/workspace-api'
import { refreshCatalogIfStale } from '../catalog-refresh'

function esPayload(total: number): Array<Record<string, unknown>> {
  const albums = Array.from({ length: total }, (_, i) => ({
    id_album: 9015 + i,
    name: `JA ${2003 + i}`,
    url_image: null,
  }))
  return [{ id_category: 12, name: 'CDs Oficiales/año', slug: 'aym', albums }]
}

function cacheTotal(payload: Array<Record<string, unknown>> | null): number {
  if (!payload || !Array.isArray(payload)) return 0
  return payload.reduce((sum, c) => sum + ((c.albums as unknown[])?.length ?? 0), 0)
}

describe('refreshCatalogIfStale — SPEC es-catalog-stale AC1–AC5', () => {
  beforeEach(() => {
    store.clear()
    fetchRemoteCatalogJson.mockReset()
    vi.clearAllMocks()
  })

  it('AC1: cache 0 albums + TTL fresco → fetch, write 22, marcador avança, evento dispara', async () => {
    // cache legacy vazio (2 cats / 0 albums) + marcador há 1h (TTL fresco)
    store.set('es_categories', esPayload(0))
    store.set(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt, {
      at: Date.now() - 1 * 3600_000,
      lang: 'es',
    })
    fetchRemoteCatalogJson.mockResolvedValue(esPayload(22))
    const events: Array<CustomEvent> = []
    window.addEventListener('louvorja:catalog-refreshed', (e) =>
      events.push(e as CustomEvent),
    )

    await refreshCatalogIfStale()

    expect(fetchRemoteCatalogJson).toHaveBeenCalledTimes(1)
    expect(fetchRemoteCatalogJson).toHaveBeenCalledWith('es_categories')
    const written = store.get('es_categories') as Array<Record<string, unknown>>
    expect(cacheTotal(written)).toBe(22)
    const marker = store.get(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt) as {
      at: number
      lang: string
    }
    expect(marker.lang).toBe('es')
    expect(events.length).toBe(1)
    expect(events[0]!.detail).toMatchObject({ lang: 'es', totalAlbums: 22 })
  })

  it('AC2: cache 22 + TTL fresco → zero fetch', async () => {
    store.set('es_categories', esPayload(22))
    store.set(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt, {
      at: Date.now() - 1 * 3600_000,
      lang: 'es',
    })

    await refreshCatalogIfStale()

    expect(fetchRemoteCatalogJson).not.toHaveBeenCalled()
    expect(clearWorkspace).not.toHaveBeenCalled()
  })

  it('AC3: cache 22 + TTL vencido → exatamente 1 fetch; downloaded_albums intacto; mídia intacta', async () => {
    store.set('es_categories', esPayload(22))
    store.set(WORKSPACE_RECORD_KEYS.downloadedAlbums, [9015, 9016])
    store.set(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt, {
      at: Date.now() - 25 * 3600_000,
      lang: 'es',
    })
    fetchRemoteCatalogJson.mockResolvedValue(esPayload(22))

    await refreshCatalogIfStale()

    expect(fetchRemoteCatalogJson).toHaveBeenCalledTimes(1)
    expect(store.get(WORKSPACE_RECORD_KEYS.downloadedAlbums)).toEqual([9015, 9016])
    expect(clearWorkspace).not.toHaveBeenCalled()
    // write-guard: mesmo total → grava (refresh de conteúdo) sem perder nada
    expect(cacheTotal(store.get('es_categories') as never)).toBe(22)
  })

  it('AC4: fetch devolve 0 albums com cache 22 → sem write de es_categories, sem evento, marcador avança', async () => {
    const good = esPayload(22)
    store.set('es_categories', good)
    store.set(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt, {
      at: Date.now() - 25 * 3600_000,
      lang: 'es',
    })
    fetchRemoteCatalogJson.mockResolvedValue(esPayload(0))
    const events: CustomEvent[] = []
    window.addEventListener('louvorja:catalog-refreshed', (e) =>
      events.push(e as CustomEvent),
    )

    await refreshCatalogIfStale()

    expect(store.get('es_categories')).toBe(good) // mesmo objeto — sem write
    expect(events.length).toBe(0)
    expect(
      (store.get(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt) as { lang: string }).lang,
    ).toBe('es')
  })

  it('AC5: offline (fetch rejeita) → sem write, sem evento, marcador NÃO avança', async () => {
    const oldMarker = { at: Date.now() - 25 * 3600_000, lang: 'es' }
    store.set('es_categories', esPayload(22))
    store.set(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt, oldMarker)
    fetchRemoteCatalogJson.mockRejectedValue(new Error('Failed to fetch'))
    const events: CustomEvent[] = []
    window.addEventListener('louvorja:catalog-refreshed', (e) =>
      events.push(e as CustomEvent),
    )

    await refreshCatalogIfStale()

    expect(fetchRemoteCatalogJson).toHaveBeenCalledTimes(1)
    expect(store.get(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt)).toBe(oldMarker)
    expect(events.length).toBe(0)
    expect(cacheTotal(store.get('es_categories') as never)).toBe(22)
  })

  it('fetch MENOR que cache (shrink de 22→5) → write-guard bloqueia gravação', async () => {
    store.set('es_categories', esPayload(22))
    store.set(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt, {
      at: Date.now() - 25 * 3600_000,
      lang: 'es',
    })
    fetchRemoteCatalogJson.mockResolvedValue(esPayload(5))

    await refreshCatalogIfStale()

    expect(cacheTotal(store.get('es_categories') as never)).toBe(22)
  })

  it('offline (navigator.onLine=false) → nem tenta fetch', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    store.set('es_categories', esPayload(0))
    try {
      await refreshCatalogIfStale()
      expect(fetchRemoteCatalogJson).not.toHaveBeenCalled()
    } finally {
      onLine.mockRestore()
    }
  })
})
