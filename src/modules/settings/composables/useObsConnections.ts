import { computed, onMounted, onUnmounted, ref } from 'vue'
import { palcoSession } from '../services/palco-session'
import { obsConnections, migratePalcoConnections, obsAllowsMirror } from '../services/obs-connections'
import { DEFAULT_OVERLAY_STYLE, type PalcoSlotStatus } from '../types/transmission'

const slots = ref<PalcoSlotStatus[]>([])
let users = 0
let timer: ReturnType<typeof setInterval> | null = null
let pending: Promise<void> | null = null
export function refreshObsConnections(): Promise<void> {
  if (pending) return pending
  pending = Promise.resolve().then(() => palcoSession.slots?.() ?? []).then((value) => { migratePalcoConnections(value); slots.value = value }).catch(() => {}).finally(() => { pending = null })
  return pending
}

/** Fonte 1 também cumprimenta as TVs do Palco (fundo + espera) ao ligar. */
export async function startObsConnection(id: string): Promise<boolean> {
  if (id !== '0') return palcoSession.startSlot(id)
  palcoSession.setSlot('0')
  return palcoSession.turnOn()
}

export async function stopObsConnection(id: string): Promise<void> {
  if (id !== '0') return palcoSession.stopSlot(id)
  palcoSession.setSlot('0')
  return palcoSession.turnOff()
}

export function useObsConnections() {
  const connections = computed(() => obsConnections.value
    .map((connection) => {
      const slot = slots.value.find((item) => item.id === connection.id)
      return {
        ...connection,
        running: slot?.running ?? false,
        receiverIps: slot?.receiverIps ?? [],
        clients: slot?.clients ?? 0,
        httpPort: slot?.httpPort ?? null,
        error: slot?.error ?? null,
        overlay: { ...DEFAULT_OVERLAY_STYLE, ...slot?.overlay },
        overlayUrl: slot?.overlayUrl ?? null,
        receiverUrl: slot?.receiverUrl ?? null,
        returnUrl: slot?.returnUrl ?? null,
      }
    })
    .sort((a, b) => Number(b.id === '0') - Number(a.id === '0')))
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
