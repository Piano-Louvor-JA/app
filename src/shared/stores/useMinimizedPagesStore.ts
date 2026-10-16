import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  addMinimized,
  removeMinimized,
  type MinimizedPage,
} from '@shared/services/minimized-pages'
import {
  loadMinimizedPages,
  saveMinimizedPages,
} from '@shared/services/minimized-pages-storage'

/**
 * Páginas minimizadas (barra acima do dock). Começa com o que estava salvo
 * na sessão e salva a cada mudança. Ao reabrir, o item sai da barra e o
 * retrato fica pendente até a página pegá-lo (`takeRestore`) ao montar.
 */
export const useMinimizedPagesStore = defineStore('minimized-pages', () => {
  const items = ref<MinimizedPage[]>(loadMinimizedPages())
  const pendingRestore = ref<MinimizedPage | null>(null)

  const hasItems = computed(() => items.value.length > 0)

  function setItems(next: MinimizedPage[]) {
    items.value = next
    saveMinimizedPages(next)
  }

  function minimize(page: MinimizedPage) {
    setItems(addMinimized(items.value, page))
  }

  function close(fullPath: string) {
    setItems(removeMinimized(items.value, fullPath))
  }

  function reopen(fullPath: string): MinimizedPage | null {
    const page = items.value.find((item) => item.fullPath === fullPath) ?? null
    if (!page) return null
    pendingRestore.value = page
    setItems(removeMinimized(items.value, fullPath))
    return page
  }

  /** Entrega o retrato pendente se for desta página (só uma vez). */
  function takeRestore(fullPath: string): MinimizedPage | null {
    const page = pendingRestore.value
    if (page?.fullPath !== fullPath) return null
    pendingRestore.value = null
    return page
  }

  return { items, hasItems, minimize, close, reopen, takeRestore }
})
