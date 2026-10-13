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

/**
 * Host de áudio (fix duplicidade 03/10): o alerta deve tocar em UMA janela só.
 * - Sem projeção: o OPERADOR toca (feedback do irmão: "executar o cronômetro
 *   mesmo sem projeção, com áudio funcional").
 * - Com projeção (N popups, um por monitor): só a popup ELEITA toca — antes,
 *   cada popup rodava o composable com seu próprio firedMarkers e o marco
 *   dos 5min tocava uma vez POR TELA (áudio duplicado audível no PC).
 * Eleição determinística sem coordenação: menor monitorId vence; layout
 * 'return' (janela de retorno do operador) nunca toca. Fallback: sem
 * monitorId na URL, menor lexicográfico entre as que se anunciam.
 */
export const COUNTDOWN_AUDIO_HOST_KEY = 'pianolouvorja:countdown:audioHost'

export type AudioHostClaim = { id: string; ts: number }

let fallbackHostId: string | null = null

/** id único desta janela candidata (monitorId quando existir). */
export function myAudioHostId(): string {
  if (typeof window === 'undefined') return 'op'
  const monitorId = new URLSearchParams(window.location.search).get('monitorId')
  if (monitorId != null) return `m${monitorId}`
  if (window.name) return `w${window.name}`
  if (!fallbackHostId) fallbackHostId = `w${crypto.randomUUID()}`
  return fallbackHostId
}

export function isReturnWindow(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('layout') === 'return'
}

/** Janela do OPERADOR (não-popup): rota principal, sem ?module=countdown. */
export function isOperatorWindow(): boolean {
  if (typeof window === 'undefined') return true
  const params = new URLSearchParams(window.location.search)
  return !(
    window.location.pathname.includes('/popup') &&
    params.get('module') === 'countdown'
  ) && window.opener == null
}

function readHostClaim(): AudioHostClaim | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem(COUNTDOWN_AUDIO_HOST_KEY) ?? 'null',
    ) as AudioHostClaim | null
    if (raw && typeof raw.id === 'string' && typeof raw.ts === 'number') return raw
  } catch {
    // corrompido — trata como vago
  }
  return null
}

/**
 * Decide se ESTA janela é a host do áudio. Regras:
 * - Janela de retorno ('layout=return'): nunca.
 * - Operador: host quando NENHUMA popup viva estiver eleita (claim com
 *   heartbeat < 4s). Projeção fechou → operador assume (áudio sem projeção).
 * - Popup: host se seu id for o menor id vivo (heartbeat < 4s) entre
 *   os claims; empate resolvido por ordem de chegada (ts menor).
 */
export function claimAudioHost(now = Date.now()): boolean {
  if (typeof window === 'undefined') return false
  if (isReturnWindow()) return false
  const myId = myAudioHostId()
  const STALE_MS = 4000
  const current = readHostClaim()
  const alive = current != null && now - current.ts < STALE_MS
  if (isOperatorWindow()) {
    // Operador é host só quando a eleição de popups está vazia/expirada.
    if (alive && current!.id !== myId) return false
  } else if (alive && current!.id !== myId && myId > current!.id) {
    // Popup com monitorId maior não rouba de um id menor já vivo.
    return false
  }
  try {
    localStorage.setItem(COUNTDOWN_AUDIO_HOST_KEY, JSON.stringify({ id: myId, ts: now }))
  } catch { /* ignore */ }
  return true
}

/** Renova o heartbeat se esta janela for a host. Chamar a cada tick de 1s. */
export function renewAudioHost(now = Date.now()): void {
  if (typeof window === 'undefined') return
  const current = readHostClaim()
  if (current != null && current.id === myAudioHostId()) {
    try {
      localStorage.setItem(COUNTDOWN_AUDIO_HOST_KEY, JSON.stringify({ id: current.id, ts: now }))
    } catch { /* ignore */ }
  }
}

/** Libera o claim ao desmontar (popup fechou → operador assume). */
export function releaseAudioHost(): void {
  if (typeof window === 'undefined') return
  const current = readHostClaim()
  if (current != null && current.id === myAudioHostId()) {
    try {
      localStorage.removeItem(COUNTDOWN_AUDIO_HOST_KEY)
    } catch { /* ignore */ }
  }
}

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
