// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * bundle-sync-client — SPEC piano-bundle-sync v1.2.0 (ADR-09/10/11).
 *
 * RF-19: manifest array entry-wise validado — entry inválida, hash não-MD5,
 *         `file` duplicado/inseguro => sync abortado, cache mantido, 0 ZIP.
 * RF-20: warm gate entry-wise — digest igual ao aplicado => 0 GET de ZIP;
 *         <24h => 0 requests; só `checkedAt` muda.
 * RF-21: cold/changed — 1 manifest + 1 ZIP por artifact divergente; MD5 por
 *         arquivo conferido; completude subset⊆ZIP; essenciais presentes;
 *         estado novo só após aplicação atômica.
 * RF-22: origem — `/db/*` exclusivamente de `VITE_URL_BUNDLES` (default
 *         upstream público); nenhuma URL de payload usada.
 *
 * Fixture derivada de probe HTTP real (2026-11-06, api.louvorja.com.br):
 * - manifest: array de 18.060 entries `{file, table, path, hash}` (MD5
 *   32-hex lower); subsets: catalog 2.603 / bible 15.457.
 * - ZIPs: `application/zip`; `_bundle_manifest.json`
 *   `{schema_version:1, kind:'catalog'|'bible', files:[{name,bytes,sha256}]}`.
 * - Digests reais (SHA-256 da serialização canônica):
 *   catalog ed6fb62786044118ac7c4d0bcb0eb6c440a5ddbce91255e5e406a91b3a1702e1
 *   bible   d26650abbd18b0793a3a3693a9c556f63efc1d2e3e570064f4728486e4714772
 */

const mocks = vi.hoisted(() => {
  const state = {
    origin: 'https://api.louvorja.com.br',
    fetch: vi.fn(),
    bundlesUrl: vi.fn(
      (path: string) => `https://api.louvorja.com.br${path}`,
    ),
    readRecords: vi.fn(async () => null as Record<string, unknown> | null),
    readState: vi.fn(async () => null as unknown),
    applyRecords: vi.fn(async (_records: Record<string, unknown>) => true),
  }
  return { state }
})

vi.mock('@shared/services/workspace-api', () => ({
  resolveBundlesUrl: (path: string) => mocks.state.bundlesUrl(path),
  readBundleSyncState: mocks.state.readState,
  writeBundleSyncState: vi.fn(),
}))

vi.mock('@shared/services/workspace-bundle-apply', () => ({
  readWorkspaceRecords: mocks.state.readRecords,
  applyWorkspaceRecordsAtomic: mocks.state.applyRecords,
}))

import { syncBundle, parseManifest, manifestDigestOf } from '../bundle-sync-client'
import { readBundleSyncState } from '@shared/services/workspace-api'

const HOUR = 3_600_000
const MD5_A = 'a'.repeat(32)

type Entry = { file: string; table: string; path: string; hash: string }

function entry(file: string, hash = MD5_A): Entry {
  const key = file.replace(/\.json$/, '')
  return { file, table: key, path: `/db/${key}`, hash }
}

/** Amostra REAL do probe (2026-11-06): */
const PROBE_ENTRY: Entry = {
  file: 'bible_10_100_1.json',
  table: 'bible_10_100_1',
  path: '/db/bible_10_100_1',
  hash: '115b3ef31c499af129e3de5a55e56270',
}

function manifestResponse(entries: unknown): Response {
  return new Response(JSON.stringify(entries), { status: 200 })
}

/** Manifest mínimo válido para o subset catalog (fixture probe-like). */
function catalogManifest(): Entry[] {
  return [
    entry('pt_categories.json', 'c'.repeat(32)),
    entry('pt_musics.json', 'd'.repeat(32)),
    entry('config.json', 'e'.repeat(32)),
    entry('music_1.json', '1'.repeat(32)),
    entry('bible_10_100_1.json', PROBE_ENTRY.hash), // fora do subset catalog
    entry('unknown_thing.json', 'f'.repeat(32)), // ignorada (sem fail)
  ]
}

function bibleManifest(): Entry[] {
  return [entry('bible_10_100_1.json', PROBE_ENTRY.hash)]
}

