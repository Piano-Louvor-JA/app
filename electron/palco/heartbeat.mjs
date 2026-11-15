/**
 * Conexões do Palco/Transmissão vivas dos dois lados.
 *
 * Servidor → telas: a cada HEARTBEAT_INTERVAL_MS manda `beat` às telas que
 * avisaram que entendem (caps 'heartbeat') e o ping do próprio WebSocket a
 * todas. Tela que deu sinal de vida antes (respondeu `beat`, mandou mensagem
 * ou o pong do WebSocket) e fica HEARTBEAT_TIMEOUT_MS calada caiu: a conexão
 * é encerrada em vez de ficar pendurada. Tela que nunca deu sinal (webOS 4.x
 * não responde o ping do WebSocket, app antigo não conhece `beat`) não é
 * derrubada por isso — fica como antes.
 *
 * As telas fazem o mesmo do lado delas: sem ouvir o servidor por um tempo,
 * fecham e reconectam (ver receiver.html / overlay.html / palco-receiver).
 */

export const HEARTBEAT_INTERVAL_MS = 10_000
export const HEARTBEAT_TIMEOUT_MS = 30_000
/** Android TV que caiu pela rede: o servidor a procura (wake) por este tempo. */
export const LOST_SEARCH_MS = 10 * 60_000
export const WAKE_EVERY_MS = 30_000

export const BEAT_MESSAGE = Object.freeze({ v: 2, type: 'beat' })

/**
 * @template S
 * @param {{
 *   now?: () => number,
 *   send: (socket: S, message: object) => void,
 *   ping: (socket: S) => void,
 *   terminate: (socket: S) => void,
 *   onLost?: (socket: S) => void,
 *   timeoutMs?: number,
 * }} options
 */
export function createHeartbeat(options) {
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? HEARTBEAT_TIMEOUT_MS
  /** @type {Map<S, { lastSeen: number, answers: boolean, beats: boolean }>} */
  const sockets = new Map()

  return {
    track(socket) {
      sockets.set(socket, { lastSeen: now(), answers: false, beats: false })
    },
    /** Qualquer mensagem da tela ou o pong do WebSocket: está viva. */
    seen(socket) {
      const state = sockets.get(socket)
      if (!state) return
      state.lastSeen = now()
      state.answers = true
    },
    /** A tela entende `beat` (caps 'heartbeat'). */
    announce(socket) {
      const state = sockets.get(socket)
      if (!state) return
      state.beats = true
      state.answers = true
      state.lastSeen = now()
    },
    forget(socket) {
      sockets.delete(socket)
    },
    has(socket) {
      return sockets.has(socket)
    },
    tick() {
      const at = now()
      for (const [socket, state] of sockets) {
        if (state.answers && at - state.lastSeen > timeoutMs) {
          sockets.delete(socket)
          // avisa antes de encerrar: quem ouve ainda sabe quem era a tela
          options.onLost?.(socket)
          try { options.terminate(socket) } catch { /* já fechou */ }
          continue
        }
        if (state.beats) {
          try { options.send(socket, BEAT_MESSAGE) } catch { /* fecha no próximo tick */ }
        }
        try { options.ping(socket) } catch { /* idem */ }
      }
    },
  }
}

/**
 * Android TVs que caíram pela rede (sem fechar a conexão): o servidor manda
 * o wake de tempos em tempos para o app Palco voltar, até ela reconectar ou
 * passar LOST_SEARCH_MS. Quem fechou o app de propósito não entra aqui.
 * @param {{ now?: () => number, wake: (ip: string) => unknown, isConnected: (ip: string) => boolean }} options
 */
export function createLostTvSearch(options) {
  const now = options.now ?? Date.now
  /** @type {Map<string, { until: number, nextWake: number }>} */
  const lost = new Map()
  return {
    lost(ip) {
      if (!ip) return
      const at = now()
      lost.set(ip, { until: at + LOST_SEARCH_MS, nextWake: at })
    },
    found(ip) {
      lost.delete(ip)
    },
    pending() {
      return Array.from(lost.keys())
    },
    tick() {
      const at = now()
      for (const [ip, state] of lost) {
        if (at > state.until || options.isConnected(ip)) { lost.delete(ip); continue }
        if (at < state.nextWake) continue
        state.nextWake = at + WAKE_EVERY_MS
        try { void options.wake(ip) } catch { /* TV fora da rede */ }
      }
    },
    clear() {
      lost.clear()
    },
  }
}
