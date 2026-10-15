import { storeToRefs } from 'pinia'
import type { RouteLocationNormalized, Router } from 'vue-router'

import type { HistoryEntry } from '@shared/services/navigation-history'
import { useNavigationHistoryStore } from '@shared/stores/useNavigationHistoryStore'

interface Installation {
  router: Router
  uninstall: () => void
}

let installation: Installation | null = null

function toEntry(route: RouteLocationNormalized): HistoryEntry {
  const { navKey } = route.meta
  return {
    fullPath: route.fullPath,
    name: typeof route.name === 'string' ? route.name : null,
    navKey: typeof navKey === 'string' ? navKey : 'home',
  }
}

/**
 * Liga o router ao histórico da sessão. Chamar uma vez, na janela principal,
 * antes do mount (para registrar a navegação inicial).
 *
 * - `history.listen` só dispara em pop (voltar/avançar/`go`, inclusive os
 *   `router.back()` das views) e chega ANTES do `afterEach`.
 * - Push × replace vem de `history.state.replaced`.
 * - `history.state.position` (history web/hash) é a fonte da verdade do
 *   índice em pops; sem ela (memory history) usa o `delta`.
 */
export function installNavigationHistory({ router }: { router: Router }): () => void {
  if (installation?.router === router) return installation.uninstall
  installation?.uninstall()

  const store = useNavigationHistoryStore()
  let pendingPopDelta: number | null = null
  /** `position` do navegador que corresponde ao índice 0 do registro. */
  let basePosition: number | null = null

  const stopListen = router.options.history.listen((_to, _from, info) => {
    pendingPopDelta = info.delta
  })

  const stopAfterEach = router.afterEach((to, _from, failure) => {
    const popDelta = pendingPopDelta
    pendingPopDelta = null
    if (failure || to.meta.projection) return

    const entry = toEntry(to)
    const state = router.options.history.state as { position?: unknown; replaced?: unknown }
    const position = typeof state.position === 'number' ? state.position : null

    if (popDelta !== null) {
      store.moveTo(
        position !== null && basePosition !== null
          ? position - basePosition
          : store.index + popDelta,
      )
      // Pop "fantasma" (hash alterado por fora, delta 0) ou entrada que já
      // saiu pelo limite: o que está na tela passa a ser a atual.
      if (store.current?.fullPath !== entry.fullPath) store.replace(entry)
    } else if (state.replaced === true) {
      store.replace(entry)
    } else {
      store.push(entry)
    }

    if (position !== null) basePosition = position - store.index
  })

  const current: Installation = {
    router,
    uninstall: () => {
      stopListen()
      stopAfterEach()
      if (installation === current) installation = null
    },
  }
  installation = current
  return current.uninstall
}

/** Estado e ações do histórico para a UI (setas, pontos, atalhos). */
export function useNavigationHistory() {
  const store = useNavigationHistoryStore()
  const { entries, canGoBack, canGoForward, dots } = storeToRefs(store)

  function goTo(target: number) {
    const delta = target - store.index
    if (!installation || delta === 0 || target < 0 || target >= store.entries.length) return
    installation.router.go(delta)
  }

  return {
    entries,
    canGoBack,
    canGoForward,
    dots,
    back: () => goTo(store.index - 1),
    forward: () => goTo(store.index + 1),
    goTo,
  }
}
