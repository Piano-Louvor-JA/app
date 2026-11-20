/**
 * Confirm modal no styleguide do app — substitui window.confirm/alert.
 *
 * const confirmed = await appConfirm({
 *   title: t('...'), message: t('...'),
 *   confirmLabel: t('ok'), cancelLabel: t('cancel'),
 * })
 */
import { createApp, defineComponent, h, reactive, type App, type Component } from 'vue'

import AppConfirm from '@shared/components/AppConfirm.vue'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  enterConfirms?: boolean
  /** Confirma por fora do modal (ex.: tecla em outra janela); devolve o desligamento. */
  externalConfirm?: (confirm: () => void) => (() => void) | null | undefined | void
}

export function appConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const state = reactive({ open: true })
    let settled = false
    let stopExternal: (() => void) | null = null

    const close = (result: boolean) => {
      if (settled) return
      settled = true
      stopExternal?.()
      state.open = false
      // deixa a saída animar antes de desmontar
      setTimeout(() => {
        app.unmount()
        resolve(result)
      }, 50)
    }

    const wrapper: Component = defineComponent({
      setup() {
        return () =>
          h(AppConfirm, {
            open: state.open,
            title: options.title,
            message: options.message,
            confirmLabel: options.confirmLabel,
            cancelLabel: options.cancelLabel ?? 'Cancelar',
            danger: options.danger,
            enterConfirms: options.enterConfirms,
            onConfirm: () => close(true),
            onCancel: () => close(false),
          })
      },
    })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app: App = createApp(wrapper)
    app.mount(host)

    if (options.externalConfirm) {
      try {
        stopExternal = options.externalConfirm(() => close(true)) || null
      } catch {
        /* sem o gatilho externo, o modal segue funcionando */
      }
    }
  })
}