function zipResponse(bytes: Uint8Array): Response {
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: { 'Content-Type': 'application/zip' },
  })
}

/** ZIP no formato real do probe: `_bundle_manifest.json` + JSONs.
 * Retorna também as entries de manifest REAIS (md5 dos bytes gravados),
 * pois a ADR-10 exige congruência entry-wise — fixture autoconsistente. */
async function makeBundle(
  files: Record<string, unknown>,
  kind = 'catalog',
): Promise<{ zip: Uint8Array; entries: Entry[] }> {
  const { zipSync, strToU8 } = await import('fflate')
  const inner: Record<string, Uint8Array> = {}
  const names = Object.keys(files)
  inner['_bundle_manifest.json'] = strToU8(
    JSON.stringify({
      schema_version: 1,
      kind,
      files: names.map((n) => ({
        name: `${n}.json`,
        bytes: 10,
        sha256: 'x'.repeat(64),
      })),
    }),
  )
  const entries: Entry[] = []
  for (const [k, v] of Object.entries(files)) {
    const raw = strToU8(JSON.stringify(v))
    inner[`${k}.json`] = raw
    entries.push(entry(`${k}.json`, await md5Of(raw)))
  }
  return { zip: zipSync(inner), entries }
}

async function makeZip(
  files: Record<string, unknown>,
  kind = 'catalog',
): Promise<Uint8Array> {
  return (await makeBundle(files, kind)).zip
}

async function md5Of(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('md5').update(bytes).digest('hex')
}

