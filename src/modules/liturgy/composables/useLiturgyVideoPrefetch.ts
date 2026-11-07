import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { OnlineVideoItemStatus } from '@/shared/types/desktop-bridge'

import { parseLiturgyWebTarget } from '../services/liturgy-web-runtime'
import { useLiturgyStore } from '../stores/useLiturgyStore'
import { LITURGY_WEEKDAYS, type LiturgyItem } from '../types/liturgy'

function youtubeIdOf(item: LiturgyItem): string | null {
  if (item.type !== 'online_video' || !item.url) return null
  const target = parseLiturgyWebTarget(item.url)
  return target?.kind === 'youtube' ? target.videoId : null
}

function uniqueIds(items: LiturgyItem[]): string[] {
  return [...new Set(items.map(youtubeIdOf).filter((id): id is string => Boolean(id)))]
}

/**
 * Cópia baixada dos vídeos do YouTube da liturgia: pede o download antecipado da liturgia
 * aberta (o main só baixa com a chave ligada), protege do limite do cache os vídeos de todas
 * as liturgias e cancela o download de um vídeo que saiu de todas elas.
 */
export function useLiturgyVideoPrefetch() {
  const api = window.louvorja?.isElectron ? window.louvorja.onlineVideo : undefined
  const store = useLiturgyStore()
  const statuses = ref<Record<string, OnlineVideoItemStatus>>({})

  const openIds = computed(() => uniqueIds(store.currentItems))
  const keptIds = computed(() =>
    uniqueIds([
      ...LITURGY_WEEKDAYS.flatMap((day) => store.weekdays[day]),
      ...store.customLiturgies.flatMap((custom) => custom.items),
    ]),
  )

  const statusByItemId = computed(() => {
    const out: Record<string, OnlineVideoItemStatus> = {}
    for (const item of store.currentItems) {
      const id = youtubeIdOf(item)
      const status = id ? statuses.value[id] : undefined
      if (status && status.state !== 'none') out[item.id] = status
    }
    return out
  })

  if (api) {
    const quiet = (error: unknown) => console.error('[online-video] liturgia', error)

    const prefetch = async (ids: string[]) => {
      if (ids.length === 0) return
      try {
        await api.prefetch(ids)
        statuses.value = { ...statuses.value, ...(await api.videoStatus(ids)) }
      } catch (error) {
        quiet(error)
      }
    }

    watch(() => openIds.value.join(','), () => void prefetch(openIds.value), { immediate: true })

    watch(
      () => keptIds.value.join(','),
      (_ids, previous) => {
        void api.keep(keptIds.value).catch(quiet)
        const kept = new Set(keptIds.value)
        for (const id of previous ? previous.split(',').filter(Boolean) : []) {
          if (!kept.has(id)) void api.cancel(id).catch(quiet)
        }
      },
      { immediate: true },
    )

    const stops = [
      api.onChanged(({ id, status }) => {
        statuses.value = { ...statuses.value, [id]: status }
      }),
      api.onTools((tools) => {
        if (tools.state === 'ready') void prefetch(openIds.value)
      }),
    ]
    onBeforeUnmount(() => stops.forEach((stop) => stop()))
  }

  return { statusByItemId }
}
