// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * bundle-sync-client — SPEC piano-bundle-sync v1.0.0.
 *
 * RF-01: manifest 1x/24h por artifact (estado checkedAt).
 * RF-02: MD5 igual => 0 GET do ZIP; MD5 novo => 1 GET + estado só após aplicar.
 * ADR-01: validação estrita do manifest (schema===1, md5 32-hex lower, bytes>0,
 *         url caminho absoluto /db/, sem cross-origin).
 * ADR-02: validação de ZIP (JSON válido, caminho seguro, chaves mínimas) antes
 *         de aplicar; aplicação atômica (callback aplica e só depois grava estado).
 * ADR-03: qualquer falha => retorna null e NUNCA aplica nem grava estado
 *         (fallback legado fica a cargo do chamador).
 */

const mocks = vi.hoisted(() => {
  const state = {
    origin: 'https://api.louvorja.com.br',
    fetch: vi.fn(),
    dbUrl: vi.fn((path: string) => `https://api.louvorja.com.br${path}`),
    readRecords: vi.fn(async () => null as Record<string, unknown> | null),
    readState: vi.fn(async () => null as unknown),
    applyRecords: vi.fn(async (_records: Record<string, unknown>) => true),
  }
  return { state }
})

vi.mock('@shared/services/workspace-api', () => ({
  resolveDatabaseUrl: (path: string) => mocks.state.dbUrl(path),
  readBundleSyncState: mocks.state.readState,
  writeBundleSyncState: vi.fn(),
}))

vi.mock('@shared/services/workspace-bundle-apply', () => ({
  readWorkspaceRecords: mocks.state.readRecords,
  applyWorkspaceRecordsAtomic: mocks.state.applyRecords,
}))

import { syncBundle } from '../bundle-sync-client'
import { readBundleSyncState } from '@shared/services/workspace-api'

const HOUR = 3_600_000
const MD5 = 'a'.repeat(32)

function manifestResponse(overrides: Record<string, unknown> = {}): Response {
  const body = {
    schema: 1,
    generatedAt: '2026-11-05T00:00:00Z',
    artifacts: {
      catalog: { url: '/db/catalog-bundle', md5: MD5, bytes: 100 },
      bible: { url: '/db/bible-bundle', md5: 'b'.repeat(32), bytes: 200 },
    },
    ...overrides,
  }
  return new Response(JSON.stringify(body), { status: 200 })
}

function zipResponse(bytes: Uint8Array, md5Hex = MD5): Response {
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: { 'Content-Type': 'application/zip' },
  })
}

/** ZIP real contendo `_bundle_manifest.json` + 2 registros JSON. */
async function makeZip(
  files: Record<string, unknown>,
  kind = 'catalog',
): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate')
  const inner: Record<string, Uint8Array> = {}
  const names = Object.keys(files)
  inner['_bundle_manifest.json'] = strToU8(
    JSON.stringify({
      schema_version: 1,
      kind,
      files: names.map((n) => ({ name: `${n}.json`, bytes: 10, sha256: 'x' })),
    }),
  )
  for (const [k, v] of Object.entries(files)) {
    inner[`${k}.json`] = strToU8(JSON.stringify(v))
  }
  return zipSync(inner)
}

