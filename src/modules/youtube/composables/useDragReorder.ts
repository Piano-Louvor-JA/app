import { ref } from 'vue'

/** Classe do visual da linha enquanto ela é arrastada (cópia que segue o mouse). */
export const GHOST_CLASS = 'is-drag-ghost'

/**
 * Arrastar uma linha e soltar onde ela deve ficar (mesmo padrão dos Avisos). Cada lista usa o
 * seu `scope`, então soltar numa lista diferente não faz nada. Teclado: Alt+↑/↓ move uma
 * posição. Trabalha com IDs, para funcionar também com a lista filtrada.
 */
export function useDragReorder(scope: string, onMove: (fromId: string, toId: string) => void) {
  const type = `application/x-louvorja-yt-${scope}`
  const dragging = ref<string | null>(null)
  const over = ref<string | null>(null)
  /** Onde a linha vai entrar em relação à linha sob o mouse: descendo, depois; subindo, antes. */
  const side = ref<'before' | 'after'>('after')
  let fromIndex = -1

  function reset() {
    dragging.value = null
    over.value = null
    fromIndex = -1
  }

  /** Tracejado no ponto onde a linha arrastada vai entrar. */
  function classes(id: string) {
    const target = over.value === id && dragging.value !== id
    return { 'is-drop-before': target && side.value === 'before', 'is-drop-after': target && side.value === 'after' }
  }

  /**
   * Atributos e eventos da linha `id`; `prev`/`next` são os vizinhos visíveis (teclado) e
   * `index` a posição dela na lista visível (lado do tracejado).
   */
  function bind(id: string, prev?: string, next?: string, index = -1) {
    return {
      draggable: 'true' as const,
      onDragstart: (event: DragEvent) => {
        // O navegador fotografa a linha agora para a cópia que segue o mouse: o destaque entra
        // só para essa foto e sai em seguida, deixando a linha que fica no lugar sem destaque.
        const row = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
        row?.classList.add(GHOST_CLASS)
        setTimeout(() => row?.classList.remove(GHOST_CLASS), 0)
        event.dataTransfer?.setData(type, id)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
        dragging.value = id
        fromIndex = index
      },
      onDragover: (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes(type)) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        over.value = id
        side.value = index >= 0 && fromIndex >= 0 && index < fromIndex ? 'before' : 'after'
      },
      onDragleave: () => {
        if (over.value === id) over.value = null
      },
      onDrop: (event: DragEvent) => {
        const from = event.dataTransfer?.getData(type)
        reset()
        if (!from || from === id) return
        event.preventDefault()
        onMove(from, id)
      },
      onDragend: reset,
      onKeydown: (event: KeyboardEvent) => {
        if (!event.altKey) return
        const target = event.key === 'ArrowUp' ? prev : event.key === 'ArrowDown' ? next : undefined
        if (!target) return
        event.preventDefault()
        onMove(id, target)
      },
    }
  }

  return { dragging, over, side, classes, bind }
}
