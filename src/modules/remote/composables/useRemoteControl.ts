/**
 * Integração do Controle Remoto ao player do desktop.
 *
 * Liga o RemoteControlReceiver às ações do useMediaPlayer e fornece
 * o estado de conexão pra UI. A URL do sender do celular é salva nas
 * configurações locais (chave remote.senderUrl).
 */

import { computed, readonly, ref, watch } from 'vue'

import { useMediaPlayer } from '../../media/composables/useMediaPlayer'
import { RemoteControlReceiver } from '../services/remote-control-receiver'

const STORAGE_KEY = 'remote.senderUrl'
const DEFAULT_URL = 'ws://192.168.1.10:47081/palco'

const connectionUrl = ref<string>(
  localStorage.getItem(STORAGE_KEY) ?? DEFAULT_URL,
)
const enabled = ref(false)
const connected = ref(false)

let receiver: RemoteControlReceiver | null = null

function persistUrl(): void {
  localStorage.setItem(STORAGE_KEY, connectionUrl.value)
}

export function useRemoteControl() {
  const player = useMediaPlayer()

  function buildReceiver(): RemoteControlReceiver {
    return new RemoteControlReceiver(connectionUrl.value, {
      actions: {
        play: () => player.play(),
        pause: () => player.pause(),
        stop: () => player.requestClose(),
        setVolume: (v) => player.setVolume(v),
        seek: (sec) => player.seekTo(sec),
      },
      getState: () => ({
        playing: player.isPlaying.value,
        volume: player.volume.value,
        positionSec: player.currentTimeSec.value,
        durationSec: player.durationSec.value,
      }),
      log: (...args) => console.info('[remote]', ...args),
    })
  }

  function start(): void {
    receiver?.stop()
    receiver = buildReceiver()
    receiver.start()
    // Poll de estado de conexão (readyState não é reativo).
    const tick = window.setInterval(() => {
      connected.value = receiver?.connected ?? false
    }, 1000)
    window.addEventListener('beforeunload', () => {
      window.clearInterval(tick)
      receiver?.stop()
    })
  }

  watch(
    enabled,
    (on) => {
      if (on) {
        start()
      } else {
        receiver?.stop()
        receiver = null
        connected.value = false
      }
    },
    { immediate: true },
  )

  watch(connectionUrl, () => {
    persistUrl()
    if (enabled.value) start()
  })

  return {
    enabled,
    connected: readonly(connected),
    senderUrl: computed(() => connectionUrl.value),
    setSenderUrl(url: string): void {
      connectionUrl.value = url.trim()
    },
  }
}