async function md5Of(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('md5').update(bytes).digest('hex')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.state.fetch)
  mocks.state.readState.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('syncBundle — validação do manifest (ADR-01)', () => {
  it('RF-01: fluxo feliz — 1 GET manifest + 1 GET ZIP, aplica e retorna registros', async () => {
    const zip = await makeZip({ pt_musics: [{ id: 1 }], music_1: { id_music: 1 } })
    const md5 = await md5Of(zip)
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse({ artifacts: { catalog: { url: '/db/catalog-bundle', md5, bytes: zip.length } } }))
      .mockResolvedValueOnce(zipResponse(zip, md5))
    mocks.state.applyRecords.mockResolvedValue(true)

    const result = await syncBundle('catalog')
    expect(result).not.toBeNull()
    expect(Object.keys(result!.records).sort()).toEqual(['music_1', 'pt_musics'])
    expect(mocks.state.fetch).toHaveBeenCalledTimes(2)
    const [manifestUrl] = mocks.state.fetch.mock.calls[0]
    expect(manifestUrl).toBe('https://api.louvorja.com.br/db/manifest')
    const [zipUrl] = mocks.state.fetch.mock.calls[1]
    expect(zipUrl).toBe('https://api.louvorja.com.br/db/catalog-bundle')
    expect(mocks.state.applyRecords).toHaveBeenCalled()
  })

  it.each([
    ['schema inválido', { schema: 2 }],
    ['md5 uppercase', { artifacts: { catalog: { url: '/db/catalog-bundle', md5: MD5.toUpperCase(), bytes: 100 } } }],
    ['bytes 0', { artifacts: { catalog: { url: '/db/catalog-bundle', md5: MD5, bytes: 0 } } }],
    ['url não /db/', { artifacts: { catalog: { url: 'https://evil.example/x', md5: MD5, bytes: 10 } } }],
    ['artifact faltando', { artifacts: {} }],
  ])('manifest rejeitado (%s) => null e ZERO GET de ZIP', async (_label, overrides) => {
    mocks.state.fetch.mockResolvedValueOnce(manifestResponse(overrides))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
  })

  it('manifest 404 => null sem lançar', async () => {
    mocks.state.fetch.mockResolvedValueOnce(new Response('nope', { status: 404 }))
    await expect(syncBundle('catalog')).resolves.toBeNull()
  })

  it('manifest JSON inválido => null', async () => {
    mocks.state.fetch.mockResolvedValueOnce(
      new Response('not json', { status: 200 }),
    )
    await expect(syncBundle('catalog')).resolves.toBeNull()
  })

  it('rede falha => null', async () => {
    mocks.state.fetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(syncBundle('catalog')).resolves.toBeNull()
  })
})

