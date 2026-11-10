import { ref } from 'vue'
import { refreshObsConnections } from '../composables/useObsConnections'
import { notifyObsChanged } from './obs-connections'

export const obsDetecting = ref(false)
let pending: Promise<void> | null = null

/**
 * Atualiza a lista de saídas no ar antes de publicar uma projeção. As páginas
 * abertas não recarregam: o replay do servidor entrega o estado a quem conecta.
 */
export function detectObsBeforeProjection(): Promise<void> {
  if (pending) return pending
  obsDetecting.value = true
  pending = refreshObsConnections().then(() => {
    notifyObsChanged()
  }).finally(() => {
    obsDetecting.value = false
    pending = null
  })
  return pending
}
