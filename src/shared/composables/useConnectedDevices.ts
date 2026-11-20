import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  hasPalcoClients,
  listPalcoTvs,
  listTransmissionClients,
  onPalcoClientsChanged,
  type PalcoClient,
} from '@modules/settings/services/palco-clients'
import { obsConnectionName, obsConnections } from '@modules/settings/services/obs-connections'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { MonitorShareInfo } from '@shared/types/desktop-bridge'

/**
 * Aparelhos conectados a este app desktop, juntando os cinco canais:
 * Controle remoto (apk operador), Passador do pregador (navegador),
 * Compartilhamento de monitores (celular usando os monitores daqui), as
 * TVs do Palco (webOS, Tizen, Android TV) e as Transmissões (OBS e
 * navegadores abertos pelos links da Transmissão).
 */
export function useConnectedDevices() {
  const remote = ref<string | null>(null)
  const speaker = ref<string | null>(null)
  const share = ref<MonitorShareInfo | null>(null)
  const tvs = ref<PalcoClient[]>([])
  const sources = ref<PalcoClient[]>([])
  const unsubscribe: (() => void)[] = []
  const loadTvs = () => {
    void listPalcoTvs()
      .then((list) => { tvs.value = list })
      .catch(() => {})
    void listTransmissionClients()
      .then((list) => { sources.value = list })
      .catch(() => {})
  }

  onMounted(() => {
    const bridge = getDesktopBridge()
    const off = bridge?.remote?.onClients?.((payload) => {
      remote.value = payload.remoteAddress ?? null
      speaker.value = payload.speakerAddress ?? null
    })
    if (off) unsubscribe.push(off)
    if (hasPalcoClients()) {
      loadTvs()
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
    () => [remote.value, speaker.value, phone.value].filter(Boolean).length + tvs.value.length + sources.value.length,
  )
  /** Mesmo nome da conexão na Transmissão ("OBS" na principal). */
  function connectionName(source: PalcoClient) {
    const connection = obsConnections.value.find((item) => item.id === source.slotId)
    return connection ? obsConnectionName(connection) : source.slotLabel
  }
  /**
   * Uma linha por conexão e página (espelho, retorno, legenda): quantas abas,
   * em quantos OBS e navegadores, e de quais IPs.
   */
  const transmissions = computed(() => {
    const groups = new Map<string, { key: string; connection: string; page: PalcoClient['page'] | null; tabs: number; obs: number; browsers: number; ips: string[] }>()
    for (const source of sources.value) {
      const page = source.page ?? null
      const key = `${source.slotId}|${page ?? ''}`
      let group = groups.get(key)
      if (!group) {
        group = { key, connection: connectionName(source), page, tabs: 0, obs: 0, browsers: 0, ips: [] }
        groups.set(key, group)
      }
      group.tabs += 1
      if (source.platform === 'obs') group.obs += 1
      else group.browsers += 1
      if (source.ip && !group.ips.includes(source.ip)) group.ips.push(source.ip)
    }
    return Array.from(groups.values())
  })

  return { remote, speaker, phone, tvs, transmissions, count, available: () => getDesktopBridge() !== null }
}
