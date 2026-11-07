/**
 * Store reativa do download em background (T5/SPEC R2).
 * Alimentada pelos eventos IPC do MAIN (download-progress etc. via bridge).
 * Web (sem bridge downloadBatch): estado idle permanente, sem erros.
 */
import { defineStore } from 'pinia'
import { getDesktopBridge } from '@shared/services/desktop-bridge'

export const useDownloadStore = defineStore('download-batch-ui', {
  state: () => ({
    active: false,
    done: 0,
    total: 0,
    currentFileName: '',
    currentPercent: 0,
    failedCount: 0,
    _initialized: false,
    _unsubs: [] as Array<() => void>,
  }),

  getters: {
    /** % global do batch (0 quando sem progresso). */
    percent(): number {
      if (this.total <= 0) return 0
      const base = (this.done / this.total) * 100
      const slice = this.total > 0 ? 100 / this.total : 0
      const currentPart = this.currentPercent > 0 ? (slice * this.currentPercent) / 100 : 0
      return Math.min(100, Math.round(base + currentPart))
    },
  },

  actions: {
    async init() {
      if (this._initialized) return
      const bridge = getDesktopBridge()?.downloadBatch
      if (!bridge) return
      this._initialized = true

      this._unsubs.push(
        bridge.onProgress((p) => {
          this.total = p.total
          this.done = p.done
          this.active = p.total > 0 && (p.done < p.total || p.current !== null)
          this.currentFileName = p.current?.fileName ?? ''
          const cur = p.current
          if (cur && cur.totalBytes > 0) {
            this.currentPercent = Math.round((cur.receivedBytes / cur.totalBytes) * 100)
          } else if (!cur) {
            this.currentPercent = 0
          }
        }),
        bridge.onItemFailed(() => {
          this.failedCount += 1
        }),
        bridge.onBatchDone((p) => {
          this.done = p.done
          this.total = p.total
          this.active = false
          this.currentFileName = ''
          this.currentPercent = 0
        }),
        bridge.onItemDone(() => {
          this.currentPercent = 0
        }),
      )

      try {
        const pending = await bridge.pending()
        if (pending.length > 0) {
          // Reabriu o app com fila pendente: indica que há downloads retomados.
          this.total = pending.length
          this.active = true
        }
      } catch {
        // main sem fila: segue idle
      }
    },

    async cancel(id: string) {
      await getDesktopBridge()?.downloadBatch?.cancel(id)
    },

    async retry(id: string) {
      await getDesktopBridge()?.downloadBatch?.retry(id)
    },
  },
})
