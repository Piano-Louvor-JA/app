import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { InstalledFont } from '@shared/types/fonts'
import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'
import { loadFontPreferences, referencedFonts, restoreFonts, saveFontSelection } from '@shared/services/font-preferences'
import { loadLocalFont } from '@shared/services/font-loader'

export const useFontStore = defineStore('settings-fonts', () => {
  const preferences = ref(loadFontPreferences())
  const installed = ref<InstalledFont[]>([])
  const api = () => {
    const fonts = isDesktopApp() ? getDesktopBridge()?.fonts : undefined
    if (!fonts) throw new Error('font-desktop-only')
    return fonts
  }
  async function refresh() {
    preferences.value = loadFontPreferences()
    installed.value = await api().listInstalled()
  }
  async function prepare(id: string, jobId: string) {
    const manifest = await api().download(id, jobId)
    await loadLocalFont(id, manifest)
    await refresh()
  }
  function commit(scope: string, id: string | null) {
    saveFontSelection(scope, id)
    preferences.value = loadFontPreferences()
  }
  async function remove(id: string) {
    if (referencedFonts().includes(id)) throw new Error('font-in-use')
    await api().remove(id)
    await refresh()
  }
  function restore(stages: boolean) {
    restoreFonts(stages)
    preferences.value = loadFontPreferences()
  }
  return { preferences, installed, api, refresh, prepare, commit, remove, restore }
})
