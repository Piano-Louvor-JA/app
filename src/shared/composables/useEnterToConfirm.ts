import { onBeforeUnmount, watch } from 'vue'

/**
 * Enter confirma enquanto `active()` for verdadeiro.
 *
 * Captura no window: o Enter não pode ativar o botão focado nem atalhos da
 * tela por trás, e com dois dialogs montados só o primeiro confirma.
 */
export function useEnterToConfirm(active: () => boolean, confirm: () => void): void {
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.repeat) return
    event.preventDefault()
    event.stopImmediatePropagation()
    confirm()
  }

  watch(
    active,
    (listening) => {
      if (listening) window.addEventListener('keydown', onKeydown, true)
      else window.removeEventListener('keydown', onKeydown, true)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
}
