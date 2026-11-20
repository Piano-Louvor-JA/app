// Notificação OS de conclusão de batch de downloads (T2/SPEC R3).
// Fire-and-forget: falha de notificação nunca derruba o download.
import { Notification } from 'electron'

const MESSAGES = {
  'pt-BR': {
    titleAllDone: 'Downloads concluídos',
    titleWithFailures: 'Downloads concluídos com falhas',
    allDone: (done, total) => `${done} de ${total}`,
    withFailures: (done, failed, total) => `${done} concluídos, ${failed} falhou de ${total}`,
  },
  es: {
    titleAllDone: 'Descargas completadas',
    titleWithFailures: 'Descargas completadas con errores',
    allDone: (done, total) => `${done} de ${total}`,
    withFailures: (done, failed, total) => `${done} completadas, ${failed} falló de ${total}`,
  },
  en: {
    titleAllDone: 'Downloads complete',
    titleWithFailures: 'Downloads finished with failures',
    allDone: (done, total) => `${done} of ${total}`,
    withFailures: (done, failed, total) => `${done} done, ${failed} failed of ${total}`,
  },
  fr: {
    titleAllDone: 'Téléchargements terminés',
    titleWithFailures: 'Téléchargements terminés avec des erreurs',
    allDone: (done, total) => `${done} sur ${total}`,
    withFailures: (done, failed, total) => `${done} terminés, ${failed} échoué sur ${total}`,
  },
}

export function formatBatchMessage({ done, failed, total }, locale = 'pt-BR') {
  const pack = MESSAGES[locale] || MESSAGES['pt-BR']
  if (failed > 0) return pack.withFailures(done, failed, total)
  return pack.allDone(done, total)
}

export function notifyDownloadComplete(summary, locale = 'pt-BR') {
  try {
    const pack = MESSAGES[locale] || MESSAGES['pt-BR']
    const title = summary.failed > 0 ? pack.titleWithFailures : pack.titleAllDone
    const body = formatBatchMessage(summary, locale)
    new Notification({ title, body }).show()
  } catch (error) {
    console.error('[download-notify]', error)
  }
}
