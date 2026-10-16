import { computed, ref, type Ref } from 'vue'

/** Nome sem CSS: a <Transition> termina no próximo quadro (sem fade). */
export const INSTANT_PAGE_TRANSITION = 'page-instant'

/** Pedido não usado expira: não deixa uma navegação comum sem transição. */
const REQUEST_TTL_MS = 1000

const instantNext = ref(false)
let expireTimer: ReturnType<typeof setTimeout> | null = null

function settle() {
  instantNext.value = false
  if (expireTimer) clearTimeout(expireTimer)
  expireTimer = null
}

/**
 * A próxima troca de página acontece sem a transição do tema — usada quando
 * outro efeito já faz o papel dela (gênio ao minimizar/reabrir).
 */
export function requestInstantPageTransition() {
  instantNext.value = true
  if (expireTimer) clearTimeout(expireTimer)
  expireTimer = setTimeout(settle, REQUEST_TTL_MS)
}

/** AppShell: nome efetivo da <Transition> e `settle` para chamar no after-enter. */
export function usePageTransitionOverride(base: Ref<string>) {
  const name = computed(() => (instantNext.value ? INSTANT_PAGE_TRANSITION : base.value))
  return { name, settle }
}
