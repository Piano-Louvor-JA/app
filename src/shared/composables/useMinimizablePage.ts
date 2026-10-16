import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'

import { useNavigationHistory } from '@shared/composables/useNavigationHistory'
import { requestInstantPageTransition } from '@shared/composables/useInstantPageTransition'
import { injectViewScrollMemory } from '@shared/composables/useViewScrollMemory'
import { playGenie, playGenieGhost, predictMinimizedTarget } from '@shared/services/genie-animation'
import { capturePagePreview, previewArea } from '@shared/services/page-preview'
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
  /** O que anima no efeito gênio (padrão: a página dentro do <main>). */
  animateEl?: () => Element | null
}

/**
 * Torna uma tela minimizável (barra acima do dock).
 * - `minimize()`: guarda o retrato (estado, rolagem e miniatura), põe na barra
 *   e sai da tela: volta no histórico ou vai para `fallbackRoute`.
 * - `takeRestoredState()`: ao ser reaberta pela barra, a tela pega o retrato
 *   (uma vez) e aplica quando ela mesma terminar de carregar.
 */
/** Miniatura preparada há mais que isso é capturada de novo no clique. */
const PREPARED_PREVIEW_TTL_MS = 5000

/** Se a navegação não tirar a página escondida, ela volta a aparecer. */
const UNHIDE_FALLBACK_MS = 1000

export function useMinimizablePage<S>(options: MinimizablePageOptions<S>) {
  const route = useRoute()
  const router = useRouter()
  const store = useMinimizedPagesStore()
  const history = useNavigationHistory()
  const scroll = injectViewScrollMemory()

  /** Miniatura capturada antes do clique (mouse entrou no –). */
  let prepared: { at: number; preview: Promise<string | null> } | null = null

  function capture() {
    return capturePagePreview(scroll?.getRoot() ?? null)
  }

  /**
   * Antecipa a miniatura (mouse sobre o – ou foco nele): no clique o efeito
   * começa na hora, sem esperar a captura (~130 ms no desktop).
   */
  function prepare() {
    if (prepared && Date.now() - prepared.at < PREPARED_PREVIEW_TTL_MS) return
    prepared = { at: Date.now(), preview: capture() }
  }

  async function minimize() {
    const { title, icon, summary } = options.describe()
    const fullPath = options.fullPath?.() ?? route.fullPath
    const routeName = typeof route.name === 'string' ? route.name : null
    const state = options.capture()
    const marks = scroll?.captureCurrent() ?? []
    // miniatura antecipada (prepare) ou capturada agora, antes de a tela mudar
    const fresh = prepared && Date.now() - prepared.at < PREPARED_PREVIEW_TTL_MS
    const preview = await (fresh ? prepared!.preview : capture())
    prepared = null

    // efeito já no clique, rumo a onde o item vai aparecer; o item só entra na
    // barra depois — o recálculo de layout acontece com a página já sumida
    const target = predictMinimizedTarget()
    const windowEl = options.animateEl?.()
    if (windowEl) {
      // janela: elemento pequeno, anima ele mesmo
      await playGenie(windowEl, target, 'minimize')
    } else {
      // página: anima a IMAGEM dela (barato) e esconde a página viva na hora
      const root = scroll?.getRoot() ?? null
      const pageEl = (root?.firstElementChild as HTMLElement | null | undefined) ?? null
      const removeGhost = await playGenieGhost(preview, previewArea(root), target, 'minimize', pageEl)
      if (removeGhost) {
        removeGhost()
        if (pageEl) {
          setTimeout(() => {
            pageEl.style.contentVisibility = ''
          }, UNHIDE_FALLBACK_MS)
        }
      } else {
        await playGenie(pageEl, target, 'minimize')
      }
    }

    store.minimize({ fullPath, routeName, title, icon, summary, state, scroll: marks, preview, minimizedAt: Date.now() })

    if (options.onMinimized) {
      options.onMinimized()
      return
    }
    // o gênio já fez a saída: a troca de página não repete a transição do tema
    requestInstantPageTransition()
    if (history.canGoBack.value) history.back()
    else await router.push(options.fallbackRoute)
  }

  function takeRestoredState(): S | null {
    return (store.takeRestore(route.fullPath)?.state as S | undefined) ?? null
  }

  return { minimize, prepare, takeRestoredState }
}
