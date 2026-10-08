import { onMounted, onUnmounted } from 'vue'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { appConfirm } from '@shared/composables/useAppConfirm'

let handling = false

/**
 * Exibe o confirm de encerramento na janela do OPERADOR e fecha a projeção
 * se confirmado. Usada por dois gatilhos:
 * 1. ESC digitado na PRÓPRIA janela do operador (com projeção ativa);
 * 2. ESC pressionado na janela de PROJEÇÃO (main encaminha via IPC
 *    'projection:close-requested') — decisão Rafael 30/08: a projeção nunca
 *    fecha sem o operador confirmar na tela DELE.
 */
export async function requestCloseProjectionWithConfirm(): Promise<void> {
  if (handling) return
  try {
    const bridge = getDesktopBridge()
    const alive = (await bridge?.projection?.externalAlive?.()) ?? false
    if (!alive) return
    handling = true
    const ok = await appConfirm({
      title: 'Encerrar projeção?',
      message: 'Há uma projeção ativa (bíblia/hinos/vídeo/site). Encerrar agora?',
      confirmLabel: 'Encerrar',
      danger: true,
    })
    if (ok) {
      await bridge?.projection?.closeUrl?.()
      // Limpa o estado local da UI (isProjecting/botão) — o main fecha as
      // janelas, mas o renderer precisa saber que acabou (botão travava ativo)
      closeLocalProjectionState()
    }
  } catch {
    /* ignore */
  } finally {
    handling = false
  }
}

/**
 * Instala os dois gatilhos na janela do operador:
 * - tecla ESC local (com guards de input/dialog);
 * - evento IPC vindo da projeção (ESC lá).
 */
export function useOperatorEscapeToCloseProjection(isProjectionWindow: () => boolean) {
  async function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (isProjectionWindow()) return
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    if (document.querySelector('[role="dialog"]')) return
    /* v8 ignore next 1 -- handling true implica confirm montado, e L52 já barrou */
    if (handling) return
    try {
      const bridge = getDesktopBridge()
      const alive = (await bridge?.projection?.externalAlive?.()) ?? false
      if (!alive) return
      event.preventDefault()
      await requestCloseProjectionWithConfirm()
    } catch {
      /* ignore */
    }
  }

  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    try {
      unsubscribe = getDesktopBridge()?.projection?.onCloseRequested?.(() => {
        void requestCloseProjectionWithConfirm()
      }) ?? null
    } catch {
      /* bridge indisponível (browser) */
    }
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    unsubscribe?.()
  })
}

/**
 * Fecha as popups de projeção do LADO DO RENDERER (estado da UI: isProjecting,
 * botão Projetar, watch). Chamado quando o main avisa que as popups foram
 * fechadas (confirm do operador ou fim da projeção pelo main).
 *
 * Também encerra o áudio/sessão da Central de Mídia: o ESC do operador
 * fechava só as janelas e o player continuava tocando.
 */
export function closeLocalProjectionState(): void {
  try {
    // import dinâmico: evita dependência cíclica no boot do App.vue
    void import('@shared/composables/useProjectionWindow').then((m) => {
      m.closeProjectionModule()
    })
    void import('@modules/media/stores/useMediaStore').then(({ useMediaStore }) => {
      const media = useMediaStore()
      if (media.session || media.isPlaying || media.isProjecting) {
        media.close()
      }
    })
  } catch {
    /* ignore */
  }
}
