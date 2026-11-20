/**
 * Conectividade com a API (issue #321 — Railson 01/09):
 * "quando a API cair, apresentar uma mensagem simplificada que o usuário
 * entenda — problema de conexão".
 *
 * Poll leve: HEAD em /v1/health de cada host (fallback em cascata igual ao
 * bootstrap) a cada 60 s conectado e 15 s sem conexão; pausa com a janela
 * oculta. Antes era HEAD em /json_db/pt_musics a cada 15 s — a API montava
 * a lista inteira (≈1–2,5 s de SQLite síncrono) a cada checagem de cada app
 * aberto. Estado exposto p/ banner global:
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
    return window.opener != null && window.opener !== window
  } catch {
    return false
  }
}

export type ApiConnectivityState = 'ok' | 'offline'

/** Conectado: checagem espaçada (cada app aberto bate na API). */
const OK_POLL_MS = 60_000
/** Sem conexão: tenta reconectar mais rápido. */
const OFFLINE_POLL_MS = 15_000
const TIMEOUT_MS = 6_000

/**
 * `/v1/health` na origem do host (o catálogo vem como `<origem>/json_db`).
 * Base inválida lança e o probe passa ao próximo fallback.
 */
function healthUrl(base: string): string {
  return `${new URL(base).origin}/v1/health`
}

function isWindowHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

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
      await fetch(healthUrl(base), {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timer)
      // Qualquer resposta HTTP = serviço vivo (ex.: host legado sem
      // /v1/health responde 404 — o servidor está no ar).
      return true
    } catch {
      // tenta próximo fallback
    }
  }
  return false
}

export function useApiConnectivity() {
  if (singleton) return singleton

  const state = ref<ApiConnectivityState>('ok')
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
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

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function schedule() {
    clearTimer()
    if (!running || isWindowHidden()) return
    timer = setTimeout(
      () => void tick(),
      state.value === 'offline' ? OFFLINE_POLL_MS : OK_POLL_MS,
    )
  }

  async function tick() {
    timer = null
    await check()
    schedule()
  }

  // Janela minimizada/oculta: ninguém vê o banner — não checa. Ao voltar,
  // checa na hora.
  function onVisibilityChange() {
    if (!running) return
    if (isWindowHidden()) clearTimer()
    else void tick()
  }

  function start() {
    if (isProjectionContext() || running) return
    running = true
    document.addEventListener('visibilitychange', onVisibilityChange)
    void tick()
  }

  function stop() {
    running = false
    clearTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
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
