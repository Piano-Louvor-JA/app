import { ref } from 'vue'
import { refreshObsConnections } from '../composables/useObsConnections'
import { palcoSession } from './palco-session'
import { notifyObsChanged, obsConnections } from './obs-connections'

export const obsDetecting = ref(false)
let pending: Promise<void> | null = null

/** Refresh actual running outputs before publishing a new projection. */
export function detectObsBeforeProjection(): Promise<void> {
  if (pending) return pending
  obsDetecting.value = true
  pending = refreshObsConnections().then(async () => {
    const slots = await Promise.resolve().then(() => palcoSession.slots?.() ?? []).catch(() => [])
    const selected = new Set(obsConnections.value.filter(connection => connection.selected).map(connection => connection.id))
    const targets = slots.filter(slot => slot.running && selected.has(slot.id))
    await Promise.allSettled(targets.map(async slot => {
      const ready = await palcoSession.refreshObs?.(slot.id)
      if (ready === false) await palcoSession.refreshObs?.(slot.id)
    }))
    notifyObsChanged()
  }).finally(() => {
    obsDetecting.value = false
    pending = null
  })
  return pending
}
