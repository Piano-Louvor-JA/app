import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import {
  clearWorkspace,
  readCatalogRecord,
  writeCatalogRecord,
} from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

export type BootstrapCompleteFlag = {
  complete: boolean
}

/**
 * app#337: progresso POR ARQUIVO do first-boot. O bootstrap antigo era
 * all-or-nothing — perder o foco da janela (throttle de timers em bg)
 * abortava no meio e o próximo boot re-baixava tudo. Com a lista de
 * arquivos concluídos persistida, o loop pula o que já está em disco e
 * retoma de onde parou.
 */
export type BootstrapFilesFlag = {
  files: string[]
}

const BOOTSTRAP_FILES_KEY = 'bootstrapComplete.files' as const

function essentialFiles(lang: string): string[] {
  return [
    `${lang}_categories`,
    `${lang}_hymnal`,
    `${lang}_hymnal_1996`,
    `${lang}_musics`,
    `${lang}_bible_book`,
    `${lang}_bible_version`,
  ]
}

async function readBootstrapFiles(): Promise<Set<string>> {
  const flag = await readCatalogRecord<BootstrapFilesFlag>(BOOTSTRAP_FILES_KEY)
  return new Set(Array.isArray(flag?.files) ? flag.files : [])
}

/** Reconstitui o marcador em instalações interrompidas de versões antigas. */
async function readStoredEssentialFiles(lang: string): Promise<Set<string>> {
  const entries = await Promise.all(
    essentialFiles(lang).map(async (file) => [file, await readCatalogRecord(file)] as const),
  )
  return new Set(entries.filter(([, data]) => data !== null).map(([file]) => file))
}

async function resumableBootstrapFiles(lang: string): Promise<Set<string>> {
  const marked = await readBootstrapFiles()
  const stored = await readStoredEssentialFiles(lang)
  // O disco é a fonte de verdade: marcador sem arquivo nunca pode pular download.
  if (stored.size > 0 && (stored.size !== marked.size || [...stored].some((file) => !marked.has(file)))) {
    await writeCatalogRecord(BOOTSTRAP_FILES_KEY, { files: [...stored] })
  }
  return stored
}

async function addBootstrapFile(file: string): Promise<void> {
  const done = await readBootstrapFiles()
  done.add(file)
  await writeCatalogRecord(BOOTSTRAP_FILES_KEY, { files: [...done] })
}

export function mapBootstrapError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'starting.status.errorOffline'
  }
  if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
    return 'starting.status.errorRateLimit'
  }
  if (message.includes('Bridge Electron') || message.includes('indisponível')) {
    return 'starting.status.bridgeMissing'
  }
  if (
    message.includes('baixar banco') ||
    message.includes('Falha ao baixar') ||
    message.includes('api-fallback') ||
    message.includes('api-exhausted')
  ) {
    return 'starting.status.errorDownload'
  }
  if (
    message.includes('extrair') ||
    message.includes('extração') ||
    message.includes('Arquivo não encontrado')
  ) {
    return 'starting.status.errorExtract'
  }
  if (message.includes('Servidor retornou erro')) {
    return 'starting.status.errorServer'
  }

  return 'starting.status.error'
}

export async function isBootstrapComplete(): Promise<boolean> {
  const flag = await readCatalogRecord<BootstrapCompleteFlag>(
    WORKSPACE_RECORD_KEYS.bootstrapComplete,
  )
  if (!flag?.complete) return false
  const lang = getCurrentApiPrefix()
  // Flag antiga sem marcador não prova integridade: valida os arquivos reais.
  const files = await resumableBootstrapFiles(lang)
  return essentialFiles(lang).every((file) => files.has(file))
}

export async function markBootstrapComplete(): Promise<void> {
  await writeCatalogRecord(WORKSPACE_RECORD_KEYS.bootstrapComplete, { complete: true })
}

export async function prepareFreshInstall(): Promise<void> {
  // Não apaga uma instalação que já baixou algo: retoma no arquivo pendente.
  if ((await resumableBootstrapFiles(getCurrentApiPrefix())).size > 0) return
  // Preserva Media (capas/músicas) se já existir de outra instalação no mesmo path.
  await clearWorkspace({ preserveMedia: true })
}

export async function syncRemoteConfig(): Promise<void> {
  const config = await fetchRemoteCatalogJson(WORKSPACE_RECORD_KEYS.config)
  await writeCatalogRecord(WORKSPACE_RECORD_KEYS.config, config)
}

/**
 * First-boot via API Piano (`/json_db`): índices essenciais em disco.
 * Substitui o pipeline legado FTP + SQLite + CatalogExtractor.
 * Detalhes (`music_*`, `album_*`, capítulos bíblia) ficam on-demand.
 */
export async function syncEssentialCatalogFromApi(
  onProgress: (progress: number) => void,
  options?: { apiPrefix?: string },
): Promise<void> {
  const lang = options?.apiPrefix ?? getCurrentApiPrefix()
  const files = essentialFiles(lang)

  // app#337: retomada — pula os arquivos já persistidos em boot anterior
  // (perda de foco/rede no meio não joga o trabalho fora).
  const done = await resumableBootstrapFiles(lang)
  const pending = files.filter((f) => !done.has(f))
  const alreadyDone = files.length - pending.length
  if (pending.length === 0) {
    onProgress(100)
    return
  }

  for (let i = 0; i < pending.length; i++) {
    const file = pending[i]
    const data = await fetchRemoteCatalogJson(file)
    const saved = await writeCatalogRecord(file, data)
    if (!saved && !getDesktopBridge()) {
      throw new Error('Bridge Electron indisponível')
    }
    if (!saved) {
      throw new Error(`Falha ao gravar catálogo local: ${file}`)
    }
    // Persiste ANTES do próximo download (a falha no meio não perde o que
    // já gravou) — é o que permite a retomada por arquivo.
    await addBootstrapFile(file)
    onProgress(
      Math.round(((alreadyDone + i + 1) / files.length) * 100),
    )
  }
}

/** @deprecated Use syncEssentialCatalogFromApi — mantido só por compat de imports. */
export async function downloadAndExtractCatalog(
  onDownloadProgress: (progress: number) => void,
  _onExtractProgress: (progress: number, text?: string) => void,
): Promise<void> {
  await syncEssentialCatalogFromApi(onDownloadProgress)
}
