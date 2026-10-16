import hymnalCover from '@assets/library/hymnal.jpeg'
import hymnal1996Cover from '@assets/library/hymnal_1996.jpeg'
/** Capa do hinário por idioma. ES aguarda asset próprio (hymnal_es.jpeg) —
 *  enquanto não existe, cai na capa PT (histeresis visual, não erro). */
const hymnalCovers: Record<string, string> = {
  pt: hymnalCover,
}

import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'
import {
  listCustomCollections,
  customFileUrl,
  toCustomCollectionId,
} from '@modules/media/services/custom-catalog'
import { resolveCoverUrlsFromDisk, resolveRemoteFileUrl } from '@modules/sync/services/media-paths'

import type { AlbumCategory, AlbumCollection } from '../types/albums'

/** Coletâneas excluídas do catálogo (mesmo critério da biblioteca). */
const EXCLUDED_ALBUM_IDS = new Set([712, 629])

type CatalogCategoryAlbum = {
  id_album: number | string
  name?: string
  subtitle?: string
  url_image?: string | null
}

type CatalogCategory = {
  id_category?: number | string
  name?: string
  /** Slug estável entre idiomas (aym, kids, ...) — chave de ordenação. */
  slug?: string
  albums?: CatalogCategoryAlbum[]
}

type CatalogHymnalEntry = {
  id_music?: number | string
}

async function readOrFetchCatalog<T>(filename: string): Promise<T | null> {
  const local = await readCatalogRecord<T>(filename)
  if (local != null) return local

  try {
    return await fetchRemoteCatalogJson<T>(filename)
  } catch (error) {
    console.warn(`[albums] falha ao obter catálogo ${filename}`, error)
    return null
  }
}

/** Coletâneas por álbum: mais recente primeiro (id_album DESC — 2026 → 1996). */
export function sortCollectionsRecentFirst(
  collections: AlbumCollection[],
): AlbumCollection[] {
  return [...collections].sort((a, b) => {
    const idA = Number(a.id)
    const idB = Number(b.id)
    const numA = Number.isFinite(idA) ? idA : null
    const numB = Number.isFinite(idB) ? idB : null
    // Ids não numéricos (custom) caem no fim, alfabético entre si.
    if (numA == null && numB == null) return a.name.localeCompare(b.name)
    if (numA == null) return 1
    if (numB == null) return -1
    return numB - numA
  })
}

async function buildHymnalCollections(): Promise<AlbumCollection[]> {
  const collections: AlbumCollection[] = []
  const langPrefix = getCurrentApiPrefix()

  const hymnal = await readOrFetchCatalog<CatalogHymnalEntry[]>(`${langPrefix}_hymnal`)
  if (Array.isArray(hymnal) && hymnal.length > 0) {
    collections.push({
      id: 'hymnal',
      kind: 'hymnal',
      name: 'Hinário Adventista',
      subtitle: '',
      coverUrl: hymnalCovers[langPrefix] ?? hymnalCover,
      trackCount: hymnal.length,
      catalogKey: `${langPrefix}_hymnal`,
    })
  }

  const hymnal1996 = await readOrFetchCatalog<CatalogHymnalEntry[]>(`${langPrefix}_hymnal_1996`)
  if (Array.isArray(hymnal1996) && hymnal1996.length > 0) {
    collections.push({
      id: 'hymnal_1996',
      kind: 'hymnal',
      name: 'Hinário Adventista - Edição 1996',
      subtitle: '',
      coverUrl: hymnal1996Cover,
      trackCount: hymnal1996.length,
      catalogKey: `${langPrefix}_hymnal_1996`,
    })
  }

  return collections
}

/** Catálogo de hinários e coletâneas para navegação no módulo Álbuns. */
/** Minhas Coletâneas custom no formato AlbumCollection (mesma estética dos álbuns). */
async function buildCustomCollectionCards(): Promise<AlbumCollection[]> {
  try {
    const customs = await listCustomCollections()
    return customs.map((c) => ({
      id: toCustomCollectionId(c.id),
      kind: 'album' as const,
      name: c.name,
      subtitle: c.description ?? '',
      coverUrl: c.coverUrl ? customFileUrl(c.coverUrl) : null,
      trackCount: c.musicsCount,
      catalogKey: `custom_collection_${c.id}`,
      isCustom: true,
    }))
  } catch {
    return []
  }
}

