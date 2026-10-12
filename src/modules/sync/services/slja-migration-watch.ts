import { getAuthSession } from '@modules/media/services/auth-client'
import { appConfirm } from '@shared/composables/useAppConfirm'
import i18n from '@plugins/i18n'
import {
  localSljaMigrationCandidates,
  runSljaMigration,
} from './local-slja-migration'

/**
 * sync v2 fase 3 — watcher de login: quando o usuário ganha sessão real,
 * oferece UMA vez migrar os .slja importados offline pra conta.
 *
 * - sem locais → nunca pergunta
 * - pergunta 1x por sessão (marca oferecido tanto ao aprovar quanto
 *   recusar — não re-pergunta a cada navegação)
 * - nunca bloqueia o fluxo do app (fire-and-forget com catch)
 */

let watching = false
let lastSessionToken: string | null = null

export function startSljaMigrationWatch(): void {
  if (watching) return
  watching = true

  // poll leve: login muda a sessão (eventos de auth não são expostos globalmente)
  const timer = setInterval(() => {
    void checkAndOffer().catch(() => {})
  }, 15_000)

  // encerra com a página (web/app recarregam — ok)
  window.addEventListener('beforeunload', () => {
    clearInterval(timer)
  })
}

async function checkAndOffer(): Promise<void> {
  const session = getAuthSession()
  const token = session?.token ?? null

  // logout → reseta pra poder oferecer no próximo login
  if (!token) {
    lastSessionToken = null
    return
  }
  // mesma sessão → nada a fazer
  if (token === lastSessionToken) return
  lastSessionToken = token

  const candidates = localSljaMigrationCandidates()
  if (candidates.length === 0) return

  const approved = await appConfirm({
    title: i18n.global.t('sync.sljaMigration.title', { count: candidates.length }),
    message: i18n.global.t('sync.sljaMigration.message'),
    confirmLabel: i18n.global.t('sync.sljaMigration.confirm'),
    cancelLabel: i18n.global.t('sync.sljaMigration.cancel'),
  }).catch(() => false)

  await runSljaMigration(candidates, {
    confirmUpload: async () => approved,
  })
}