describe('syncBundle — estado 24h (RF-01/RF-02)', () => {
  it('checkedAt < 24h e MD5 igual ao estado => 0 GET', async () => {
    mocks.state.readState.mockResolvedValue({
      md5: MD5,
      checkedAtEpochMs: Date.now() - HOUR,
      appliedAtEpochMs: Date.now() - HOUR,
      schema: 1,
    })
    const result = await syncBundle('catalog')
    expect(result).toEqual({ status: 'up-to-date' })
    expect(mocks.state.fetch).not.toHaveBeenCalled()
  })

  it('checkedAt >= 24h => consulta manifest; MD5 igual => 0 GET do ZIP e atualiza checkedAt', async () => {
    mocks.state.readState.mockResolvedValue({
      md5: MD5,
      checkedAtEpochMs: Date.now() - 25 * HOUR,
      appliedAtEpochMs: Date.now() - 25 * HOUR,
      schema: 1,
    })
    mocks.state.fetch.mockResolvedValueOnce(manifestResponse())
    const result = await syncBundle('catalog')
    expect(result).toEqual({ status: 'up-to-date' })
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('force ignora checkedAt; MD5 igual => 0 GET do ZIP', async () => {
    mocks.state.readState.mockResolvedValue({
      md5: MD5,
      checkedAtEpochMs: Date.now() - HOUR,
      appliedAtEpochMs: Date.now() - HOUR,
      schema: 1,
    })
    mocks.state.fetch.mockResolvedValueOnce(manifestResponse())
    expect(await syncBundle('catalog', { force: true })).toEqual({
      status: 'up-to-date',
    })
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
  })

  it('sem estado persistido ainda consulta (primeira instalação)', async () => {
    const zip = await makeZip({ pt_musics: [] }, 'catalog')
    const md5 = await md5Of(zip)
    mocks.state.fetch
      .mockResolvedValueOnce(manifestResponse({ artifacts: { catalog: { url: '/db/catalog-bundle', md5, bytes: zip.length } } }))
      .mockResolvedValueOnce(zipResponse(zip, md5))
    mocks.state.applyRecords.mockResolvedValue(true)
    const result = await syncBundle('catalog')
    expect(result && 'records' in result).toBe(true)
    expect(mocks.state.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('syncBundle — bundle ZIP (ADR-02/RF-05)', () => {
  async function happyManifest(zipBytes: Uint8Array) {
    const md5 = await md5Of(zipBytes)
    return manifestResponse({
      artifacts: { catalog: { url: '/db/catalog-bundle', md5, bytes: zipBytes.length } },
    })
  }

  it('MD5 divergente dos bytes => null, sem aplicar', async () => {
    const zip = await makeZip({ pt_musics: [] })
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(zipResponse(await makeZip({ pt_musics: [{ tampered: true }] })))
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).not.toHaveBeenCalled()
  })

  it('content-type não-zip => null', async () => {
    const zip = await makeZip({ pt_musics: [] })
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(
        new Response(zip.buffer as ArrayBuffer, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('bytes truncados (não ZIP) => null', async () => {
    const zip = await makeZip({ pt_musics: [] })
    const md5 = await md5Of(zip)
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(10), { status: 200 }))
    void md5
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('ZIP com JSON inválido => null', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      '_bundle_manifest.json': strToU8(JSON.stringify({ schema_version: 1, kind: 'catalog', files: [] })),
      'broken.json': strToU8('{not json'),
    })
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('ZIP com caminho inseguro (..) => null', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      '_bundle_manifest.json': strToU8(JSON.stringify({ schema_version: 1, kind: 'catalog', files: [] })),
      '../evil.json': strToU8('{}'),
    })
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('ZIP sem _bundle_manifest.json => null', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({ 'pt_musics.json': strToU8('[]') })
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('_bundle_manifest kind divergente do artifact => null', async () => {
    const zip = await makeZip({ pt_musics: [] }, 'bible')
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(zipResponse(zip))
    expect(await syncBundle('catalog')).toBeNull()
  })

  it('aplicação atômica falha (callback false) => null e sem estado novo', async () => {
    const zip = await makeZip({ pt_musics: [] })
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(zipResponse(zip))
    mocks.state.applyRecords.mockResolvedValue(false)
    expect(await syncBundle('catalog')).toBeNull()
    expect(mocks.state.applyRecords).toHaveBeenCalledTimes(1)
  })

  it('bible bundle exige chaves bible_<v>_<b>_<c>', async () => {
    const zip = await makeZip({ pt_bible_book: [] }, 'bible')
    const md5 = await md5Of(zip)
    mocks.state.fetch
      .mockResolvedValueOnce(
        manifestResponse({ artifacts: { catalog: { url: '/db/catalog-bundle', md5: 'c'.repeat(32), bytes: 1 }, bible: { url: '/db/bible-bundle', md5, bytes: zip.length } } }),
      )
      .mockResolvedValueOnce(zipResponse(zip, md5))
    expect(await syncBundle('bible')).toBeNull()
  })

  it('bible bundle válido aplica capítulos', async () => {
    const zip = await makeZip({ bible_9_9_9: { v1: 'texto' } }, 'bible')
    const md5 = await md5Of(zip)
    mocks.state.fetch
      .mockResolvedValueOnce(
        manifestResponse({ artifacts: { catalog: { url: '/db/catalog-bundle', md5: 'c'.repeat(32), bytes: 1 }, bible: { url: '/db/bible-bundle', md5, bytes: zip.length } } }),
      )
      .mockResolvedValueOnce(zipResponse(zip, md5))
    mocks.state.applyRecords.mockResolvedValue(true)
    const result = await syncBundle('bible')
    expect(result && 'records' in result && result.records['bible_9_9_9']).toEqual({ v1: 'texto' })
  })

  it('conteúdo desconhecido no ZIP é ignorado (só chaves conhecidas aplicam)', async () => {
    const zip = await makeZip({
      pt_musics: [],
      future_thing: { whatever: 1 },
      music_9: { id_music: 9 },
    })
    const md5 = await md5Of(zip)
    mocks.state.fetch
      .mockResolvedValueOnce(await happyManifest(zip))
      .mockResolvedValueOnce(zipResponse(zip, md5))
    mocks.state.applyRecords.mockResolvedValue(true)
    const result = await syncBundle('catalog')
    expect(result && 'records' in result && Object.keys(result.records).sort())
      .toEqual(['music_9', 'pt_musics'])
  })
})

describe('syncBundle — contrato de estado (leitura persistida)', () => {
  it('lê estado via readBundleSyncState', async () => {
    vi.mocked(readBundleSyncState).mockResolvedValue({
      md5: MD5,
      checkedAtEpochMs: Date.now() - HOUR,
      appliedAtEpochMs: Date.now() - HOUR,
      schema: 1,
    })
    expect(await syncBundle('catalog')).toEqual({ status: 'up-to-date' })
    expect(readBundleSyncState).toHaveBeenCalledWith('catalog')
  })
})
