import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import i18n from '@plugins/i18n'

import {
  emptyAnnouncementList,
  loadAnnouncementsState,
  normalizeAnnouncementsState,
  saveAnnouncementsState,
} from '../services/announcements-preferences'
import type {
  Announcement,
  AnnouncementList,
  AnnouncementsState,
  CarouselConfig,
} from '../types/announcements'

export const ANNOUNCEMENTS_ROUTE = 'utilities-announcements'

function defaultListName(): string {
  return i18n.global.t('announcements.defaultListName')
}

function cleanName(name: string): string {
  return name.trim() || defaultListName()
}

/** Listas de avisos do operador. Arquivos ficam por conta de quem chama (ver `announcements-files`). */
export const useAnnouncementsStore = defineStore('announcements', () => {
  const state = ref<AnnouncementsState>(loadAnnouncementsState(defaultListName()))

  const lists = computed(() => state.value.lists)
  const activeListId = computed(() => state.value.activeListId)
  const activeList = computed<AnnouncementList>(
    () => state.value.lists.find((l) => l.id === state.value.activeListId) ?? state.value.lists[0]!,
  )
  const carousel = computed(() => state.value.carousel)

  /** Normaliza (garante lista ativa válida) e grava. */
  function commit(next: Omit<AnnouncementsState, 'version'>): void {
    state.value = normalizeAnnouncementsState({ ...next, version: 1 }, defaultListName())
    saveAnnouncementsState(state.value)
  }

  function listById(listId: string): AnnouncementList | undefined {
    return state.value.lists.find((l) => l.id === listId)
  }

  function mapList(listId: string, fn: (items: Announcement[]) => Announcement[]): void {
    commit({
      ...state.value,
      lists: state.value.lists.map((l) => (l.id === listId ? { ...l, items: fn(l.items) } : l)),
    })
  }

  function setActiveList(listId: string): void {
    if (!listById(listId) || listId === state.value.activeListId) return
    commit({ ...state.value, activeListId: listId })
  }

  function createList(name: string): string {
    const list = emptyAnnouncementList(cleanName(name))
    commit({ ...state.value, lists: [...state.value.lists, list], activeListId: list.id })
    return list.id
  }

  function renameList(listId: string, name: string): void {
    commit({
      ...state.value,
      lists: state.value.lists.map((l) => (l.id === listId ? { ...l, name: cleanName(name) } : l)),
    })
  }

  /** Lista nova e vazia logo após a original; quem chama copia os avisos (com arquivos). */
  function duplicateListShell(sourceListId: string, name: string): string {
    const list = emptyAnnouncementList(cleanName(name))
    const index = state.value.lists.findIndex((l) => l.id === sourceListId)
    const next = [...state.value.lists]
    next.splice(index < 0 ? next.length : index + 1, 0, list)
    commit({ ...state.value, lists: next, activeListId: list.id })
    return list.id
  }

  /** Exclui a lista e devolve os avisos dela (para apagar os arquivos). */
  function removeList(listId: string): Announcement[] {
    const index = state.value.lists.findIndex((l) => l.id === listId)
    if (index < 0) return []
    const removed = state.value.lists[index]!.items
    const remaining = state.value.lists.filter((l) => l.id !== listId)
    let activeId = state.value.activeListId
    if (activeId === listId) activeId = remaining[Math.max(0, index - 1)]?.id ?? ''
    commit({ ...state.value, lists: remaining, activeListId: activeId })
    return removed
  }

  function addAnnouncement(item: Announcement, listId = state.value.activeListId): void {
    mapList(listId, (items) => [...items, item])
  }

  function insertAnnouncementAfter(afterId: string, item: Announcement): void {
    mapList(state.value.activeListId, (items) => {
      const index = items.findIndex((a) => a.id === afterId)
      const next = [...items]
      next.splice(index < 0 ? next.length : index + 1, 0, item)
      return next
    })
  }

  function findAnnouncement(id: string): Announcement | null {
    for (const list of state.value.lists) {
      const found = list.items.find((a) => a.id === id)
      if (found) return found
    }
    return null
  }

  function updateAnnouncement(item: Announcement): void {
    commit({
      ...state.value,
      lists: state.value.lists.map((l) => ({
        ...l,
        items: l.items.map((a) => (a.id === item.id ? item : a)),
      })),
    })
  }

  /** Remove de qualquer lista e devolve o aviso removido (para apagar os arquivos). */
  function removeAnnouncement(id: string): Announcement | null {
    const found = findAnnouncement(id)
    if (!found) return null
    commit({
      ...state.value,
      lists: state.value.lists.map((l) => ({ ...l, items: l.items.filter((a) => a.id !== id) })),
    })
    return found
  }

  function moveAnnouncement(from: number, to: number): void {
    const items = activeList.value.items
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return
    mapList(state.value.activeListId, (current) => {
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      return next
    })
  }

  function setCarousel(patch: Partial<CarouselConfig>): void {
    commit({ ...state.value, carousel: { ...state.value.carousel, ...patch } })
  }

  return {
    lists,
    activeListId,
    activeList,
    carousel,
    setActiveList,
    createList,
    renameList,
    duplicateListShell,
    removeList,
    addAnnouncement,
    insertAnnouncementAfter,
    findAnnouncement,
    updateAnnouncement,
    removeAnnouncement,
    moveAnnouncement,
    setCarousel,
  }
})
