import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'
import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'
import {
  readCatalogRecord,
  resolveMediaUrl,
  writeCatalogRecord,
} from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'
import { toRelativeMediaPath } from '@modules/sync/services/media-paths'

type CategoryAlbum = {
  url_image?: string | null
}

type CategoryRow = {
  albums?: CategoryAlbum[]
}

export type EnsureAlbumCoversOptions = {
  /** Se true, não faz nada quando `covers_synced` já está marcado. Default: true. */
  skipIfSynced?: boolean
  /** Progresso 0–100 durante checagem + download. */
  onProgress?: (progress: number) => void
}

export type EnsureAlbumCoversResult = {
  total: number
  missing: number
  downloaded: number
}

let isRunning = false

const CHECK_BATCH = 24
const DOWNLOAD_BATCH = 5

async function collectCoverPaths(): Promise<string[]> {
  const langPrefix = getCurrentApiPrefix()
  const categories = await readCatalogRecord<CategoryRow[]>(`${langPrefix}_categories`)
  if (!categories || !Array.isArray(categories)) return []

  const allImages = new Set<string>()
  for (const category of categories) {
    category.albums?.forEach((album) => {
      if (album.url_image) allImages.add(album.url_image)
    })
  }
  return [...allImages]
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    const batchResults = await Promise.all(batch.map(mapper))
    results.push(...batchResults)
  }
  return results
}

/**
 * Verifica capas do catálogo e baixa apenas as que faltam no disco.
 * Usado no first boot (bloqueante, com progresso) e no warm boot (background).
 */
export async function ensureAlbumCovers(
  options: EnsureAlbumCoversOptions = {},
): Promise<EnsureAlbumCoversResult> {
  const empty: EnsureAlbumCoversResult = { total: 0, missing: 0, downloaded: 0 }
  if (!isDesktopApp() || isRunning) return empty

  const bridge = getDesktopBridge()
  if (!bridge) return empty

  const skipIfSynced = options.skipIfSynced !== false
  const onProgress = options.onProgress

  try {
    isRunning = true

    if (skipIfSynced) {
      const alreadySynced = await readCatalogRecord<{ complete?: boolean }>(
        WORKSPACE_RECORD_KEYS.coversSynced,
      )
      if (alreadySynced?.complete) {
        onProgress?.(100)
        return empty
      }
    }

    const allImages = await collectCoverPaths()
    if (allImages.length === 0) {
      await writeCatalogRecord(WORKSPACE_RECORD_KEYS.coversSynced, { complete: true })
      onProgress?.(100)
      return empty
    }

    onProgress?.(2)

    const existence = await mapInBatches(allImages, CHECK_BATCH, async (urlImage) => {
      const relativePath = toRelativeMediaPath(urlImage)
      if (!relativePath) return { urlImage, exists: true as boolean }
      const exists = Boolean(await bridge.media.check('covers', relativePath))
      return { urlImage, exists }
    })

    const missing = existence.filter((item) => !item.exists).map((item) => item.urlImage)
    onProgress?.(missing.length === 0 ? 100 : 12)

    if (missing.length === 0) {
      await writeCatalogRecord(WORKSPACE_RECORD_KEYS.coversSynced, { complete: true })
      return { total: allImages.length, missing: 0, downloaded: 0 }
    }

    let downloaded = 0
    for (let index = 0; index < missing.length; index += DOWNLOAD_BATCH) {
      if (!navigator.onLine) break

      const batch = missing.slice(index, index + DOWNLOAD_BATCH)
      await Promise.all(
        batch.map(async (urlImage) => {
          const relativePath = toRelativeMediaPath(urlImage)
          /* v8 ignore next 1 -- missing só contém paths com relativePath válido */
          if (!relativePath) return
          const fullUrl = resolveMediaUrl(urlImage)
          const ok = await bridge.media.download(fullUrl, 'covers', relativePath)
          if (ok) downloaded += 1
        }),
      )

      const ratio = Math.min(1, (index + batch.length) / missing.length)
      onProgress?.(12 + Math.round(ratio * 88))
    }

    const stillMissing = await mapInBatches(missing, CHECK_BATCH, async (urlImage) => {
      const relativePath = toRelativeMediaPath(urlImage)
      /* v8 ignore next 1 -- missing só contém paths com relativePath válido */
      if (!relativePath) return false
      return !(await bridge.media.check('covers', relativePath))
    })
    if (!stillMissing.some(Boolean)) {
      await writeCatalogRecord(WORKSPACE_RECORD_KEYS.coversSynced, { complete: true })
    }

    onProgress?.(100)
    return { total: allImages.length, missing: missing.length, downloaded }
  } catch (error) {
    console.warn('[starting] sync de capas interrompida', error)
    return empty
  } finally {
    isRunning = false
  }
}

/**
 * Após o warm boot, completa capas ausentes em background (não bloqueia a UI).
 * Sempre faz verificação rápida no disco e baixa só o que faltar.
 */
export async function startCoverBackgroundSync(): Promise<void> {
  await ensureAlbumCovers({ skipIfSynced: false })
}
