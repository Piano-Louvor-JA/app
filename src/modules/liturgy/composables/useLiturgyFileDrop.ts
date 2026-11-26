import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'

import { buildDraftFromDroppedPaths } from '../services/liturgy-file-detect'
import { probeMediaDurationMs } from '../services/media-probe'
import type { LiturgyItemDraft } from '../types/liturgy'

/**
 * Arrastar arquivos do SO para a liturgia: resolve o path no Electron,
 * detecta o tipo e abre o diálogo de item para confirmar categoria.
 */
export function useLiturgyFileDrop(deps: {
  openDroppedFilesDialog: (
    draft: LiturgyItemDraft,
    options?: { lockCategory?: boolean },
  ) => void
  setActionMessage: (key: string | null) => void
}) {
  const { t } = useI18n()
  const dropActive = ref(false)
  let dragDepth = 0

  function isFileDrag(event: DragEvent): boolean {
    const types = event.dataTransfer?.types
    if (!types) return false
    return Array.from(types).includes('Files')
  }

  function onDragEnter(event: DragEvent) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth += 1
    dropActive.value = true
  }

  function onDragOver(event: DragEvent) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    dropActive.value = true
  }

  function onDragLeave(event: DragEvent) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) dropActive.value = false
  }

  async function resolvePaths(files: FileList | File[]): Promise<string[]> {
    const list = Array.from(files)
    if (list.length === 0) return []

    if (!isDesktopApp()) {
      deps.setActionMessage('liturgy.messages.dropDesktopOnly')
      return []
    }

    const bridge = getDesktopBridge()
    const getPath = bridge?.dialog?.getPathForFile
    if (!getPath) {
      deps.setActionMessage('liturgy.messages.dropDesktopOnly')
      return []
    }

    const paths: string[] = []
    for (const file of list) {
      try {
        const path = getPath(file)?.trim()
        if (path) paths.push(path)
      } catch {
        // arquivo sem path (ex.: download virtual) — ignora
      }
    }
    if (paths.length === 0) {
      deps.setActionMessage('liturgy.messages.dropPathFailed')
    }
    return paths
  }

  async function openFromPaths(paths: string[], categoryId?: string | null) {
    const built = buildDraftFromDroppedPaths(paths, {
      categoryId: categoryId ?? null,
      imagesLabel: (count) => t('liturgy.fields.filesSelected', { count }),
    })
    if (!built) return

    const draft = { ...built.draft }
    if (
      (draft.type === 'audio' || draft.type === 'video') &&
      draft.filePath.trim()
    ) {
      const probed = await probeMediaDurationMs(draft.filePath)
      if (probed > 0) draft.durationMs = probed
    }

    deps.openDroppedFilesDialog(draft, {
      lockCategory: Boolean(categoryId),
    })
    if (built.remainingPaths.length > 0) {
      deps.setActionMessage('liturgy.messages.dropMoreFilesPending')
    }
  }

  async function onDrop(event: DragEvent, categoryId?: string | null) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepth = 0
    dropActive.value = false

    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return
    const paths = await resolvePaths(files)
    if (paths.length === 0) return
    await openFromPaths(paths, categoryId)
  }

  function resetDrop() {
    dragDepth = 0
    dropActive.value = false
  }

  return {
    dropActive,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    resetDrop,
  }
}
