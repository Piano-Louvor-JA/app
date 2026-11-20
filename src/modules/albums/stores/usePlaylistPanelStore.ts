import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Estado da janela durante a sessão, preservado ao visitar o player completo. */
export const usePlaylistPanelStore = defineStore('playlist-panel', () => {
  const open = ref(false)
  const expandedPlaylistId = ref<string | null>(null)
  return { open, expandedPlaylistId }
})