/** Catálogo oficial (hinários + categorias) — capas resolvidas do disco em 1 IPC. */
export async function loadAlbumCategories(): Promise<AlbumCategory[]> {
  const result: AlbumCategory[] = []
  const langPrefix = getCurrentApiPrefix()

  const [hymnals, categories] = await Promise.all([
    buildHymnalCollections(),
    readOrFetchCatalog<CatalogCategory[]>(`${langPrefix}_categories`),
  ])

  if (hymnals.length > 0) {
    result.push({
      id: 'hymnals',
      name: 'Hinários',
      collections: hymnals,
    })
  }

  if (!Array.isArray(categories)) return sortAlbumCategories(result)

  const rawCoverUrls: Array<string | null | undefined> = []
  for (const category of categories) {
    category.albums?.forEach((album) => {
      rawCoverUrls.push(album.url_image)
    })
  }
  const coverByRaw = await resolveCoverUrlsFromDisk(rawCoverUrls)

  for (const category of categories) {
    if (!category.albums?.length) continue

    const collections: AlbumCollection[] = []

    for (const album of category.albums) {
      const albumId = Number(album.id_album)
      if (!Number.isFinite(albumId) || EXCLUDED_ALBUM_IDS.has(albumId)) continue

      const name = String(album.name ?? '').trim()
      if (!name) continue

      const rawCover = album.url_image ?? null
      collections.push({
        id: albumId,
        kind: 'album',
        name,
        subtitle: String(album.subtitle ?? '').trim(),
        coverUrl: rawCover
          ? (coverByRaw.get(rawCover) ?? resolveRemoteFileUrl(rawCover))
          : null,
        rawCoverUrl: rawCover,
        trackCount: null,
        catalogKey: `album_${albumId}`,
      })
    }

    if (collections.length > 0) {
      // Coletâneas por ano: mais recente primeiro (2026 → 2003/1996).
      result.push({
        id: category.id_category ?? category.name ?? collections[0]!.id,
        name: String(category.name ?? '').trim() || 'Coletâneas',
        slug: category.slug,
        collections: sortCollectionsRecentFirst(collections),
      })
    }
  }

  return sortAlbumCategories(result)
}

/** Minhas Coletâneas (API remota) — pode ser mesclado depois sem bloquear a lista. */
export async function loadCustomAlbumCategory(): Promise<AlbumCategory | null> {
  const customs = await buildCustomCollectionCards()
  if (customs.length === 0) return null
  return {
    id: 'custom',
    name: 'Minhas Coletâneas',
    collections: customs,
  }
}

function sortAlbumCategories(categories: AlbumCategory[]): AlbumCategory[] {
  // Ordem de exibição na Central — mesma hierarquia da biblioteca local:
  // hinários primeiro, CDs oficiais, Infantis/Doxologia logo após, demais coletâneas em seguida.
  const CATEGORY_ORDER: Record<string, number> = {
    custom: 0,
    'Minhas Coletâneas': 0,
    Hinários: 1,
    hymnals: 1,
    'CDs Oficiais/Ano': 2,
    aym: 2,
    'CDs Oficiales/año': 2,
    Infantis: 3,
    kids: 3,
    Doxologia: 4,
    doxology: 4,
    Adoradores: 10,
    worshipers: 10,
    Cantores: 11,
    singers: 11,
    'Celebra SP': 12,
    celebrate_sp: 12,
    Diversas: 13,
    misc: 13,
  }
  return [...categories].sort((a, b) => {
    const orderA =
      CATEGORY_ORDER[String(a.id)] ?? CATEGORY_ORDER[a.slug ?? ''] ?? CATEGORY_ORDER[a.name] ?? 50
    const orderB =
      CATEGORY_ORDER[String(b.id)] ?? CATEGORY_ORDER[b.slug ?? ''] ?? CATEGORY_ORDER[b.name] ?? 50
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name)
  })
}

export function findCollectionById(
  categories: AlbumCategory[],
  collectionId: string,
): AlbumCollection | null {
  for (const category of categories) {
    for (const collection of category.collections) {
      if (String(collection.id) === collectionId) return collection
    }
  }
  return null
}
