// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchBibleBundles,
  isBibleBundleRequired,
  resolveBibleBundleApi,
} from './fetch-bible-bundles.mjs'

const API = 'https://api-stg.example.test'

function bundleBytes(versionId, text = 'No princípio') {
  return Buffer.from(
    JSON.stringify({
      schema: 1,
      versionId,
      language: 'pt',
      name: `Versão ${versionId}`,
      abbreviation: `V${versionId}`,
      chapters: { 1: { 1: { 1: text } } },
    }),
  )
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function entry(versionId, bytes, extra = {}) {
  return {
    versionId,
    language: 'pt',
    name: `Versão ${versionId}`,
    abbreviation: `V${versionId}`,
    books: 1,
    chapters: 1,
    complete: true,
    missing: 0,
    sha256: sha(bytes),
    bytes: bytes.length,
    gzipBytes: 10,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  }
}

/** fetch falso: rotas → Buffer|objeto|status */
function fakeFetch(routes) {
  return vi.fn(async (url, init) => {
    const route = routes[url]
    if (route === undefined) return new Response('not found', { status: 404 })
    if (typeof route === 'function') return route(url, init)
    if (Buffer.isBuffer(route)) return new Response(route, { status: 200 })
    return Response.json(route)
  })
}

const silent = { log: vi.fn(), warn: vi.fn() }

describe('fetchBibleBundles', () => {
  let outDir

  beforeEach(() => {
    outDir = path.join(mkdtempSync(path.join(tmpdir(), 'bible-bundles-')), 'bible')
  })

  afterEach(() => {
    rmSync(path.dirname(outDir), { recursive: true, force: true })
  })

  it('baixa as versões completas, grava gzip e manifest local', async () => {
    const b2 = bundleBytes(2)
    const b10 = bundleBytes(10)
    const fetchImpl = fakeFetch({
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [entry(2, b2), entry(10, b10)] },
      [`${API}/v1/bible/bundles/2`]: b2,
      [`${API}/v1/bible/bundles/10`]: b10,
    })

    const result = await fetchBibleBundles({
      apiBase: API,
      outDir,
      required: true,
      fetchImpl,
      logger: silent,
      clientVersion: '9.9.9',
    })

    expect(result).toMatchObject({ downloaded: 2, reused: 0, skipped: [] })
    expect(gunzipSync(readFileSync(path.join(outDir, '2.json.gz'))).equals(b2)).toBe(true)
    expect(gunzipSync(readFileSync(path.join(outDir, '10.json.gz'))).equals(b10)).toBe(true)

    const manifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest.schema).toBe(1)
    expect(manifest.versions).toEqual([
      { versionId: 2, language: 'pt', name: 'Versão 2', abbreviation: 'V2', sha256: sha(b2), bytes: b2.length },
      { versionId: 10, language: 'pt', name: 'Versão 10', abbreviation: 'V10', sha256: sha(b10), bytes: b10.length },
    ])

    const [, init] = fetchImpl.mock.calls.find(([url]) => url.endsWith('/bundles/2'))
    expect(init.headers).toMatchObject({
      'X-Client-Platform': 'desktop-build',
      'X-Client-Version': '9.9.9',
      'Accept-Encoding': 'gzip',
    })
  })

  it('segunda execução com mesmo sha256 reaproveita sem baixar de novo', async () => {
    const b2 = bundleBytes(2)
    const routes = {
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [entry(2, b2)] },
      [`${API}/v1/bible/bundles/2`]: b2,
    }
    await fetchBibleBundles({ apiBase: API, outDir, required: true, fetchImpl: fakeFetch(routes), logger: silent })

    const second = fakeFetch(routes)
    const result = await fetchBibleBundles({ apiBase: API, outDir, required: true, fetchImpl: second, logger: silent })
    expect(result).toMatchObject({ downloaded: 0, reused: 1 })
    expect(second.mock.calls.map(([url]) => url)).toEqual([`${API}/v1/bible/bundles`])
  })

  it('arquivo local corrompido é baixado de novo', async () => {
    const b2 = bundleBytes(2)
    const routes = {
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [entry(2, b2)] },
      [`${API}/v1/bible/bundles/2`]: b2,
    }
    await fetchBibleBundles({ apiBase: API, outDir, required: true, fetchImpl: fakeFetch(routes), logger: silent })
    writeFileSync(path.join(outDir, '2.json.gz'), gzipSync('estragado'))

    const result = await fetchBibleBundles({ apiBase: API, outDir, required: true, fetchImpl: fakeFetch(routes), logger: silent })
    expect(result.downloaded).toBe(1)
    expect(gunzipSync(readFileSync(path.join(outDir, '2.json.gz'))).equals(b2)).toBe(true)
  })

  it('sha256 diferente do manifesto → erro e nada gravado', async () => {
    const b2 = bundleBytes(2)
    const fetchImpl = fakeFetch({
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [entry(2, b2)] },
      [`${API}/v1/bible/bundles/2`]: bundleBytes(2, 'adulterado'),
    })
    await expect(
      fetchBibleBundles({ apiBase: API, outDir, required: false, fetchImpl, logger: silent }),
    ).rejects.toThrow(/sha256/)
    expect(existsSync(path.join(outDir, '2.json.gz'))).toBe(false)
  })

  it('versão incompleta: obrigatório → erro; opcional → pula com aviso', async () => {
    const b2 = bundleBytes(2)
    const routes = {
      [`${API}/v1/bible/bundles`]: {
        schema: 1,
        versions: [entry(2, b2), entry(13, b2, { complete: false, missing: 4, sha256: null, bytes: null })],
      },
      [`${API}/v1/bible/bundles/2`]: b2,
    }
    await expect(
      fetchBibleBundles({ apiBase: API, outDir, required: true, fetchImpl: fakeFetch(routes), logger: silent }),
    ).rejects.toThrow(/13/)

    const result = await fetchBibleBundles({ apiBase: API, outDir, required: false, fetchImpl: fakeFetch(routes), logger: silent })
    expect(result).toMatchObject({ downloaded: 1, skipped: [13] })
  })

  it('API sem bundles (404/rede): obrigatório → erro; opcional → manifest vazio', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(
      fetchBibleBundles({ apiBase: API, outDir, required: true, fetchImpl: offline, logger: silent }),
    ).rejects.toThrow(/manifesto/)

    const result = await fetchBibleBundles({ apiBase: API, outDir, required: false, fetchImpl: fakeFetch({}), logger: silent })
    expect(result.versions).toBe(0)
    const manifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest.versions).toEqual([])
  })

  it('opcional e offline mantém bundles já baixados', async () => {
    const b2 = bundleBytes(2)
    await fetchBibleBundles({
      apiBase: API,
      outDir,
      required: true,
      fetchImpl: fakeFetch({
        [`${API}/v1/bible/bundles`]: { schema: 1, versions: [entry(2, b2)] },
        [`${API}/v1/bible/bundles/2`]: b2,
      }),
      logger: silent,
    })
    const result = await fetchBibleBundles({ apiBase: API, outDir, required: false, fetchImpl: fakeFetch({}), logger: silent })
    expect(result.versions).toBe(1)
    expect(existsSync(path.join(outDir, '2.json.gz'))).toBe(true)
  })

  it('remove bundle de versão que saiu do manifesto', async () => {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, '99.json.gz'), gzipSync('velho'))
    const b2 = bundleBytes(2)
    await fetchBibleBundles({
      apiBase: API,
      outDir,
      required: true,
      fetchImpl: fakeFetch({
        [`${API}/v1/bible/bundles`]: { schema: 1, versions: [entry(2, b2)] },
        [`${API}/v1/bible/bundles/2`]: b2,
      }),
      logger: silent,
    })
    expect(existsSync(path.join(outDir, '99.json.gz'))).toBe(false)
  })

  it('obrigatório com manifesto vazio → erro', async () => {
    await expect(
      fetchBibleBundles({
        apiBase: API,
        outDir,
        required: true,
        fetchImpl: fakeFetch({ [`${API}/v1/bible/bundles`]: { schema: 1, versions: [] } }),
        logger: silent,
      }),
    ).rejects.toThrow(/nenhuma/)
  })
})

