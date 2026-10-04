/**
 * Conectividade com a API (issue #321 — Railson 01/09):
 * "quando a API cair, apresentar uma mensagem simplificada que o usuário
 * entenda — problema de conexão".
 *
 * Poll leve (HEAD no índice essencial, com fallback em cascata igual ao
 * bootstrap) a cada 15s. Estado exposto p/ banner global:
 *   - 'ok'       → nada aparece
 *   - 'offline'  → banner "sem conexão com o serviço — tentando reconectar"
 * Volta sozinho quando a API responde (banner some sem ação do usuário).
 * Janela de projeção NÃO mostra banner (é só espelho).
 */
import { onMounted, onUnmounted, ref } from 'vue'

import { apiCandidateBases } from '../services/api-fallback'

/**
 * Detecção de janela de projeção (mesma regra do App.vue: rota de projeção
 * ou popup aberto por useProjectionWindow). Banner nunca aparece no espelho.
 */
function isProjectionContext(): boolean {
  if (typeof window === 'undefined') return false
  if (new URLSearchParams(window.location.search).has('projection')) return true
  try {
    return window.opener !== null && window.opener !== window
  } catch {
    return false
  }
}

export type ApiConnectivityState = 'ok' | 'offline'

const POLL_MS = 15_000
const TIMEOUT_MS = 6_000

/** Escapa da reatividade p/ o interval não reiniciar a cada leitura. */
let singleton: {
  state: ReturnType<typeof ref<ApiConnectivityState>>
  start: () => void
  stop: () => void
} | null = null

async function probe(): Promise<boolean> {
  const bases = apiCandidateBases('database')
  for (const base of bases) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      const res = await fetch(`${base}/pt_musics`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timer)
      // Qualquer resposta HTTP = serviço vivo (mesmo 4xx/5x pontual de rota).
      if (res.status < 500 || res.status >= 200) return true
    } catch {
      // tenta próximo fallback
    }
  }
  return false
}

export function useApiConnectivity() {
  if (singleton) return singleton

  const state = ref<ApiConnectivityState>('ok')
  let timer: ReturnType<typeof setInterval> | null = null
  let probing = false

  async function check() {
    if (probing) return
    probing = true
    try {
      const ok = await probe()
      state.value = ok ? 'ok' : 'offline'
    } finally {
      probing = false
    }
  }

  function start() {
    if (isProjectionContext() || timer) return
    void check()
    timer = setInterval(() => void check(), POLL_MS)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  singleton = { state, start, stop }
  return singleton
}

/** Helper p/ componente: lifecycle embutido. */
export function useApiConnectivityLifecycle() {
  const { state, start, stop } = useApiConnectivity()
  onMounted(start)
  onUnmounted(stop)
  return { state }
}
