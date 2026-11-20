import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

import { fetchOnlineVideoInfo, fetchSiteLinkInfo } from '@modules/liturgy/services/link-info'
import { parseLiturgyWebTarget } from '@modules/liturgy/services/liturgy-web-runtime'
import { getDesktopBridge } from '@shared/services/desktop-bridge'

import type { Announcement } from '../types/announcements'

export const URL_TITLE_DEBOUNCE_MS = 400

/**
 * Aviso de URL: ao colar o link, busca o título do vídeo (YouTube/Vimeo) ou
 * da página (só no desktop) e preenche o título. Título digitado pelo
 * operador nunca é trocado: só preenche quando está vazio ou ainda é o
 * que o próprio preenchimento colocou (trocar o link troca o título).
 */
export function useUrlTitleAutofill(draft: Ref<Announcement>) {
  const loading = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let run = 0
  let autoTitle = ''

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
    run += 1
    loading.value = false
  }

  function canFill(): boolean {
    const title = draft.value.title.trim()
    return !title || title === autoTitle
  }

  async function load(url: string) {
    timer = null
    const current = ++run
    const target = parseLiturgyWebTarget(url)
    const bridge = getDesktopBridge()
    const isVideo = target?.kind === 'youtube' || target?.kind === 'vimeo'
    if (!target || (!isVideo && !bridge?.siteInfo)) return
    loading.value = true
    const deps = { ytInfo: bridge?.ytInfo, siteInfo: bridge?.siteInfo }
    const info = isVideo ? await fetchOnlineVideoInfo(url, deps) : await fetchSiteLinkInfo(url, deps)
    if (current !== run) return
    loading.value = false
    const item = draft.value
    if (!info?.title || item.kind !== 'url' || item.url.trim() !== url || !canFill()) return
    item.title = info.title
    autoTitle = info.title
  }

  watch(
    () => (draft.value.kind === 'url' ? draft.value.url.trim() : ''),
    (url, previous) => {
      if (url === previous) return
      cancel()
      if (!url || !canFill()) return
      timer = setTimeout(() => void load(url), URL_TITLE_DEBOUNCE_MS)
    },
  )

  onBeforeUnmount(cancel)

  return { loading }
}
