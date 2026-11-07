import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { AnnouncementFileKind, AnnouncementsFilesApi } from '@shared/types/desktop-bridge'

import type { Announcement, AnnouncementFile } from '../types/announcements'

export type PickRejected = { name: string; reason: 'unsupported_format' | 'not_found' | 'copy_failed' }

export type PickResult =
  | { ok: true; files: AnnouncementFile[]; rejected: PickRejected[] }
  | { ok: false; reason: string }

function api(): AnnouncementsFilesApi | null {
  return getDesktopBridge()?.announcements ?? null
}

/** Arquivos do aviso na ordem em que aparecem. */
export function announcementFiles(item: Announcement): AnnouncementFile[] {
  switch (item.kind) {
    case 'images':
      return item.files
    case 'video':
    case 'presentation':
      return item.file ? [item.file] : []
    default:
      return []
  }
}

/** Abre o diálogo e copia os arquivos escolhidos para a pasta do aviso. */
export async function pickAnnouncementFiles(avisoId: string, kind: AnnouncementFileKind): Promise<PickResult> {
  const files = api()
  if (!files) return { ok: false, reason: 'unavailable' }
  try {
    const result = await files.pickAndImport(avisoId, kind)
    if (!result.ok) return { ok: false, reason: result.reason ?? 'error' }
    return { ok: true, files: result.files ?? [], rejected: result.rejected ?? [] }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

/** Cópia do aviso com outro id e arquivos próprios. Null se a cópia dos arquivos falhar. */
export async function duplicateAnnouncementWithFiles(item: Announcement, newId: string): Promise<Announcement | null> {
  if (announcementFiles(item).length === 0) return { ...item, id: newId }

  const files = api()
  if (!files) return null
  let paths: Record<string, string>
  try {
    const result = await files.copyFolder(item.id, newId)
    if (!result.ok) return null
    paths = result.paths ?? {}
  } catch {
    return null
  }

  const remap = (file: AnnouncementFile): AnnouncementFile => ({
    ...file,
    relativePath: paths[file.relativePath] ?? file.relativePath.replace(`/${item.id}/`, `/${newId}/`),
  })
  switch (item.kind) {
    case 'images':
      return { ...item, id: newId, files: item.files.map(remap) }
    case 'video':
    case 'presentation':
      return { ...item, id: newId, file: item.file ? remap(item.file) : null }
    default:
      return { ...item, id: newId }
  }
}

/** Aviso excluído: apaga a pasta dele. Erro aqui não impede a exclusão. */
export async function removeAnnouncementFolder(item: Announcement): Promise<void> {
  if (item.kind === 'text' || item.kind === 'url') return
  try {
    await api()?.removeFolder(item.id)
  } catch {
    // pasta órfã não quebra nada; some na próxima limpeza
  }
}

/** Imagem removida, vídeo trocado: apaga só esses arquivos. */
export async function removeAnnouncementFiles(relativePaths: string[]): Promise<void> {
  if (relativePaths.length === 0) return
  try {
    await api()?.removeFiles(relativePaths)
  } catch {
    // idem
  }
}

/** Caminhos absolutos para os players e nomes dos arquivos que sumiram. */
export async function resolveAnnouncementFiles(
  item: Announcement,
): Promise<{ absolutePaths: string[]; missing: string[] }> {
  const files = announcementFiles(item)
  const bridge = api()
  if (!bridge) return { absolutePaths: [], missing: files.map((f) => f.name) }

  const resolved = await bridge.resolvePaths(files.map((f) => f.relativePath))
  const absolutePaths: string[] = []
  const missing: string[] = []
  files.forEach((file, index) => {
    const entry = resolved[index]
    if (entry?.exists && entry.absolutePath) absolutePaths.push(entry.absolutePath)
    else missing.push(file.name)
  })
  return { absolutePaths, missing }
}
