import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  hasPalcoClients,
  listPalcoTvs,
  onPalcoClientsChanged,
  type PalcoClient,
} from '@modules/settings/services/palco-clients'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { MonitorShareInfo } from '@shared/types/desktop-bridge'

/**
 * Aparelhos conectados a este app desktop, juntando os quatro canais:
 * Controle remoto (apk operador), Passador do pregador (navegador),
 * Compartilhamento de monitores (celular usando os monitores daqui) e as
 * TVs do Palco (webOS, Tizen, Android TV).
 */
export function useConnectedDevices() {
  const remote = ref<string | null>(null)
  const speaker = ref<string | null>(null)
  const share = ref<MonitorShareInfo | null>(null)
  const tvs = ref<PalcoClient[]>([])
  const unsubscribe: (() => void)[] = []
  const loadTvs = () =>
    listPalcoTvs()
      .then((list) => { tvs.value = list })
      .catch(() => {})

  onMounted(() => {
    const bridge = getDesktopBridge()
    const off = bridge?.remote?.onClients?.((payload) => {
      remote.value = payload.remoteAddress ?? null
      speaker.value = payload.speakerAddress ?? null
    })
    if (off) unsubscribe.push(off)
    if (hasPalcoClients()) {
      void loadTvs()
      unsubscribe.push(onPalcoClientsChanged(() => void loadTvs()))
    }
    if (bridge?.monitorShare) {
      void bridge.monitorShare.get().then((info) => { share.value = info }).catch(() => {})
      unsubscribe.push(bridge.monitorShare.onChanged((info) => { share.value = info }))
    }
  })
  onBeforeUnmount(() => unsubscribe.forEach((off) => off()))

  const phone = computed(() => share.value?.phone ?? null)
  const count = computed(
    () => [remote.value, speaker.value, phone.value].filter(Boolean).length + tvs.value.length,
  )

  return { remote, speaker, phone, tvs, count, available: () => getDesktopBridge() !== null }
}
