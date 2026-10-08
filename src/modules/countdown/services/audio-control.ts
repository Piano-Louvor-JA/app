/**
 * F2 (web#175): canal de controle de áudio do cronômetro.
 *
 * O áudio toca SOMENTE na janela de projeção (vai espelhado pra TV);
 * os controles ficam na tela do operador. As janelas sincronizam via
 * BroadcastChannel + localStorage (mesmo padrão de countdown-config/runtime).
 */

export interface CountdownAudioControl {
  muted: boolean
  volume: number
  /** Incrementa a cada Stop — oyente corta o que estiver tocando. */
  stopTick: number
  /** true = cronômetro pausado: áudio pausa (retomável); false = rodando. */
  paused: boolean
}

export const COUNTDOWN_AUDIO_CHANNEL = 'louvorja-countdown-audio'
export const COUNTDOWN_AUDIO_STORAGE_KEY = 'pianolouvorja:countdown:audioControl'

export function publishAudioControl(control: CountdownAudioControl): void {
  try {
    localStorage.setItem(COUNTDOWN_AUDIO_STORAGE_KEY, JSON.stringify(control))
  } catch {
    // storage indisponível — BroadcastChannel ainda cobre
  }
  try {
    const channel = new BroadcastChannel(COUNTDOWN_AUDIO_CHANNEL)
    channel.postMessage(control)
    channel.close()
  } catch {
    // canal indisponível — localStorage fallback cobre no próximo load
  }
}

export function readAudioControl(): CountdownAudioControl {
  try {
    const raw = JSON.parse(
      localStorage.getItem(COUNTDOWN_AUDIO_STORAGE_KEY) ?? 'null',
    ) as CountdownAudioControl | null
    if (raw && typeof raw === 'object') {
      return {
        muted: raw.muted === true,
        volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : 1,
        stopTick: typeof raw.stopTick === 'number' ? raw.stopTick : 0,
        paused: raw.paused === true,
      }
    }
  } catch {
    // storage corrompido — defaults
  }
  return { muted: false, volume: 1, stopTick: 0, paused: false }
}

/** Assina mudanças de controle de áudio. Retorna unsubscribe. */
export function subscribeAudioControl(
  handler: (control: CountdownAudioControl) => void,
): () => void {
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(COUNTDOWN_AUDIO_CHANNEL)
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as CountdownAudioControl | undefined
      if (data && typeof data === 'object') handler(data)
    }
  } catch {
    channel = null
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== COUNTDOWN_AUDIO_STORAGE_KEY || !event.newValue) return
    try {
      handler(JSON.parse(event.newValue) as CountdownAudioControl)
    } catch {
      // payload inválido — ignora
    }
  }
  // Ambiente sem window (testes node) — só o BroadcastChannel cobre.
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)

  return () => {
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    channel?.close()
  }
}
