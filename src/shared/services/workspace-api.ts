import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { defaultDatabaseBase, defaultFilesBase } from './api-env'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'
import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'

function sessionCacheKey(filename: string): string {
  return `${BROWSER_STORAGE_KEYS.catalogSessionPrefix}${filename}`
}

export async function readCatalogRecord<T = unknown>(filename: string): Promise<T | null> {
  const cached = getBrowserItem<T>(sessionCacheKey(filename), null, 'session')
  if (cached != null) return cached

  const bridge = getDesktopBridge()
  if (!bridge) return null

  const data = await bridge.workspace.getRecord<T>(filename)
  if (data != null) {
    setBrowserItem(sessionCacheKey(filename), data, 'session')
  }
  return data
}

export async function writeCatalogRecord(filename: string, data: unknown): Promise<boolean> {
  const bridge = getDesktopBridge()
  if (!bridge) return false

  const saved = await bridge.workspace.saveRecord(filename, data)
  if (saved) {
    setBrowserItem(sessionCacheKey(filename), data, 'session')
  }
  return saved
}

export async function clearWorkspace(
  options?: { preserveMedia?: boolean },
): Promise<boolean> {
  const bridge = getDesktopBridge()
  if (!bridge) return false
  return bridge.workspace.clear(options)
}

export function resolveMediaUrl(relativePath: string): string {
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath

  if (isDesktopApp()) {
    return `local://media/${cleanPath}`
  }

  const base =
    import.meta.env.VITE_URL_FILES ?? defaultFilesBase()
  return `${base}/${cleanPath}`
}

export function resolveDatabaseUrl(relativePath: string): string {
  // Default da nossa API — .env é gitignored e o CI não injeta VITE_*:
  // sem default aqui a build de release fica sem catálogo (hotfix 14/09).
  const base =
    import.meta.env.VITE_URL_DATABASE ?? defaultDatabaseBase()
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `${normalizedBase}${path}`
}

/**
 * SPEC piano-bundle-sync ADR-01: estado de sync por artifact
 * (`catalog` | `bible`), persistido no workspace via bridge.
 */
export type BundleSyncArtifact = 'catalog' | 'bible'

export type BundleSyncState = {
  md5: string
  checkedAtEpochMs: number
  appliedAtEpochMs: number
  schema: 1
}

const BUNDLE_STATE_KEY = 'bundleSync.state.v1'

type BundleStateFile = Partial<Record<BundleSyncArtifact, BundleSyncState>>

export async function readBundleSyncState(
  artifact: BundleSyncArtifact,
): Promise<BundleSyncState | null> {
  const file = await readCatalogRecord<BundleStateFile>(BUNDLE_STATE_KEY)
  return file?.[artifact] ?? null
}

export async function writeBundleSyncState(
  artifact: BundleSyncArtifact,
  state: BundleSyncState | null,
): Promise<void> {
  const file =
    (await readCatalogRecord<BundleStateFile>(BUNDLE_STATE_KEY)) ?? {}
  if (state == null) {
    delete file[artifact]
  } else {
    file[artifact] = state
  }
  await writeCatalogRecord(BUNDLE_STATE_KEY, file)
}
