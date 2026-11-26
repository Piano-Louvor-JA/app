import { onScopeDispose, watch, type Ref } from 'vue'

/** Pausa depois da última tecla antes de buscar (a mesma do apk). */
export const TYPING_PAUSE_MS = 700
/** Menos letras que isso não busca sozinho (Enter/botão ainda buscam). */
export const TYPING_MIN_CHARS = 3

type Options = {
  /** Faz a busca com o texto já sem espaços nas pontas. */
  run: (query: string) => void
  /** Campo apagado: limpa o resultado. */
  clear?: () => void
  /** Texto que já está buscado na tela: não busca de novo. */
  current?: () => string
  /** Recusa buscar sozinho (ex.: link colado, que só toca pelo Enter). */
  skip?: (query: string) => boolean
}

/**
 * Busca enquanto digita, igual ao apk: depois de uma pausa e com pelo menos
 * `TYPING_MIN_CHARS` letras. `cancel` serve para o Enter/botão não buscar duas vezes.
 */
export function useTypingSearch(text: Ref<string>, { run, clear, current, skip }: Options) {
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const stop = watch(text, (value) => {
    cancel()
    const q = value.trim()
    if (!q) {
      clear?.()
      return
    }
    if (q.length < TYPING_MIN_CHARS || q === current?.()?.trim() || skip?.(q)) return
    timer = setTimeout(() => {
      timer = null
      run(q)
    }, TYPING_PAUSE_MS)
  })

  onScopeDispose(() => {
    cancel()
    stop()
  })

  return { cancel }
}
