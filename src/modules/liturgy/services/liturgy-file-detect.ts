import {
  DEFAULT_LITURGY_ITEM_DRAFT,
  getTypeDotColor,
  TYPES_WITHOUT_DURATION,
  type LiturgyItemDraft,
  type LiturgyItemType,
} from '../types/liturgy'

/**
 * Extensões aceitas no tipo "Apresentações PPT": PowerPoint e LibreOffice
 * (Impress `.odp` e Writer `.odt`, convertidos pelo LibreOffice).
 */
export const PRESENTATION_EXTENSIONS = ['pptx', 'ppt', 'ppsx', 'pps', 'odp', 'odt'] as const

const PRESENTATION_EXT_RE = new RegExp(`\\.(${PRESENTATION_EXTENSIONS.join('|')})$`, 'i')

/** True quando o caminho é de um arquivo aceito como apresentação. */
export function isPresentationPath(path: string): boolean {
  return PRESENTATION_EXT_RE.test(path.trim())
}

/**
 * True para documento de texto (.odt): o app externo abriria no editor,
 * sem modo apresentação; a projeção é feita pelo próprio app.
 */
export function isTextDocumentPath(path: string): boolean {
  return /\.odt$/i.test(path.trim())
}

/**
 * Infere o tipo de item da liturgia a partir do caminho/nome do arquivo
 * (áudio, vídeo, imagem, PDF, PPT e demais).
 */
export function detectLiturgyFileType(path: string): LiturgyItemType {
  const p = path.toLowerCase()
  if (!p) return 'other_files'
  if (/\.(mp3|wav|ogg|m4a|flac|aac|wma)$/.test(p)) return 'audio'
  if (/\.(mp4|mkv|avi|webm|mov|wmv)$/.test(p)) return 'video'
  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/.test(p)) return 'images'
  if (p.endsWith('.pdf')) return 'pdf'
  if (isPresentationPath(p)) return 'presentation'
  return 'other_files'
}

/**
 * Título a partir do arquivo: sem extensão e sem o código do YouTube que
 * vem no fim do nome dos vídeos baixados (`…_1eagQ-91i1c.mp4`).
 */
export function titleFromFilePath(path: string): string {
  const fileName = path.split(/[\\/]/).pop() ?? path
  const base = fileName.includes('.') ? fileName.replace(/\.[^.]+$/, '') : fileName
  return base.replace(/_[\w-]{11}$/, '').trim() || base
}

export type DroppedFilesDraft = {
  draft: LiturgyItemDraft
  /** Quantidade de arquivos usados no draft (imagens podem ser várias). */
  usedCount: number
  /** Arquivos além do primeiro item (ainda não abertos no diálogo). */
  remainingPaths: string[]
}

/**
 * Monta o draft do diálogo a partir dos arquivos soltos na liturgia.
 * Várias imagens viram um único item; outros tipos usam só o primeiro arquivo.
 */
export function buildDraftFromDroppedPaths(
  paths: string[],
  options?: { categoryId?: string | null; imagesLabel?: (count: number) => string },
): DroppedFilesDraft | null {
  const cleaned = paths.map((p) => p.trim()).filter(Boolean)
  if (cleaned.length === 0) return null

  const types = cleaned.map((path) => detectLiturgyFileType(path))
  const allImages = types.every((type) => type === 'images')
  const type = allImages ? 'images' : types[0]!
  const usedPaths = allImages ? cleaned : [cleaned[0]!]
  const remainingPaths = allImages ? [] : cleaned.slice(1)

  const name =
    allImages && usedPaths.length > 1
      ? (options?.imagesLabel?.(usedPaths.length) ?? `${usedPaths.length} imagens`)
      : titleFromFilePath(usedPaths[0]!)

  const draft: LiturgyItemDraft = {
    ...DEFAULT_LITURGY_ITEM_DRAFT,
    type,
    accentColor: getTypeDotColor(type),
    categoryId: options?.categoryId ?? null,
    name,
    filePath: usedPaths[0]!,
    filePaths: type === 'images' ? [...usedPaths] : [],
    durationMs: TYPES_WITHOUT_DURATION.includes(type) ? 0 : DEFAULT_LITURGY_ITEM_DRAFT.durationMs,
  }

  return { draft, usedCount: usedPaths.length, remainingPaths }
}
