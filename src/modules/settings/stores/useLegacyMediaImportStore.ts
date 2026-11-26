import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type {
  LegacyMediaAnalyzeResult,
  LegacyMediaImportProgress,
  LegacyMediaImportResult,
} from '@shared/types/desktop-bridge'
import { useLocalLibraryStore } from '@modules/sync/stores/useLocalLibraryStore'

export type LegacyMediaImportPhase =
  | 'idle'
  | 'analyzing'
  | 'importing'
  | 'reconciling'
  | 'done'
  | 'error'

/**
 * Importação de mídia (Configurações → Geral). Fica na store, não no card:
 * sair da página não interrompe nada — o main segue copiando, o progresso
 * continua chegando aqui e, no fim, a Central de Mídia é atualizada. Ao
 * voltar, o card mostra o estado atual.
 */
export const useLegacyMediaImportStore = defineStore('legacy-media-import', () => {
  const phase = ref<LegacyMediaImportPhase>('idle')
  const analysis = ref<LegacyMediaAnalyzeResult | null>(null)
  const importResult = ref<LegacyMediaImportResult | null>(null)
  const progress = ref<LegacyMediaImportProgress | null>(null)
  const reconcileMarked = ref(0)
  /** Pausada pelo operador (o main espera entre um arquivo e outro). */
  const paused = ref(false)
  const errorKey = ref<string | null>(null)

  const busy = computed(
    () => phase.value === 'analyzing' || phase.value === 'importing' || phase.value === 'reconciling',
  )

  const progressPercent = computed(() => {
    const p = progress.value
    if (!p || p.total <= 0) return 0
    return Math.min(100, Math.round((p.current / p.total) * 100))
  })

  /** Intervalo mínimo entre atualizações da Central durante a importação. */
  const LIVE_RECONCILE_MS = 30_000
  let liveReconciledImported = 0
  let liveReconcileAt = 0
  let liveReconciling = false

  /**
   * Durante a importação: com músicas novas gravadas, atualiza a Central de
   * Mídia (no máximo a cada 30 s, em segundo plano) — o que já foi gravado
   * aparece lá sem esperar o fim, e continua lá se a importação for parada.
   */
  function liveReconcile(imported: number) {
    if (liveReconciling || imported <= liveReconciledImported) return
    if (liveReconcileAt && Date.now() - liveReconcileAt < LIVE_RECONCILE_MS) return
    liveReconciling = true
    liveReconcileAt = Date.now()
    liveReconciledImported = imported
    void useLocalLibraryStore()
      .reconcileFromLocalMedia()
      .catch((err) => console.warn('[legacy-media] atualização da Central durante a importação falhou', err))
      .finally(() => {
        liveReconciling = false
      })
  }

  /** Atualiza o manifesto da Central de Mídia com o que já está no disco. */
  async function reconcileLibraryListing() {
    phase.value = 'reconciling'
    progress.value = null
    try {
      const result = await useLocalLibraryStore().reconcileFromLocalMedia((current, total, albumName) => {
        progress.value = { current, total, relativePath: albumName, mediaType: 'music' }
      })
      reconcileMarked.value = result.marked
    } catch (err) {
      console.warn('[legacy-media] reconciliação da biblioteca falhou', err)
      reconcileMarked.value = 0
    }
  }

  async function runImport(selectedPath?: string) {
    const bridge = getDesktopBridge()
    if (!bridge?.legacyMedia || busy.value) return

    const sourcePath = selectedPath?.trim() || undefined
    const invalidKey = !sourcePath
      ? 'settings.general.legacyMediaNotFound'
      : /\.(tar\.gz|tgz|tar)$/i.test(sourcePath)
        ? 'settings.general.legacyMediaInvalidArchive'
        : bridge.platform === 'linux'
        ? 'settings.general.legacyMediaInvalidFolderLinux'
        : 'settings.general.legacyMediaInvalidFolder'

    phase.value = 'analyzing'
    errorKey.value = null
    analysis.value = null
    importResult.value = null
    progress.value = null
    reconcileMarked.value = 0
    let unsubProgress: (() => void) | null = null

    try {
      const report = await bridge.legacyMedia.analyze(sourcePath)
      analysis.value = report

      if (!report.found) {
        phase.value = 'error'
        errorKey.value = invalidKey
        return
      }

      if (report.missing <= 0) {
        importResult.value = {
          ok: true,
          imported: 0,
          skipped: report.present,
          failed: 0,
          total: 0,
          reason: 'nothing-to-import',
        }
        await reconcileLibraryListing()
        phase.value = 'done'
        return
      }

      phase.value = 'importing'
      paused.value = false
      liveReconciledImported = 0
      liveReconcileAt = 0
      unsubProgress = bridge.legacyMedia.onImportProgress((payload) => {
        progress.value = payload
        liveReconcile(payload.imported ?? 0)
      })

      const result = await bridge.legacyMedia.import(sourcePath)
      importResult.value = result
      unsubProgress?.()
      unsubProgress = null

      if (!result.ok) {
        phase.value = 'error'
        errorKey.value = result.reason === 'not-found' ? invalidKey : 'settings.general.legacyMediaError'
        return
      }

      await reconcileLibraryListing()
      phase.value = 'done'
    } catch (err) {
      console.error('[legacy-media] import falhou', err)
      phase.value = 'error'
      errorKey.value = 'settings.general.legacyMediaError'
    } finally {
      unsubProgress?.()
      paused.value = false
    }
  }

  async function runManualImport() {
    const bridge = getDesktopBridge()
    if (!bridge?.legacyMedia?.pickFolder || busy.value) return
    const selected = await bridge.legacyMedia.pickFolder()
    if (!selected) return
    await runImport(selected)
  }

  /** Arquivo compactado baixado do site: importa direto dele, sem extrair. */
  async function runArchiveImport() {
    const bridge = getDesktopBridge()
    if (!bridge?.legacyMedia?.pickArchive || busy.value) return
    const selected = await bridge.legacyMedia.pickArchive()
    if (!selected) return
    await runImport(selected)
  }

  async function pause() {
    if (phase.value !== 'importing' || paused.value) return
    if (await getDesktopBridge()?.legacyMedia?.pause?.()) paused.value = true
  }

  async function resume() {
    if (phase.value !== 'importing' || !paused.value) return
    if (await getDesktopBridge()?.legacyMedia?.resume?.()) paused.value = false
  }

  /** Parar: o que já foi copiado fica; escolher a pasta de novo continua de onde parou. */
  async function stop() {
    if (phase.value !== 'importing') return
    await getDesktopBridge()?.legacyMedia?.cancel?.()
    paused.value = false
  }

  return {
    phase,
    analysis,
    importResult,
    progress,
    reconcileMarked,
    paused,
    errorKey,
    busy,
    progressPercent,
    runImport,
    runManualImport,
    runArchiveImport,
    pause,
    resume,
    stop,
  }
})