async function digestOfEntries(entries: Entry[]): Promise<string> {
  const subset = parseManifest(entries, 'catalog')
  expect(subset).not.toBeNull()
  return manifestDigestOf(subset!)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.state.fetch)
  mocks.state.readState.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('syncBundle — validação do manifest entry-wise (ADR-09/RF-19)', () => {
  it('RF-21 fluxo feliz cold: 1 GET manifest + 1 GET ZIP fixo, aplica e retorna registros', async () => {
    const { zip, entries } = await makeBundle({
      pt_categories: [],
      pt_musics: [{ id: 1 }],
      config: { v: 1 },
      music_1: { id_music: 1 },
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(true)

    const result = await syncBundle('catalog')
    expect(result && 'records' in result).toBe(true)
    expect(Object.keys(result!.records ?? {}).sort()).toEqual([
      'config',
      'music_1',
      'pt_categories',
      'pt_musics',
    ])
    expect(mocks.state.fetch).toHaveBeenCalledTimes(2)
    const [manifestUrl] = mocks.state.fetch.mock.calls[0]
    expect(manifestUrl).toBe('https://api.louvorja.com.br/db/manifest')
    // ADR-11: URL FIXA do artifact — nunca construída de `path` do payload.
    const [zipUrl] = mocks.state.fetch.mock.calls[1]
    expect(zipUrl).toBe('https://api.louvorja.com.br/db/catalog-bundle')
    expect(mocks.state.applyRecords).toHaveBeenCalled()
  })

  it.each([
    ['não-array', { schema: 1, artifacts: {} }],
    ['array vazio', []],
    ['entry não-objeto', ['x']],
    ['entry null', [null]],
    ['file sem .json', [entry('pt_musics')]],
    ['file com /', [{ ...entry('a/b.json'), path: '/db/a/b' }]],
    ['file com ..', [entry('..json')].map((e) => ({ ...e, file: 'a..b.json' }))],
    ['file com \\\\', [entry('a\\\\b.json')]],
    ['file com controle \\\\u0000', [{ ...entry('a\u0000b.json') }]],
    ['hash uppercase', [entry('pt_musics.json', MD5_A.toUpperCase())]],
    ['hash curto', [entry('pt_musics.json', 'a'.repeat(31))]],
    ['hash longo', [entry('pt_musics.json', 'a'.repeat(33))]],
    ['hash com g (não-hex)', [entry('pt_musics.json', 'g'.repeat(32))]],
    ['hash 32 bytes não-hex misto', [entry('pt_musics.json', '0123456789abcdef0123456789abcdeg')]],
    ['file duplicado', [entry('pt_musics.json'), entry('pt_musics.json')]],
    ['file não-string', [{ file: 1, hash: MD5_A }]],
    ['hash não-string', [{ file: 'a.json', hash: 7 }]],
  ])('manifest rejeitado (%s) => null e ZERO GET de ZIP', async (_label, body) => {
    mocks.state.fetch.mockResolvedValueOnce(manifestResponse(body))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
  })

  it('entries fora do padrão do artifact são IGNORADAS (sem fail) — subset real do probe', async () => {
    // Manifest real tem 18.060 entries; bible_10_100_1 + unknown não são catalog.
    const subset = parseManifest(catalogManifest(), 'catalog')
    expect(subset).not.toBeNull()
    expect(Object.keys(subset!).sort()).toEqual([
      'config',
      'music_1',
      'pt_categories',
      'pt_musics',
    ])
    expect(subset!['music_1']!.hash).toBe('1'.repeat(32))
    expect(subset!['config']).toBeDefined()
  })

  it('BIBLE_KEY_PATTERN casa chaves reais de 3 segmentos (bug latente corrigido)', async () => {
    const subset = parseManifest(bibleManifest(), 'bible')
    expect(subset).not.toBeNull()
    expect(Object.keys(subset!)).toEqual(['bible_10_100_1'])
  })

  it('fronteiras de regex: nomes QUASE válidos ficam fora do subset (âncoras)', async () => {
    const nearMiss: Entry[] = [
      entry('xpt_musics.json'), // prefixo lixo antes de pt_
      entry('pt_musicsx.json'), // sufixo lixo
      entry('music_1x.json'), // music_<n> exige fim
      entry('album_9z.json'),
      entry('configx.json'),
      entry('pt_hymnal_extra.json'),
      entry('xx_bible_book.json'), // idioma fora de pt|es
    ]
    expect(parseManifest(nearMiss, 'catalog')).toEqual({})
    const bibleNear: Entry[] = [
      entry('bible_10_100.json'), // 2 segmentos
      entry('bible_10_100_1x.json'), // sufixo
      entry('bible_10_100_x.json'), // capítulo não numérico
      entry('xbible_10_100_1.json'),
      entry('BIBLE_10_100_1.json'), // case
    ]
    expect(parseManifest(bibleNear, 'bible')).toEqual({})
  })

  it('es_* também pertence ao subset catalog (paridade pt/es)', async () => {
    const subset = parseManifest(
      [entry('es_musics.json'), entry('es_categories.json')],
      'catalog',
    )
    expect(Object.keys(subset!).sort()).toEqual(['es_categories', 'es_musics'])
  })

  it('manifest 404 => null sem lançar', async () => {
    mocks.state.fetch.mockResolvedValueOnce(new Response('nope', { status: 404 }))
    await expect(syncBundle('catalog')).resolves.toBeNull()
  })

  it('manifest JSON inválido => null', async () => {
    mocks.state.fetch.mockResolvedValueOnce(new Response('not json', { status: 200 }))
    await expect(syncBundle('catalog')).resolves.toBeNull()
  })

  it('rede falha => null', async () => {
    mocks.state.fetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(syncBundle('catalog')).resolves.toBeNull()
  })
})

describe('manifestDigestOf — digest canônico (ADR-09)', () => {
  it('digest do subset fixture casa o algoritmo canônico file\\tmd5\\n ordenado', async () => {
    const entries: Entry[] = [
      entry('config.json', 'a'.repeat(32)),
      entry('pt_musics.json', 'b'.repeat(32)),
    ]
    const { createHash } = await import('node:crypto')
    const expected = createHash('sha256')
      .update(`config.json\ta${'a'.repeat(31)}\npt_musics.json\tb${'b'.repeat(31)}\n`)
      .digest('hex')
    const subset = parseManifest(entries, 'catalog')
    expect(subset).not.toBeNull()
    expect(await manifestDigestOf(subset!)).toBe(expected)
  })

  it('mudança em UM hash muda o digest (chave do gate condicional)', async () => {
    const e1: Entry[] = [entry('config.json', '1'.repeat(32))]
    const e2: Entry[] = [entry('config.json', '2'.repeat(32))]
    const d1 = await digestOfEntries(e1)
    const d2 = await digestOfEntries(e2)
    expect(d1).not.toBe(d2)
    expect(d1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('é estável perante ordem de entrada (ordenação byte-a-byte por file)', async () => {
    const e1: Entry[] = [entry('config.json'), entry('pt_musics.json')]
    const e2: Entry[] = [entry('pt_musics.json'), entry('config.json')]
    expect(await digestOfEntries(e1)).toBe(await digestOfEntries(e2))
  })

  it('desempate por comprimento/comum-prefixo: pt_hymnal < pt_hymnal_1, music_1 < music_10', async () => {
    // Pares com prefixo comum exercitam o tie-break do comparador
    // byte-a-byte ('\t' 0x09 < '_' 0x5f; e o desempate de comprimento).
    const entries: Entry[] = [
      entry('pt_hymnal.json', 'a'.repeat(32)),
      entry('pt_hymnal_1.json', 'b'.repeat(32)),
      entry('music_1.json', 'c'.repeat(32)),
      entry('music_10.json', 'd'.repeat(32)),
    ]
    const { createHash } = await import('node:crypto')
    const canonical =
      `music_1.json\tc${'c'.repeat(31)}\n` +
      `music_10.json\td${'d'.repeat(31)}\n` +
      `pt_hymnal.json\ta${'a'.repeat(31)}\n` +
      `pt_hymnal_1.json\tb${'b'.repeat(31)}\n`
    const expected = createHash('sha256').update(canonical).digest('hex')
    const subset = parseManifest(entries, 'catalog')
    expect(subset).not.toBeNull()
    expect(await manifestDigestOf(subset!)).toBe(expected)
  })
})

describe('syncBundle — warm gate digest (RF-20)', () => {
  it('exatamente 24h (fronteira) => consulta manifest de novo', async () => {
    const digest = await digestOfEntries(catalogManifest())
    mocks.state.readState.mockResolvedValue({
      manifestDigest: digest,
      checkedAtEpochMs: Date.now() - 24 * HOUR, // == TTL, não <
      appliedAtEpochMs: Date.now() - 24 * HOUR,
      schema: 2,
    })
    mocks.state.fetch.mockResolvedValueOnce(manifestResponse(catalogManifest()))
    expect(await syncBundle('catalog')).toEqual({ status: 'up-to-date' })
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1) // consultou
  })

  it('<24h => 0 requests', async () => {
    const digest = await digestOfEntries(catalogManifest())
    mocks.state.readState.mockResolvedValue({
      manifestDigest: digest,
      checkedAtEpochMs: Date.now() - HOUR,
      appliedAtEpochMs: Date.now() - HOUR,
      schema: 2,
    })
    const result = await syncBundle('catalog')
    expect(result).toEqual({ status: 'up-to-date' })
    expect(mocks.state.fetch).not.toHaveBeenCalled()
  })

  it('>=24h com digest igual => 1 manifest, 0 ZIP, só checkedAt atualiza', async () => {
    const digest = await digestOfEntries(catalogManifest())
    mocks.state.readState.mockResolvedValue({
      manifestDigest: digest,
      checkedAtEpochMs: Date.now() - 25 * HOUR,
      appliedAtEpochMs: Date.now() - 25 * HOUR,
      schema: 2,
    })
    mocks.state.fetch.mockResolvedValueOnce(manifestResponse(catalogManifest()))
    const result = await syncBundle('catalog')
    expect(result).toEqual({ status: 'up-to-date' })
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('force ignora checkedAt; digest igual => 0 GET do ZIP', async () => {
    const digest = await digestOfEntries(catalogManifest())
    mocks.state.readState.mockResolvedValue({
      manifestDigest: digest,
      checkedAtEpochMs: Date.now() - HOUR,
      appliedAtEpochMs: Date.now() - HOUR,
      schema: 2,
    })
    mocks.state.fetch.mockResolvedValueOnce(manifestResponse(catalogManifest()))
    expect(await syncBundle('catalog', { force: true })).toEqual({
      status: 'up-to-date',
    })
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
  })

  it('>=24h com digest DIVERGENTE => 1 manifest + 1 ZIP', async () => {
    // Estado aplicado antigo (digest de outro manifest) => divergiu => ZIP.
    const { zip, entries } = await makeBundle({
      pt_categories: [],
      pt_musics: [],
      config: {},
      music_1: { id_music: 1 },
    })
    mocks.state.readState.mockResolvedValue({
      manifestDigest: '0'.repeat(64),
      checkedAtEpochMs: Date.now() - 25 * HOUR,
      appliedAtEpochMs: Date.now() - 25 * HOUR,
      schema: 2,
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(true)
    expect(await syncBundle('catalog')).not.toBeNull()
    expect(mocks.state.fetch).toHaveBeenCalledTimes(2)
  })

  it('estado schema 1 (legado nunca atingido) não é reutilizado => cold sync', async () => {
    const { zip, entries } = await makeBundle({
      pt_categories: [],
      pt_musics: [],
      config: {},
      music_1: {},
    })
    mocks.state.readState.mockResolvedValue({
      md5: MD5_A,
      checkedAtEpochMs: Date.now() - HOUR,
      appliedAtEpochMs: Date.now() - HOUR,
      schema: 1,
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(true)
    expect(await syncBundle('catalog')).not.toBeNull()
    expect(mocks.state.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('syncBundle — integridade entry-wise do ZIP (ADR-10/RF-21)', () => {
  it('arquivo do ZIP com MD5 != manifest hash => invalida o bundle INTEIRO, nada aplicado', async () => {
    // pt_musics.json tem outro conteúdo no ZIP: MD5 não bate com o manifest.
    const zip = await makeZip({
      pt_categories: [],
      pt_musics: [{ tampered: true }],
      config: {},
      music_1: {},
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('entry do subset ausente no ZIP (incompleto) => invalida', async () => {
    const zip = await makeZip({ pt_categories: [], pt_musics: [], config: {} }) // music_1 ausente
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('ZIP congruente aplica e grava estado schema 2 com manifestDigest', async () => {
    const { writeBundleSyncState } = await import('@shared/services/workspace-api')
    const { zip, entries } = await makeBundle({
      pt_categories: [],
      pt_musics: [],
      config: {},
      music_1: { id_music: 1 },
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(true)
    const result = await syncBundle('catalog')
    expect(result && 'records' in result).toBe(true)
    const subset = parseManifest(entries, 'catalog')
    expect(subset).not.toBeNull()
    expect(writeBundleSyncState).toHaveBeenCalledWith('catalog', {
      manifestDigest: await manifestDigestOf(subset!),
      checkedAtEpochMs: expect.any(Number),
      appliedAtEpochMs: expect.any(Number),
      schema: 2,
    })
  })

  it('content-type não-zip => null', async () => {
    const zip = await makeZip({ pt_categories: [], pt_musics: [], config: {}, music_1: {} })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(
        new Response(zip.buffer as ArrayBuffer, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('bytes truncados (não ZIP) => null', async () => {
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(10), { status: 200 }))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('ZIP com entrada não-JSON => null', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      '_bundle_manifest.json': strToU8(
        JSON.stringify({ schema_version: 1, kind: 'catalog', files: [] }),
      ),
      'evil.txt': strToU8('nope'),
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('ZIP com JSON inválido => null', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      '_bundle_manifest.json': strToU8(
        JSON.stringify({ schema_version: 1, kind: 'catalog', files: [] }),
      ),
      'broken.json': strToU8('{not json'),
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('ZIP com caminho inseguro (..) => null', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      '_bundle_manifest.json': strToU8(
        JSON.stringify({ schema_version: 1, kind: 'catalog', files: [] }),
      ),
      '../evil.json': strToU8('{}'),
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it.each([
    ['caminho absoluto /etc/x.json', '/etc/x.json'],
    ['backslash a\\\\b.json', 'a\\b.json'],
    ['entrada não-json (sem .json)', 'notjson'],
  ])('ZIP com entrada insegura (%s) => null', async (_label, evilName) => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      '_bundle_manifest.json': strToU8(
        JSON.stringify({ schema_version: 1, kind: 'catalog', files: [] }),
      ),
      [evilName]: strToU8('{}'),
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('ZIP sem _bundle_manifest.json => null', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({ 'pt_musics.json': strToU8('[]') })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('_bundle_manifest com schema_version != 1 => null (RED caso 5)', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      '_bundle_manifest.json': strToU8(
        JSON.stringify({ schema_version: 2, kind: 'catalog', files: [] }),
      ),
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('_bundle_manifest com kind errado => null', async () => {
    const zip = await makeZip({ pt_musics: [] }, 'bible')
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('aplicação atômica falha => null e sem estado novo', async () => {
    const { zip, entries } = await makeBundle({
      pt_categories: [],
      pt_musics: [],
      config: {},
      music_1: {},
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(false)
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).toHaveBeenCalledTimes(1)
  })

  it('catalog ZIP sem config.json (essencial real) => null (bug latente corrigido)', async () => {
    const zip = await makeZip({ pt_categories: [], pt_musics: [], music_1: {} })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it.each([
    ['sem pt_categories', { pt_musics: [], config: {}, music_1: {} }],
    ['sem pt_musics', { pt_categories: [], config: {}, music_1: {} }],
    ['sem config', { pt_categories: [], pt_musics: [], music_1: {} }],
  ])('catalog ZIP incompleto (%s) => null, nada aplicado', async (_label, files) => {
    const zip = await makeZip(files)
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('manifest responde 500 (não-ok) => null sem GET de ZIP', async () => {
    mocks.state.fetch.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
  })

  it('ZIP responde 503 (não-ok) => null', async () => {
    const { zip, entries } = await makeBundle({
      pt_categories: [],
      pt_musics: [],
      config: {},
      music_1: {},
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('ZIP fetch lança (rede) => null', async () => {
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockRejectedValueOnce(new Error('network down'))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('manifest fetch lança (rede) => null', async () => {
    mocks.state.fetch.mockRejectedValueOnce(new Error('dns fail'))
    expect(await syncBundle('bible')).toBeNull()
  })

  it('bible bundle aplica capítulos (subset real de 3 segmentos)', async () => {
    const { zip, entries } = await makeBundle(
      { bible_10_100_1: { v1: 'texto' } },
      'bible',
    )
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(true)
    const result = await syncBundle('bible')
    expect(result && 'records' in result && result.records['bible_10_100_1']).toEqual({
      v1: 'texto',
    })
    const [zipUrl] = mocks.state.fetch.mock.calls[1]
    expect(zipUrl).toBe('https://api.louvorja.com.br/db/bible-bundle')
  })

  it('bible bundle sem capítulo => null', async () => {
    const { zip, entries } = await makeBundle({ bible_versions: [] }, 'bible')
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(entries))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('bible')).toBeNull()
  })
})

describe('syncBundle — origem ADR-11 (RF-22)', () => {
  it('manifest e ZIP saem da origem bundles (VITE_URL_BUNDLES), não da database', async () => {
    const zip = await makeZip({
      pt_categories: [],
      pt_musics: [],
      config: {},
      music_1: {},
    })
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse(catalogManifest()))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(true)
    await syncBundle('catalog')
    expect(mocks.state.bundlesUrl).toHaveBeenCalledWith('/db/manifest')
    expect(mocks.state.bundlesUrl).toHaveBeenCalledWith('/db/catalog-bundle')
    // `path` do payload (/db/music_1 etc.) nunca vira request:
    for (const [url] of mocks.state.fetch.mock.calls) {
      expect(String(url)).not.toContain('/db/music_1')
      expect(String(url)).not.toContain('/db/pt_musics')
    }
  })
})

describe('syncBundle — contrato de estado (leitura persistida)', () => {
  it('lê estado via readBundleSyncState', async () => {
    const digest = await digestOfEntries(catalogManifest())
    vi.mocked(readBundleSyncState).mockResolvedValue({
      manifestDigest: digest,
      checkedAtEpochMs: Date.now() - HOUR,
      appliedAtEpochMs: Date.now() - HOUR,
      schema: 2,
    })
    expect(await syncBundle('catalog')).toEqual({ status: 'up-to-date' })
    expect(readBundleSyncState).toHaveBeenCalledWith('catalog')
  })
})
