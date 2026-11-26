import { ref } from 'vue'

import {
  liturgyExportFileName,
  parseLiturgyImport,
  type LiturgyExport,
} from '../services/liturgy-transfer'

/**
 * Exportar/importar a liturgia da semana pela tela: baixa o .json e, ao
 * importar, pergunta (substituir / acrescentar / cancelar) quando a semana
 * já tem itens.
 */
export function useLiturgyTransfer(deps: {
  exportLiturgy: () => LiturgyExport
  importLiturgy: (data: LiturgyExport, mode: 'replace' | 'append') => void
  hasContent: () => boolean
}) {
  const messageKey = ref<string | null>(null)
  const confirmOpen = ref(false)
  let pending: LiturgyExport | null = null

  function exportFile(now = new Date()) {
    const payload = JSON.stringify(deps.exportLiturgy(), null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = liturgyExportFileName(now)
    link.click()
    URL.revokeObjectURL(url)
    messageKey.value = 'liturgy.transfer.exported'
  }

  function apply(data: LiturgyExport, mode: 'replace' | 'append') {
    deps.importLiturgy(data, mode)
    messageKey.value = 'liturgy.transfer.imported'
  }

  async function importFile(file: File) {
    const parsed = parseLiturgyImport(await file.text())
    if (!parsed.ok) {
      messageKey.value = parsed.error === 'version' ? 'liturgy.transfer.version' : 'liturgy.transfer.invalid'
      return
    }
    if (!deps.hasContent()) {
      apply(parsed.data, 'replace')
      return
    }
    pending = parsed.data
    confirmOpen.value = true
  }

  function confirm(mode: 'replace' | 'append') {
    confirmOpen.value = false
    if (pending) apply(pending, mode)
    pending = null
  }

  function cancel() {
    confirmOpen.value = false
    pending = null
  }

  return { messageKey, confirmOpen, exportFile, importFile, confirm, cancel }
}
