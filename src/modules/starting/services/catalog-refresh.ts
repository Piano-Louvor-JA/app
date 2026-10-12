import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'
import {
  readCatalogRecord,
  writeCatalogRecord,
} from '@shared/services/workspace-api'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'
import {
  downloadQueueSnapshot,
  enqueueDownload,
  subscribeDownloadQueue,
} from '@modules/sync/services/download-queue-service'

import type { CatalogCategory } from '@modules/sync/types/library'

/**
 * SPEC app#es-catalog-stale — revalidação do catálogo pós-warm-boot.
 *
 * O bootstrap grava `${lang}_categories` uma única vez; se ele rodou num
 * momento em que a API devolveu catálogo vazio, o cache fica vazio PARA
 * SEMPRE (leituras são cache-only). Este serviço revalida em background:
 * fetch quando TTL 24h vence OU cache tem 0 albums, com write-guard
 * conservador (nunca substitui cache bom por payload menor/vazio).
 *
 * Contrato #337: nunca roda no first boot; nunca toca bootstrapComplete,
 * Media/ ou downloaded_albums. Escopo do write: `${lang}_categories` +
 * marcador catalog_refresh_checked_at.
 */

const TTL_MS = 24 * 3600_000
const QUEUE_ID = 'catalog:bg-refresh'

type RefreshMarker = {
  at: number
  lang: string
}

function totalAlbums(categories: unknown): number {
  if (!Array.isArray(categories)) return 0
  return categories.reduce<number>(
    (sum, category) =>
      sum + ((category as CatalogCategory)?.albums?.length ?? 0),
    0,
  )
}

/**
 * Revalida o catálogo do idioma corrente. Sem UI, sem throw — erros são
 * logados e o marcador só avança após tentativa online com payload válido.
 */
export async function refreshCatalogIfStale(): Promise<void> {
  const lang = getCurrentApiPrefix()
  const categoriesKey = `${lang}_categories`

  const cached = await readCatalogRecord<CatalogCategory[]>(categoriesKey)
  const cachedTotal = totalAlbums(cached)

  const marker = await readCatalogRecord<RefreshMarker>(
    WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt,
  )
  const ttlFresh =
    marker != null && typeof marker.at === 'number' && Date.now() - marker.at < TTL_MS

  // Cache saudável + TTL fresco → nada a fazer.
  if (cachedTotal > 0 && ttlFresh) return
  // ponytail: cache 0 ignora TTL — cura a cada boot até sarar.
  if (!navigator.onLine) return

  try {
    const fetched = await fetchRemoteCatalogJson<CatalogCategory[]>(categoriesKey)
    const fetchedTotal = totalAlbums(fetched)

    // Write-guard: só grava payload válido que não encolhe o catálogo.
    if (Array.isArray(fetched) && fetchedTotal > 0 && fetchedTotal >= cachedTotal) {
      const ok = await writeCatalogRecord(categoriesKey, fetched)
      if (ok) {
        window.dispatchEvent(
          new CustomEvent('louvorja:catalog-refreshed', {
            detail: { lang, totalAlbums: fetchedTotal },
          }),
        )
      }
    }

    // Marcador avança só após tentativa online com payload válido.
    if (Array.isArray(fetched)) {
      await writeCatalogRecord(WORKSPACE_RECORD_KEYS.catalogRefreshCheckedAt, {
        at: Date.now(),
        lang,
      } satisfies RefreshMarker)
    }
  } catch (error) {
    // Rede fora/erro: sem marcador — retry no próximo boot.
    console.warn('[starting] refresh de catálogo falhou', error)
  }
}

/**
 * Após o warm boot, revalida o catálogo em background via fila unificada
 * (item `bg` — mesmo precedente de covers:bg-sync #338). Não bloqueia UI.
 */
export async function startCatalogBackgroundRefresh(): Promise<void> {
  await new Promise<void>((resolve) => {
    enqueueDownload({
      id: QUEUE_ID,
      label: 'Catálogo',
      priority: 'bg',
      task: async () => {
        await refreshCatalogIfStale()
      },
    })
    // resolve quando o item sai da fila de pendentes
    const check = () => {
      const item = downloadQueueSnapshot().find((q) => q.id === QUEUE_ID)
      if (item && item.status !== 'pending' && item.status !== 'running') {
        unsub()
        resolve()
      }
    }
    const unsub = subscribeDownloadQueue(() => check())
    check()
  })
}
