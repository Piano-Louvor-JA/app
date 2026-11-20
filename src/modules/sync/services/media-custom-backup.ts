import { loadLocalDb, replaceLocalDb, type LocalDb } from '@modules/media/services/local-custom-store'

export const MEDIA_CUSTOM_BACKUP_KEY = 'louvorja.media-custom-backup.v1'

/** Backup local completo, incluindo áudio. Falha de quota impede a substituição. */
export function backupMediaCustomCatalog(): void {
  const raw = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), db: loadLocalDb() })
  localStorage.setItem(MEDIA_CUSTOM_BACKUP_KEY, raw)
  if (localStorage.getItem(MEDIA_CUSTOM_BACKUP_KEY) !== raw) {
    throw new Error('MEDIA_CUSTOM_BACKUP_FAILED')
  }
}

export function hasMediaCustomCatalogBackup(): boolean {
  return localStorage.getItem(MEDIA_CUSTOM_BACKUP_KEY) != null
}

export function restoreMediaCustomCatalogBackup(): boolean {
  const raw = localStorage.getItem(MEDIA_CUSTOM_BACKUP_KEY)
  if (raw == null) return false
  const backup = JSON.parse(raw) as { version: number; db: LocalDb }
  if (backup.version !== 1 || !Array.isArray(backup.db?.collections) || !Array.isArray(backup.db?.musics)) return false
  return replaceLocalDb(backup.db)
}
