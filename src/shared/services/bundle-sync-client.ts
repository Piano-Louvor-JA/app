/**
 * Bundle-first sync — SPEC piano-bundle-sync v1.2.0 (ADR-09/10/11).
 *
 * Fluxo por artifact (`catalog` | `bible`):
 *   1. Estado 24h: checkedAt < 24h e sem `force` => 0 requests.
 *   2. GET {bundles-origin}/db/manifest — JSON array entry-wise real
 *      ({file, table, path, hash}); validação estrita invalida o
 *      MANIFEST inteiro (sync aborta, cache mantido, 0 GET de ZIP).
 *   3. Digest SHA-256 da serialização canônica (`file\tmd5\n` ordenado)
 *      igual ao `manifestDigest` aplicado => só checkedAt, 0 GET do ZIP.
 *   4. Digest divergente => 1 GET do ZIP fixo do artifact na origem
 *      bundles (`/db/catalog-bundle` | `/db/bible-bundle`).
 *   5. ZIP validado EM STAGING (ADR-10): estrutura segura,
 *      `_bundle_manifest` (schema_version 1, kind = artifact), completude
 *      subset⊆ZIP e congruência MD5 entry-wise — UM arquivo divergente
 *      invalida o bundle inteiro — antes da aplicação ATÔMICA
 *      (workspace-bundle-apply); só então o estado novo é gravado.
 *
 * Origem: ADR-11 — `/db/*` vem de `VITE_URL_BUNDLES` (default
 * https://api.louvorja.com.br), nunca derivada de `VITE_URL_DATABASE`;
 * nenhuma URL é construída de campos do payload (`path` é informativo).
 *
 * Qualquer falha retorna `null` SEM tocar no cache existente — o chamador
 * decide cair no fluxo legado item-a-item (ADR-03: fallback nunca dispara
 * varredura de IDs/capítulos).
 */
import {
  resolveBundlesUrl,
  readBundleSyncState,
  writeBundleSyncState,
} from '@shared/services/workspace-api'
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

type ManifestEntry = {
  file?: unknown
  table?: unknown
  path?: unknown
  hash?: unknown
}

/** Padrões de chave conhecidos do bundle (conteúdo desconhecido é ignorado). */
const CATALOG_KEY_PATTERN =
  /^(?:pt|es)_(?:categories|musics|hymnal|hymnal_\d+|bible_book|bible_version)$|^music_\d+$|^album_\d+$|^config$/
const BIBLE_KEY_PATTERN = /^bible_[a-z0-9]+_\d+_\d+$/

function bundleKeyPattern(artifact: BundleSyncArtifact): RegExp {
  return artifact === 'catalog' ? CATALOG_KEY_PATTERN : BIBLE_KEY_PATTERN
}

/**
 * ADR-09: valida o array entry-wise real e retorna o subset do artifact
 * como mapa `key` (file sem .json) => entry. Qualquer violação (não-array,
 * vazio, entry inválida, hash não-MD5, `file` duplicado/inseguro) invalida
 * o MANIFEST inteiro. Entradas fora do padrão do artifact são ignoradas.
 */
export function parseManifest(
  body: unknown,
  artifact: BundleSyncArtifact,
): Record<string, ManifestEntry> | null {
  if (!Array.isArray(body) || body.length === 0) return null
  const pattern = bundleKeyPattern(artifact)
  const subset: Record<string, ManifestEntry> = {}
  const seenFiles = new Set<string>()
  for (const entry of body) {
    if (typeof entry !== 'object' || entry == null) return null
    const e = entry as ManifestEntry
    const { file, hash } = e
    if (typeof file !== 'string' || typeof hash !== 'string') return null
    if (!file.endsWith('.json')) return null
    if (file.includes('/') || file.includes('..') || file.includes('\\')) return null
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(file)) return null
    if (!MD5_PATTERN.test(hash)) return null
    if (seenFiles.has(file)) return null
    seenFiles.add(file)
    const key = file.slice(0, -'.json'.length)
    if (pattern.test(key)) subset[key] = e
  }
  return subset
}

/**
 * ADR-09: `manifestDigest` = SHA-256 (hex lowercase) da serialização
 * canônica do subset: linhas `file\tmd5\n` ordenadas byte-a-byte (UTF-8)
 * por `file`.
 */