describe('resolveBibleBundleApi / isBibleBundleRequired', () => {
  it('padrão do perfil: homologation → STG, release → produção', () => {
    expect(resolveBibleBundleApi({ PIANO_BUILD_PROFILE: 'homologation' })).toBe(
      'https://api-stg.pianolouvorja.com.br',
    )
    expect(resolveBibleBundleApi({ PIANO_BUILD_PROFILE: 'release' })).toBe(
      'https://api.pianolouvorja.com.br',
    )
  })

  it('BIBLE_BUNDLE_API_URL sobrepõe (ex.: API local), mas nunca produção fora de release', () => {
    expect(
      resolveBibleBundleApi({ PIANO_BUILD_PROFILE: 'homologation', BIBLE_BUNDLE_API_URL: 'http://localhost:3000/' }),
    ).toBe('http://localhost:3000')
    expect(() =>
      resolveBibleBundleApi({
        PIANO_BUILD_PROFILE: 'homologation',
        BIBLE_BUNDLE_API_URL: 'https://api.pianolouvorja.com.br',
      }),
    ).toThrow(/produção/)
  })

  it('obrigatório por padrão só em release; BIBLE_BUNDLES_REQUIRED decide quando definido', () => {
    expect(isBibleBundleRequired({ PIANO_BUILD_PROFILE: 'release' })).toBe(true)
    expect(isBibleBundleRequired({ PIANO_BUILD_PROFILE: 'homologation' })).toBe(false)
    expect(isBibleBundleRequired({ PIANO_BUILD_PROFILE: 'homologation', BIBLE_BUNDLES_REQUIRED: '1' })).toBe(true)
    expect(isBibleBundleRequired({ PIANO_BUILD_PROFILE: 'release', BIBLE_BUNDLES_REQUIRED: '0' })).toBe(false)
  })
})
