import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { appConfirm } from '@shared/composables/useAppConfirm'

import {
  duplicateAnnouncementWithFiles,
  removeAnnouncementFolder,
} from '../services/announcements-files'
import { newAnnouncementsId } from '../services/announcements-preferences'
import { useAnnouncementsStore } from '../stores/useAnnouncementsStore'
import type { Announcement, AnnouncementKind } from '../types/announcements'

export type AnnouncementsNotice = { key: string; params?: Record<string, unknown>; tone: 'info' | 'error' }

/** Aviso novo e vazio do tipo escolhido (ainda fora da lista). */
export function newAnnouncementDraft(kind: AnnouncementKind): Announcement {
  const id = newAnnouncementsId()
  switch (kind) {
    case 'text':
      return { id, kind, title: '', titleColor: '', html: '', plainText: '' }
    case 'images':
      return { id, kind, title: '', files: [] }
    case 'video':
      return { id, kind, title: '', file: null }
    case 'presentation':
      return { id, kind, title: '', file: null }
    case 'url':
      return { id, kind, title: '', url: '' }
  }
}

/** Ações da tela: store + arquivos + confirmações. */
export function useAnnouncements() {
  const { t } = useI18n()
  const store = useAnnouncementsStore()
  const { lists, activeList, activeListId, carousel } = storeToRefs(store)
  const notice = ref<AnnouncementsNotice | null>(null)

  function notify(key: string, tone: AnnouncementsNotice['tone'] = 'info', params?: Record<string, unknown>) {
    notice.value = { key, tone, params }
  }

  function clearNotice() {
    notice.value = null
  }

  function saveAnnouncement(item: Announcement): void {
    if (store.findAnnouncement(item.id)) store.updateAnnouncement(item)
    else store.addAnnouncement(item)
  }

  async function duplicateAnnouncement(id: string): Promise<void> {
    const source = store.findAnnouncement(id)
    if (!source) return
    const copy = await duplicateAnnouncementWithFiles(source, newAnnouncementsId())
    if (!copy) {
      notify('announcements.notices.duplicateFailed', 'error')
      return
    }
    store.insertAnnouncementAfter(id, { ...copy, title: copy.title ? `${copy.title} ${t('announcements.copySuffix')}` : copy.title })
  }

  async function confirmRemoveAnnouncement(id: string): Promise<void> {
    const item = store.findAnnouncement(id)
    if (!item) return
    const confirmed = await appConfirm({
      title: t('announcements.removeTitle'),
      message: t('announcements.removeConfirm', { name: item.title || t(`announcements.kinds.${item.kind}`) }),
      confirmLabel: t('announcements.remove'),
      danger: true,
    })
    if (!confirmed) return
    const removed = store.removeAnnouncement(id)
    if (removed) await removeAnnouncementFolder(removed)
  }

  /** Liga/desliga a participação do aviso (texto/imagens) no carrossel. */
  function setInCarousel(id: string, inCarousel: boolean): void {
    const item = store.findAnnouncement(id)
    if (!item || (item.kind !== 'text' && item.kind !== 'images')) return
    const next = { ...item }
    if (inCarousel) delete next.inCarousel
    else next.inCarousel = false
    store.updateAnnouncement(next)
  }

  function createList(name: string): void {
    store.createList(name)
  }

  function renameActiveList(name: string): void {
    store.renameList(store.activeListId, name)
  }

  /** Lista nova com cópia de cada aviso (e dos arquivos). Avisos que falharem ficam de fora e o operador é avisado. */
  async function duplicateActiveList(): Promise<void> {
    const source = store.activeList
    const targetId = store.duplicateListShell(source.id, `${source.name} ${t('announcements.copySuffix')}`)
    let failed = 0
    for (const item of source.items) {
      const copy = await duplicateAnnouncementWithFiles(item, newAnnouncementsId())
      if (copy) store.addAnnouncement(copy, targetId)
      else failed += 1
    }
    if (failed > 0) notify('announcements.notices.duplicateListPartial', 'error', { count: failed })
  }

  async function confirmRemoveActiveList(): Promise<void> {
    const list = store.activeList
    const confirmed = await appConfirm({
      title: t('announcements.lists.removeTitle'),
      message: t('announcements.lists.removeConfirm', { name: list.name, count: list.items.length }),
      confirmLabel: t('announcements.remove'),
      danger: true,
    })
    if (!confirmed) return
    const removed = store.removeList(list.id)
    for (const item of removed) await removeAnnouncementFolder(item)
  }

  return {
    lists,
    activeList,
    activeListId,
    carousel,
    notice,
    notify,
    clearNotice,
    setActiveList: store.setActiveList,
    moveAnnouncement: store.moveAnnouncement,
    setCarousel: store.setCarousel,
    saveAnnouncement,
    setInCarousel,
    duplicateAnnouncement,
    confirmRemoveAnnouncement,
    createList,
    renameActiveList,
    duplicateActiveList,
    confirmRemoveActiveList,
  }
}
