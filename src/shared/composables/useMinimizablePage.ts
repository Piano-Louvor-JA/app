import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'

import { useNavigationHistory } from '@shared/composables/useNavigationHistory'
import { injectViewScrollMemory } from '@shared/composables/useViewScrollMemory'
import { capturePagePreview } from '@shared/services/page-preview'
import { useMinimizedPagesStore } from '@shared/stores/useMinimizedPagesStore'

export interface MinimizablePageOptions<S> {
  /** Título, ícone (Tabler) e resumo mostrados na barra e na prévia. */
  describe(): { title: string; icon: string; summary: string }
  /** Retrato da tela (o que ela precisa para voltar como estava). */
  capture(): S
  /** Para onde ir ao minimizar quando não há tela anterior no histórico. */
  fallbackRoute: RouteLocationRaw
  /** Endereço do item na barra (padrão: a rota atual). Janelas usam um parâmetro. */
  fullPath?: () => string
  /** Em vez de sair da tela (ex.: janela que só fecha e fica na mesma tela). */
  onMinimized?: () => void
}

/**
 * Torna uma tela minimizável (barra acima do dock).
 * - `minimize()`: guarda o retrato (estado, rolagem e miniatura), põe na barra
 *   e sai da tela: volta no histórico ou vai para `fallbackRoute`.
 * - `takeRestoredState()`: ao ser reaberta pela barra, a tela pega o retrato
 *   (uma vez) e aplica quando ela mesma terminar de carregar.
 */
export function useMinimizablePage<S>(options: MinimizablePageOptions<S>) {
  const route = useRoute()
  const router = useRouter()
  const store = useMinimizedPagesStore()
  const history = useNavigationHistory()
  const scroll = injectViewScrollMemory()

  async function minimize() {
    const { title, icon, summary } = options.describe()
    const fullPath = options.fullPath?.() ?? route.fullPath
    const routeName = typeof route.name === 'string' ? route.name : null
    const state = options.capture()
    const marks = scroll?.captureCurrent() ?? []
    // captura antes de sair: a miniatura é a tela como o operador a deixou
    const preview = await capturePagePreview(scroll?.getRoot() ?? null)

    store.minimize({ fullPath, routeName, title, icon, summary, state, scroll: marks, preview, minimizedAt: Date.now() })

    if (options.onMinimized) options.onMinimized()
    else if (history.canGoBack.value) history.back()
    else await router.push(options.fallbackRoute)
  }

  function takeRestoredState(): S | null {
    return (store.takeRestore(route.fullPath)?.state as S | undefined) ?? null
  }

  return { minimize, takeRestoredState }
}
