import { inject, onUnmounted, watch, type InjectionKey, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { applyScroll, captureScroll, type ScrollMark } from '@shared/services/view-scroll-memory'

/** Tempo máximo esperando o conteúdo da tela carregar para restaurar. */
export const SCROLL_RESTORE_TIMEOUT_MS = 1500

/** Telas com rolagem guardada na sessão; as mais antigas saem. */
export const SCROLL_MEMORY_MAX_ROUTES = 50

/** Qualquer um destes durante a restauração = o usuário assumiu a rolagem. */
const USER_INTENT_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

export interface ViewScrollMemory {
  /** Restaura a rolagem guardada da tela (chamado pelo AppShell no after-enter). */
  restore(fullPath: string): void
  /** Rolagem da tela atual agora (para o retrato de uma página minimizada). */
  captureCurrent(): ScrollMark[]
  /** Deixa a rolagem pronta para a próxima vez que a tela entrar (vazio = apaga). */
  seed(fullPath: string, marks: ScrollMark[]): void
  /** O <main> observado (área da miniatura de uma página minimizada). */
  getRoot(): HTMLElement | null
}

/** O AppShell provê; as páginas usam `injectViewScrollMemory()`. */
export const VIEW_SCROLL_MEMORY: InjectionKey<ViewScrollMemory> = Symbol('view-scroll-memory')

/** Memória de rolagem do AppShell; `null` fora dele (telas isoladas, testes). */
export function injectViewScrollMemory(): ViewScrollMemory | null {
  return inject(VIEW_SCROLL_MEMORY, null)
}

/**
 * Lembra a rolagem de cada tela (por `fullPath`) enquanto o app está aberto.
 * Guarda no `beforeEach` (a tela antiga ainda está no DOM) e restaura quando
 * o AppShell chama `restore` depois que a tela nova entra.
 */
export function useViewScrollMemory(root: Ref<HTMLElement | null>): ViewScrollMemory {
  const router = useRouter()
  const saved = new Map<string, ScrollMark[]>()
  let cancelRestore: (() => void) | null = null

  /** Elementos que rolaram (evento scroll em captura): só eles são medidos. */
  const scrolled = new Set<Element>()
  // só elementos dentro do <main> chegam aqui (listener nele, em captura)
  const onScroll = (event: Event) => {
    scrolled.add(event.target as Element)
  }
  watch(
    root,
    (el, previous) => {
      previous?.removeEventListener('scroll', onScroll, true)
      el?.addEventListener('scroll', onScroll, { capture: true, passive: true })
    },
    { immediate: true },
  )

  function seed(fullPath: string, marks: ScrollMark[]) {
    saved.delete(fullPath)
    if (marks.length === 0) return
    saved.set(fullPath, marks)
    if (saved.size > SCROLL_MEMORY_MAX_ROUTES) saved.delete(saved.keys().next().value as string)
  }

  function captureCurrent(): ScrollMark[] {
    return root.value ? captureScroll(root.value, scrolled) : []
  }

  const stopGuard = router.beforeEach((_to, from) => {
    cancelRestore?.()
    if (!root.value) return
    seed(from.fullPath, captureScroll(root.value, scrolled))
    // a tela vai embora: os elementos dela saem da conta
    scrolled.clear()
  })

  function restore(fullPath: string) {
    cancelRestore?.()
    const el = root.value
    const marks = saved.get(fullPath)
    if (!el || !marks) return

    const deadline = Date.now() + SCROLL_RESTORE_TIMEOUT_MS
    let frame = 0
    const cancel = () => {
      cancelAnimationFrame(frame)
      USER_INTENT_EVENTS.forEach((type) => window.removeEventListener(type, cancel, true))
      cancelRestore = null
    }
    USER_INTENT_EVENTS.forEach((type) => window.addEventListener(type, cancel, { capture: true, passive: true }))
    cancelRestore = cancel

    const step = () => {
      if (applyScroll(el, marks) || Date.now() >= deadline) {
        cancel()
        return
      }
      frame = requestAnimationFrame(step)
    }
    step()
  }

  onUnmounted(() => {
    stopGuard()
    cancelRestore?.()
    root.value?.removeEventListener('scroll', onScroll, true)
  })

  return { restore, captureCurrent, seed, getRoot: () => root.value }
}
