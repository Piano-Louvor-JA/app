import { onBeforeUnmount, onMounted, ref } from 'vue'

import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { MonitorShareInfo, MonitorShareMode } from '@shared/types/desktop-bridge'

/** Compartilhar monitores com o app mobile: estado do main (electron/monitor-share.mjs). */
export function useMonitorShare() {
  const info = ref<MonitorShareInfo | null>(null)
  const busy = ref(false)
  let unsubscribe: (() => void) | null = null

  const api = () => getDesktopBridge()?.monitorShare ?? null

  async function refresh() {
    const bridge = api()
    if (!bridge) return
    info.value = await bridge.get()
  }

  async function update(changes: Parameters<NonNullable<ReturnType<typeof api>>['set']>[0]) {
    const bridge = api()
    if (!bridge || busy.value) return
    busy.value = true
    try {
      info.value = await bridge.set(changes)
    } finally {
      busy.value = false
    }
  }

  function setEnabled(enabled: boolean) {
    return update({ enabled })
  }

  /** null = monitor fora do compartilhamento. */
  function setDisplayMode(id: number, mode: MonitorShareMode | null) {
    const displays: Record<string, MonitorShareMode> = {}
    for (const display of info.value?.displays ?? []) {
      const value = display.id === id ? mode : display.mode
      if (value) displays[String(display.id)] = value
    }
    return update({ displays })
  }

  function resetToken() {
    return update({ resetToken: true })
  }

  onMounted(() => {
    void refresh()
    unsubscribe = api()?.onChanged((next) => { info.value = next }) ?? null
  })
  onBeforeUnmount(() => unsubscribe?.())

  return { info, busy, available: () => api() !== null, refresh, setEnabled, setDisplayMode, resetToken }
}
