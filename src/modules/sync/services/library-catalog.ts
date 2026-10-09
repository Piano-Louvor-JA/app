import hymnalCover from '@assets/library/hymnal.jpeg'
import hymnal1996Cover from '@assets/library/hymnal_1996.jpeg'
import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'
import {
  readCatalogRecord,
  writeCatalogRecord,
} from '@shared/services/workspace-api'
import { localeToApiPrefix } from '@plugins/i18n'

import type {
  CatalogCategory,
  CatalogHymnalEntry,
  LibraryAlbum,
  LibraryCategory,
} from '../types/library'
import { resolveCoverUrlsFromDisk, resolveRemoteFileUrl } from './media-paths'

/** Coletâneas excluídas do catálogo (legado). */
const EXCLUDED_ALBUM_IDS = new Set([712, 629])

const CATEGORY_ORDER: Record<string, number> = {
  hymnals: 1,
  Hinários: 1,
  'CDs Oficiais/Ano': 2,
  Infantis: 3,
  Doxologia: 4,
}

/**
 * Detecta o prefixo de idioma atual com base na preferência do usuário.
 * Retorna `pt`, `en` ou `es` — usado para montar os nomes dos records da API
 * (`pt_hymnal`, `en_hymnal`, `es_hymnal`, etc.).
 *
 * @param customLocale - Override para testes. Se omitido, usa o locale do i18n.
 */
export function getCurrentApiPrefix(customLocale?: string): string {
  if (customLocale) return localeToApiPrefix(customLocale)
  try {
    const stored = localStorage.getItem('user_data')
    if (stored) {
      const prefs = JSON.parse(stored)
      if (typeof prefs.language === 'string') {
        return localeToApiPrefix(prefs.language)
      }
    }
  } catch {
    // localStorage indisponível (SSR/test) — fallback pt
  }
  return 'pt'
}

/**
 * Atualiza coverUrl para local:// quando a capa já está no disco.
 * Preferir resolveCoverUrlsFromDisk na carga — este hydrate é residual.
 */
export async function hydrateLocalLibraryCoverUrls(
  categories: LibraryCategory[],
): Promise<void> {
  const rawUrls = categories.flatMap((category) =>
    category.albums.map((album) => album.rawCoverUrl),
  )
  const coverByRaw = await resolveCoverUrlsFromDisk(rawUrls)

  for (const category of categories) {
    for (const album of category.albums) {
      if (!album.rawCoverUrl) continue
      const resolved = coverByRaw.get(album.rawCoverUrl)
      if (resolved) album.coverUrl = resolved
    }
  }
}

function createAlbumBase(
  partial: Omit<
    LibraryAlbum,
    | 'progress'
    | 'progressText'
    | 'totalCount'
    | 'downloadedCount'
    | 'cancelRequested'
    | 'songCount'
  > & { songCount?: number | null },
): LibraryAlbum {
  return {
    songCount: null,
    ...partial,
    progress: 0,
    progressText: '',
    totalCount: 0,
    downloadedCount: 0,
    cancelRequested: false,
  }
}

export function sortCategories(categories: LibraryCategory[]): LibraryCategory[] {
  return [...categories].sort((a, b) => {
    const orderA = CATEGORY_ORDER[String(a.id)] ?? CATEGORY_ORDER[a.name] ?? 50
    const orderB = CATEGORY_ORDER[String(b.id)] ?? CATEGORY_ORDER[b.name] ?? 50
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name)
  })
}

async function buildHymnalCategory(
  downloadedIds: Array<string | number>,
  langPrefix: string,
): Promise<LibraryCategory | null> {
  const albums: LibraryAlbum[] = []

  const hymnal = await readCatalogRecord<CatalogHymnalEntry[]>(`${langPrefix}_hymnal`)
  if (hymnal && Array.isArray(hymnal) && hymnal.length > 0) {
    albums.push(
      createAlbumBase({
        id: 'hymnal',
        name: 'Hinário Adventista',
        subtitle: '',
        coverUrl: hymnalCover,
        rawCoverUrl: null,
        status: downloadedIds.includes('hymnal') ? 'downloaded' : 'idle',
        isHymnal: true,
        songCount: hymnal.length,
      }),
    )
  }

  const hymnal1996 = await readCatalogRecord<CatalogHymnalEntry[]>(`${langPrefix}_hymnal_1996`)
  if (hymnal1996 && Array.isArray(hymnal1996) && hymnal1996.length > 0) {
    albums.push(
      createAlbumBase({
        id: 'hymnal_1996',
        name: 'Hinário Adventista - Edição 1996',
        subtitle: '',
        coverUrl: hymnal1996Cover,
        rawCoverUrl: null,
        status: downloadedIds.includes('hymnal_1996') ? 'downloaded' : 'idle',
        isHymnal: true,
        songCount: hymnal1996.length,
      }),
    )
  }

  if (albums.length === 0) return null

  return {
    id: 'hymnals',
    name: 'Hinários',
    albums,
  }
}

/**
 * Monta a lista de categorias/coletâneas disponíveis para download offline.
 * O conteúdo é filtrado pelo idioma selecionado pelo usuário (pt/en/es).
 */
export async function loadLibraryCategories(): Promise<LibraryCategory[]> {
  const langPrefix = getCurrentApiPrefix()

  const categories = await readCatalogRecord<CatalogCategory[]>(`${langPrefix}_categories`)
  const downloaded =
    (await readCatalogRecord<Array<string | number>>(
      WORKSPACE_RECORD_KEYS.downloadedAlbums,
    )) ?? []

  const result: LibraryCategory[] = []

  const hymnals = await buildHymnalCategory(downloaded, langPrefix)
  if (hymnals) result.push(hymnals)

  if (!categories || !Array.isArray(categories)) {
    return sortCategories(result)
  }

  const rawCoverUrls = categories.flatMap(
    (category) => category.albums?.map((album) => album.url_image) ?? [],
  )
  const coverByRaw = await resolveCoverUrlsFromDisk(rawCoverUrls)

  for (const category of categories) {
    if (!category.albums?.length) continue

    const albums: LibraryAlbum[] = []

    for (const album of category.albums) {
      if (EXCLUDED_ALBUM_IDS.has(album.id_album)) continue

      const rawCover = album.url_image ?? null
      albums.push(
        createAlbumBase({
          id: album.id_album,
          name: album.name,
          subtitle: album.subtitle ?? '',
          coverUrl: rawCover
            ? (coverByRaw.get(rawCover) ?? resolveRemoteFileUrl(rawCover))
            : null,
          rawCoverUrl: rawCover,
          status: downloaded.includes(album.id_album) ? 'downloaded' : 'idle',
          isHymnal: false,
        }),
      )
    }

    if (albums.length > 0) {
      result.push({
        id: category.id_category,
        name: category.name,
        albums,
      })
    }
  }

  return sortCategories(result)
}

export async function readDownloadedAlbumIds(): Promise<Array<string | number>> {
  return (
    (await readCatalogRecord<Array<string | number>>(
      WORKSPACE_RECORD_KEYS.downloadedAlbums,
    )) ?? []
  )
}

export async function writeDownloadedAlbumIds(
  ids: Array<string | number>,
): Promise<boolean> {
  return writeCatalogRecord(WORKSPACE_RECORD_KEYS.downloadedAlbums, ids)
}
