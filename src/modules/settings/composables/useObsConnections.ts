import { computed, onMounted, onUnmounted, ref } from 'vue'
import { palcoSession } from '../services/palco-session'
import { obsConnections, migratePalcoConnections, obsAllowsMirror } from '../services/obs-connections'

type Slot = { id: string; label: string; running: boolean; clients: number; receiverIps?: string[] }
const slots = ref<Slot[]>([])
let users = 0
let timer: ReturnType<typeof setInterval> | null = null
let pending: Promise<void> | null = null
export function refreshObsConnections(): Promise<void> {
  if (pending) return pending
  pending = Promise.resolve().then(() => palcoSession.slots?.() ?? []).then((value) => { migratePalcoConnections(value); slots.value = value }).catch(() => {}).finally(() => { pending = null })
  return pending
}
export function useObsConnections() {
  const connections = computed(() => obsConnections.value.map((connection) => ({
    ...connection,
    running: slots.value.find((slot) => slot.id === connection.id)?.running ?? false,
    receiverIps: slots.value.find(slot => slot.id === connection.id)?.receiverIps ?? [],
    clients: slots.value.find((slot) => slot.id === connection.id)?.clients ?? 0,
  })))
  const activeConnections = computed(() => connections.value.filter((connection) => connection.running))
  onMounted(() => {
    if (users++ === 0) {
      void refreshObsConnections()
      timer = setInterval(() => void refreshObsConnections(), 3000)
      window.addEventListener('obs-connections-changed', refreshObsConnections)
    }
  })
  onUnmounted(() => {
    if (--users === 0) {
      if (timer) clearInterval(timer)
      timer = null
      window.removeEventListener('obs-connections-changed', refreshObsConnections)
    }
  })
  return { connections, activeConnections, refresh: refreshObsConnections }
}

/** Physical monitor selection must not stop independently selected network outputs. */
export function hasSelectedObsTargets(module?: string): boolean {
  return slots.value.some(slot => slot.running && obsAllowsMirror(slot.id, module) &&
    obsConnections.value.some(connection => connection.id === slot.id && connection.selected))
}
