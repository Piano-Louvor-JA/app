import { computed, onUnmounted, ref, watch, type Ref } from 'vue'

/** Itens desenhados na hora (o que cabe na tela com folga). */
export const PROGRESSIVE_INITIAL = 40

/** Itens a mais por bloco (~20 linhas ≈ um quadro curto), com a tela redesenhando entre eles. */
export const PROGRESSIVE_CHUNK = 20

/** Pausa entre blocos (ms): deixa o navegador pintar e responder ao operador. */
const CHUNK_DELAY_MS = 16

/**
 * Desenha uma lista longa aos poucos. O Hinário tem 610 hinos (~14 mil
 * elementos): montar tudo de uma vez travava a tela por ~1,7 s. Assim a
 * primeira tela aparece na hora e o resto entra em blocos logo em seguida.
 * Lista nova (outra busca/coletânea) recomeça pelos primeiros.
 */
export function useProgressiveList<T>(items: Ref<T[]>) {
  const count = ref(PROGRESSIVE_INITIAL)
  let timer: ReturnType<typeof setTimeout> | null = null

  function stop() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function scheduleNext() {
    stop()
    if (count.value >= items.value.length) return
    timer = setTimeout(() => {
      count.value += PROGRESSIVE_CHUNK
      scheduleNext()
    }, CHUNK_DELAY_MS)
  }

  watch(
    items,
    () => {
      count.value = PROGRESSIVE_INITIAL
      scheduleNext()
    },
    { immediate: true },
  )

  onUnmounted(stop)

  const visible = computed(() => items.value.slice(0, count.value))
  const complete = computed(() => count.value >= items.value.length)

  return { visible, complete }
}