export async function manifestDigestOf(
  subset: Record<string, ManifestEntry>,
): Promise<string> {
  const encoder = new TextEncoder()
  const canonical = Object.values(subset)
    .map((e) => `${e.file as string}\t${e.hash as string}`)
    .sort((a, b) => {
      const ab = encoder.encode(a)
      const bb = encoder.encode(b)
      const n = Math.min(ab.length, bb.length)
      for (let i = 0; i < n; i++) {
        if (ab[i] !== bb[i]) return ab[i]! - bb[i]!
      }
      return ab.length - bb.length
    })
    .map((l) => `${l}\n`)
    .join('')
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(new TextEncoder().encode(canonical)).digest('hex')
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
 * ADR-10: valida o ZIP baixado EM STAGING antes da aplicação:
 *  1. estrutura segura (sem caminho absoluto, `..`, `\`; entradas .json);
 *  2. `_bundle_manifest.json` com schema_version === 1 e kind === artifact;
 *  3. completude: todo entry do subset está presente no ZIP;
 *  4. congruência entry-wise: MD5 dos bytes === hash do manifest — um
 *     único divergente invalida o bundle INTEIRO.
 * Retorna null quando inválido.
 */
async function extractBundleRecords(
  bytes: Uint8Array,
  artifact: BundleSyncArtifact,
  subset: Record<string, ManifestEntry>,
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
    if (!name.endsWith('.json')) return null
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

  const remaining = new Map(Object.entries(subset))
  const records: Record<string, unknown> = {}
  let hasChapter = false
  for (const [name, raw] of Object.entries(entries)) {
    if (name === '_bundle_manifest.json') continue
    const key = name.slice(0, -'.json'.length)
    const expected = remaining.get(key)
    if (expected == null) continue // fora do subset do artifact: ignorado
    let parsed: unknown
    try {
      parsed = JSON.parse(strFromU8(raw))
    } catch {
      return null
    }
    // ADR-10 item 4: congruência entry-wise — um divergente invalida tudo.
    if ((await md5OfBytes(raw)) !== expected.hash) return null
    remaining.delete(key)
    records[key] = parsed
    if (artifact === 'bible') hasChapter = true
  }

  // ADR-10 item 3: completude — entry do subset ausente no ZIP invalida.
  if (remaining.size > 0) return null

  // Essenciais (ADR-10 item 5): catálogo exige os índices pt_categories,
  // pt_musics e config.json; Bíblia exige ao menos um capítulo.
  if (artifact === 'catalog') {
    if (!('pt_categories' in records)) return null
    if (!('pt_musics' in records)) return null
    if (!('config' in records)) return null
  }
  if (artifact === 'bible' && !hasChapter) return null

  return records
}

async function fetchManifestResponse(): Promise<Response | null> {
  try {
    const response = await fetch(resolveBundlesUrl('/db/manifest'), {
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

  // RF-20: dentro da janela de 24h, sem ação manual => 0 requests.
  if (
    !options.force &&
    state != null &&
    state.schema === 2 &&
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

  const subset = parseManifest(manifestBody, artifact)
  if (subset == null) return null

  const digest = await manifestDigestOf(subset)

  // RF-20: digest igual ao aplicado => 0 GET do ZIP; só atualiza checkedAt.
  if (state != null && state.manifestDigest === digest) {
    const checked: BundleSyncState = { ...state, checkedAtEpochMs: now }
    await writeBundleSyncState(artifact, checked)
    return { status: 'up-to-date' }
  }

  // ADR-11: URL fixa do artifact na origem bundles — nunca URL do payload.
  const bundlePath = artifact === 'catalog' ? '/db/catalog-bundle' : '/db/bible-bundle'
  let zipResponse: Response
  try {
    zipResponse = await fetch(resolveBundlesUrl(bundlePath), {
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

  const records = await extractBundleRecords(bytes, artifact, subset)
  if (records == null) return null

  // ADR-10: aplicação atômica; estado novo SÓ depois de aplicado.
  const applied = await applyWorkspaceRecordsAtomic(records)
  if (!applied) return null

  await writeBundleSyncState(artifact, {
    manifestDigest: digest,
    checkedAtEpochMs: now,
    appliedAtEpochMs: now,
    schema: 2,
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
