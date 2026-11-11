import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { MonitorShareInfo } from '@shared/types/desktop-bridge'

/**
 * Aparelhos conectados a este app desktop, juntando os três canais:
 * Controle remoto (apk operador), Passador do pregador (navegador) e
 * Compartilhamento de monitores (celular usando os monitores daqui).
 */
export function useConnectedDevices() {
  const remote = ref<string | null>(null)
  const speaker = ref<string | null>(null)
  const share = ref<MonitorShareInfo | null>(null)
  const unsubscribe: (() => void)[] = []

  onMounted(() => {
    const bridge = getDesktopBridge()
    const off = bridge?.remote?.onClients?.((payload) => {
      remote.value = payload.remoteAddress ?? null
      speaker.value = payload.speakerAddress ?? null
    })
    if (off) unsubscribe.push(off)
    if (bridge?.monitorShare) {
      void bridge.monitorShare.get().then((info) => { share.value = info }).catch(() => {})
      unsubscribe.push(bridge.monitorShare.onChanged((info) => { share.value = info }))
    }
  })
  onBeforeUnmount(() => unsubscribe.forEach((off) => off()))

  const phone = computed(() => share.value?.phone ?? null)
  const count = computed(() => [remote.value, speaker.value, phone.value].filter(Boolean).length)

  return { remote, speaker, phone, count, available: () => getDesktopBridge() !== null }
}
