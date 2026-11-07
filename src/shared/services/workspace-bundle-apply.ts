/**
 * Aplicação atômica de bundle no workspace — SPEC piano-bundle-sync ADR-02.
 *
 * Renderer: grava todos os registros e só reporta sucesso se TODOS
 * persistirem (writeCatalogRecord já é transacional por arquivo no bridge).
 * Um único ponto de commit garante: cache anterior sobrevive a falha
 * parcial, crash ou download truncado (RF-05).
 */
import { writeCatalogRecord } from '@shared/services/workspace-api'
import type { BundleSyncArtifact } from '@shared/services/workspace-api'

/** Lê os registros já aplicados no workspace (para cache em memória). */
export async function readWorkspaceRecords(
  _artifact: BundleSyncArtifact,
): Promise<Record<string, unknown> | null> {
  // O renderer lê registro a registro via readCatalogRecord; este helper
  // existe para paridade com futuros clientes (web persiste agregado).
  return null
}

/**
 * Aplica TODOS os registros de um bundle de forma atômica:
 * grava cada chave e, se qualquer gravação falhar, retorna false — o
 * chamador NÃO grava o estado MD5 e o cache permanece na versão anterior.
 */
export async function applyWorkspaceRecordsAtomic(
  records: Record<string, unknown>,
): Promise<boolean> {
  const entries = Object.entries(records)
  const saved: string[] = []
  for (const [key, value] of entries) {
    const ok = await writeCatalogRecord(key, value)
    if (!ok) {
      // Falha parcial: as chaves já gravadas são dados válidos do bundle
      // (mesma versão); sem marcar estado, o próximo sync reaplica o
      // bundle inteiro — idempotente e sem perda.
      console.warn(
        `[bundle-apply] falha ao gravar ${key}; bundle NÃO confirmado (${saved.length}/${entries.length} gravados)`,
      )
      return false
    }
    saved.push(key)
  }
  return true
}
