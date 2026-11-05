/**
 * Bundle-first sync — SPEC piano-bundle-sync v1.0.0 (ADR-01/02/03).
 *
 * Fluxo por artifact (`catalog` | `bible`):
 *   1. Estado 24h: checkedAt < 24h e sem `force` => 0 requests.
 *   2. GET {database-origin}/db/manifest — validação estrita (schema===1,
 *      md5 /^[a-f0-9]{32}$/, bytes>0, url caminho absoluto /db/).
 *   3. MD5 igual ao estado => atualiza só checkedAt, 0 GET do ZIP.
 *   4. MD5 novo => GET {origin}{url} (nunca cross-origin do manifest),
 *      Content-Type application/zip, MD5 dos bytes conferido.
 *   5. ZIP validado (_bundle_manifest + JSON seguro) e aplicado de forma
 *      ATÔMICA (workspace-bundle-apply) — só então o estado novo é gravado.
 *
 * Qualquer falha retorna `null` SEM tocar no cache
 * existente — o chamador decide cair no fluxo legado item-a-item (ADR-03:
 * fallback nunca dispara varredura de IDs/capítulos).
 */
import { resolveDatabaseUrl, readBundleSyncState, writeBundleSyncState } from '@shared/services/workspace-api'
import type { BundleSyncArtifact, BundleSyncState } from '@shared/services/workspace-api'
import {
  readWorkspaceRecords,
  applyWorkspaceRecordsAtomic,
} from '@shared/services/workspace-bundle-apply'

const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000
const MD5_PATTERN = /^[a-f0-9]{32}$/

export type BundleSyncResult =
  | { status: 'up-to-date' }
  | { records: Record<string, unknown> }
  | null

type ManifestArtifact = { url?: unknown; md5?: unknown; bytes?: unknown }
type ManifestBody = {
  schema?: unknown
  artifacts?: Partial<Record<BundleSyncArtifact, ManifestArtifact>>
}

/** Padrões de chave conhecidos do bundle (conteúdo desconhecido é ignorado). */
const CATALOG_KEY_PATTERN =
  /^(?:pt|es)_(?:categories|musics|hymnal|hymnal_\d+|bible_book|bible_version)$|^music_\d+$|^album_\d+$/
const BIBLE_KEY_PATTERN = /^bible_[a-z0-9]+_\d+_\d+$/

function bundleKeyPattern(artifact: BundleSyncArtifact): RegExp {
  return artifact === 'catalog' ? CATALOG_KEY_PATTERN : BIBLE_KEY_PATTERN
}

/** ADR-01: rejeita manifest malformado ou com URL fora de /db/. */
function parseManifest(body: unknown, artifact: BundleSyncArtifact):
  | { ok: true; md5: string; path: string }
  | { ok: false } {
  if (typeof body !== 'object' || body == null) return { ok: false }
  const manifest = body as ManifestBody
  if (manifest.schema !== 1) return { ok: false }
  const entry = manifest.artifacts?.[artifact]
  if (typeof entry !== 'object' || entry == null) return { ok: false }
  if (typeof entry.md5 !== 'string' || !MD5_PATTERN.test(entry.md5)) {
    return { ok: false }
  }
  if (typeof entry.bytes !== 'number' || !(entry.bytes > 0)) return { ok: false }
  if (typeof entry.url !== 'string') return { ok: false }
  // Caminho absoluto /db/ apenas — nunca seguir URL cross-origin enviada.
  if (!entry.url.startsWith('/db/')) return { ok: false }
  return { ok: true, md5: entry.md5, path: entry.url }
}

async function md5OfBytes(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('md5').update(bytes).digest('hex')
}

type BundleManifestFile = {
  schema_version?: unknown
  kind?: unknown
  files?: unknown
}

/**
 * ADR-02: valida o ZIP baixado e extrai os registros JSON conhecidos.
 * Qualquer JSON inválido, caminho inseguro ou `_bundle_manifest` ausente
 * invalida o bundle INTEIRO. Retorna null quando inválido.
 */
