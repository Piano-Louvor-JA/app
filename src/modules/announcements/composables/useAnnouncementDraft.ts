import { computed, ref } from 'vue'

function cloneAnnouncement(item: Announcement): Announcement {
  return JSON.parse(JSON.stringify(item)) as Announcement
}

import { parseLiturgyWebTarget } from '@modules/liturgy/services/liturgy-web-runtime'
import { notesHtmlToPlainText, sanitizeNotesHtml } from '@modules/liturgy/services/rich-notes'

import {
  pickAnnouncementFiles,
  removeAnnouncementFiles,
  removeAnnouncementFolder,
  type PickRejected,
} from '../services/announcements-files'
import type { Announcement, AnnouncementFile } from '../types/announcements'

export type DraftPickOutcome =
  | { ok: true; rejected: PickRejected[] }
  | { ok: false; reason: string }

/**
 * Rascunho do diálogo de aviso. Os arquivos são copiados na hora em que o
 * operador escolhe; por isso o rascunho anota o que entrou e o que saiu para:
 * - Salvar: apagar do disco o que foi removido do aviso;
 * - Cancelar: apagar o que entrou nesta edição (ou a pasta toda, se o aviso é novo).
 */
export function useAnnouncementDraft(initial: Announcement, isNew: boolean) {
  const draft = ref<Announcement>(cloneAnnouncement(initial))
  const busy = ref(false)
  /** Copiados nesta edição. */
  const added = new Set<string>()
  /** Já existiam e saíram do aviso nesta edição. */
  const removed = new Set<string>()

  function dropFile(file: AnnouncementFile) {
    if (added.has(file.relativePath)) added.delete(file.relativePath)
    else removed.add(file.relativePath)
  }

  /** Os arquivos copiados nesta edição que já saíram do rascunho são apagados na hora. */
  async function discardIfAdded(file: AnnouncementFile) {
    if (!added.has(file.relativePath)) {
      removed.add(file.relativePath)
      return
    }
    added.delete(file.relativePath)
    await removeAnnouncementFiles([file.relativePath])
  }

  async function pickFiles(): Promise<DraftPickOutcome> {
    const current = draft.value
    if (current.kind === 'text' || current.kind === 'url') return { ok: false, reason: 'invalid_kind' }
    busy.value = true
    try {
      const result = await pickAnnouncementFiles(current.id, current.kind)
      if (!result.ok) return result
      for (const file of result.files) added.add(file.relativePath)
      if (current.kind === 'images') {
        current.files = [...current.files, ...result.files]
      } else if (result.files.length > 0) {
        const previous = current.file
        current.file = result.files[0]!
        if (previous) await discardIfAdded(previous)
      }
      return { ok: true, rejected: result.rejected }
    } finally {
      busy.value = false
    }
  }

  function removeImage(index: number) {
    const current = draft.value
    if (current.kind !== 'images' || !current.files[index]) return
    dropFile(current.files[index]!)
    current.files = current.files.filter((_, i) => i !== index)
  }

  function moveImage(from: number, to: number) {
    const current = draft.value
    if (current.kind !== 'images') return
    if (from < 0 || to < 0 || from >= current.files.length || to >= current.files.length || from === to) return
    const files = [...current.files]
    const [moved] = files.splice(from, 1)
    files.splice(to, 0, moved!)
    current.files = files
  }

  function setText(html: string) {
    if (draft.value.kind !== 'text') return
    draft.value.html = html
  }

  const isValid = computed(() => {
    const current = draft.value
    switch (current.kind) {
      case 'text':
        return Boolean(current.title.trim() || notesHtmlToPlainText(sanitizeNotesHtml(current.html)))
      case 'images':
        return current.files.length > 0
      case 'url':
        return parseLiturgyWebTarget(current.url) !== null
      default:
        return current.file !== null
    }
  })

  /** Aviso pronto para gravar (texto limpo) e apaga do disco o que saiu. */
  async function commit(): Promise<Announcement> {
    const current = cloneAnnouncement(draft.value)
    current.title = current.title.trim()
    if (current.kind === 'text') {
      current.html = sanitizeNotesHtml(current.html)
      current.plainText = current.html ? notesHtmlToPlainText(current.html) : ''
    }
    if (current.kind === 'url') current.url = current.url.trim()
    await removeAnnouncementFiles([...removed])
    added.clear()
    removed.clear()
    return current
  }

  /** Desfaz as cópias desta edição. */
  async function discard(): Promise<void> {
    if (isNew) await removeAnnouncementFolder(draft.value)
    else await removeAnnouncementFiles([...added])
    added.clear()
    removed.clear()
  }

  return { draft, busy, isValid, pickFiles, removeImage, moveImage, setText, commit, discard }
}