async function extractBundleRecords(
  bytes: Uint8Array,
  artifact: BundleSyncArtifact,
): Promise<Record<string, unknown> | null> {
  const { unzipSync, strFromU8 } = await import('fflate')

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    return null
  }

  for (const name of Object.keys(entries)) {
    if (name.startsWith('/') || name.includes('..') || name.includes('\\')) {
      return null
    }
  }

  const bundleManifestRaw = entries['_bundle_manifest.json']
  if (!bundleManifestRaw) return null
  let bundleManifest: BundleManifestFile
  try {
    bundleManifest = JSON.parse(strFromU8(bundleManifestRaw)) as BundleManifestFile
  } catch {
    return null
  }
  if (bundleManifest.schema_version !== 1) return null
  if (bundleManifest.kind !== artifact) return null

  const keyPattern = bundleKeyPattern(artifact)
  const records: Record<string, unknown> = {}
  let hasChapter = false
  for (const [name, raw] of Object.entries(entries)) {
    if (name === '_bundle_manifest.json') continue
    if (!name.endsWith('.json')) continue
    const key = name.slice(0, -'.json'.length)
    let parsed: unknown
    try {
      parsed = JSON.parse(strFromU8(raw))
    } catch {
      return null
    }
    // Conteúdo desconhecido pode ser ignorado; só chaves conhecidas aplicam.
    if (!keyPattern.test(key)) continue
    records[key] = parsed
    if (artifact === 'bible') hasChapter = true
  }

  // Chave essencial ausente invalida o bundle (ADR-02): catálogo exige o
  // índice pt_musics; Bíblia exige ao menos um capítulo bible_<v>_<b>_<c>.
  if (artifact === 'catalog' && !('pt_musics' in records)) return null
  if (artifact === 'bible' && !hasChapter) return null

  return records
}

async function fetchManifestResponse(): Promise<Response | null> {
  try {
    const response = await fetch(resolveDatabaseUrl('/db/manifest'), {
      headers: { Accept: 'application/json' },
    })
    return response.ok ? response : null
  } catch {
    return null
  }
}

/**
 * Executa o ciclo completo de sync do artifact. Nunca lança; em falha
 * devolve `null` e o cache local permanece intacto (RF-05/RF-06).
 */
export async function syncBundle(
  artifact: BundleSyncArtifact,
  options: { force?: boolean } = {},
): Promise<BundleSyncResult> {
  const state = await readBundleSyncState(artifact)
  const now = Date.now()

  // RF-01: dentro da janela de 24h, sem ação manual => 0 requests.
  if (
    !options.force &&
    state != null &&
    state.schema === 1 &&
    now - state.checkedAtEpochMs < MANIFEST_TTL_MS
  ) {
    return { status: 'up-to-date' }
  }

  const manifestResponse = await fetchManifestResponse()
  if (!manifestResponse) return null

  let manifestBody: unknown
  try {
    manifestBody = await manifestResponse.json()
  } catch {
    return null
  }

  const manifest = parseManifest(manifestBody, artifact)
  if (!manifest.ok) return null

  // RF-02: MD5 igual => 0 GET do ZIP; só atualiza checkedAt.
  if (state != null && state.md5 === manifest.md5) {
    const checked: BundleSyncState = { ...state, checkedAtEpochMs: now }
    await writeBundleSyncState(artifact, checked)
    return { status: 'up-to-date' }
  }

  // ADR-01: URL do manifest é caminho absoluto na origem do database.
  let zipResponse: Response
  try {
    zipResponse = await fetch(resolveDatabaseUrl(manifest.path), {
      headers: { Accept: 'application/zip' },
    })
  } catch {
    return null
  }
  if (!zipResponse.ok) return null
  const contentType = zipResponse.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().includes('zip')) {
    return null
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await zipResponse.arrayBuffer())
  } catch {
    return null
  }

  // RF-02/RF-05: MD5 divergente => descarta, sem tocar no cache.
  if ((await md5OfBytes(bytes)) !== manifest.md5) {
    return null
  }

  const records = await extractBundleRecords(bytes, artifact)
  if (records == null) return null

  // ADR-02: aplicação atômica; estado novo SÓ depois de aplicado.
  const applied = await applyWorkspaceRecordsAtomic(records)
  if (!applied) return null

  await writeBundleSyncState(artifact, {
    md5: manifest.md5,
    checkedAtEpochMs: now,
    appliedAtEpochMs: now,
    schema: 1,
  })

  return { records }
}

/**
 * Lê registros já sincronizados (bridge de teste/leitura direta).
 * Reexposto para os consumidores item-a-item checarem o bundle antes de
 * irem à rede (RF-03/RF-04).
 */
export async function readBundleRecords(
  artifact: BundleSyncArtifact,
): Promise<Record<string, unknown> | null> {
  return readWorkspaceRecords(artifact)
}
