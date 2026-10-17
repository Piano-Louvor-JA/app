// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(), getAppPath: vi.fn(), getVersion: vi.fn(() => '1.0.0') },
  net: { fetch: vi.fn() },
}))
vi.mock('../constants.mjs', () => ({ API_BASE_URL: 'https://api-stg.example.test' }))

import { createBibleUpdater } from '../bible-updater.mjs'

const API = 'https://api-stg.example.test'
const DAY = 24 * 60 * 60 * 1000

function bundleBytes(versionId, text = 'texto') {
  return Buffer.from(
    JSON.stringify({ schema: 1, versionId, language: 'pt', name: 'V', abbreviation: 'V', chapters: { 1: { 1: { 1: text } } } }),
  )
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

function remoteEntry(versionId, bytes, extra = {}) {
  return { versionId, language: 'pt', name: 'V', abbreviation: 'V', complete: true, missing: 0, sha256: sha(bytes), bytes: bytes.length, ...extra }
}

function fakeFetch(routes) {
  return vi.fn(async (url) => {
    const route = routes[url]
    if (route === undefined) return new Response('nf', { status: 404 })
    if (route instanceof Error) throw route
    if (Buffer.isBuffer(route)) return new Response(route, { status: 200 })
    return Response.json(route)
  })
}

describe('bible-updater', () => {
  let root
  let downloadDir
  let bundledDir
  let store
  let clock

  function updater(fetchImpl, extra = {}) {
    return createBibleUpdater({
      getApiBase: () => API,
      downloadDir,
      bundledDir,
      fetchImpl,
      store,
      now: () => clock,
      clientVersion: '1.2.3',
      ...extra,
    })
  }

  function writeBundledManifest(versions) {
    mkdirSync(bundledDir, { recursive: true })
    writeFileSync(path.join(bundledDir, 'manifest.json'), JSON.stringify({ schema: 1, versions }))
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bible-updater-'))
    downloadDir = path.join(root, 'userData', 'bible')
    bundledDir = path.join(root, 'resources', 'bible')
    store = { invalidate: vi.fn() }
    clock = Date.UTC(2026, 9, 17)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('versão do instalador com mesmo sha256 → nada a baixar', async () => {
    const b2 = bundleBytes(2)
    writeBundledManifest([{ versionId: 2, sha256: sha(b2) }])
    const fetchImpl = fakeFetch({ [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, b2)] } })

    await expect(updater(fetchImpl).check()).resolves.toMatchObject({ status: 'up-to-date', updated: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('sha256 diferente → baixa, valida, grava gzip em userData e invalida a memória', async () => {
    const old = bundleBytes(2, 'antigo')
    const fresh = bundleBytes(2, 'novo')
    writeBundledManifest([{ versionId: 2, sha256: sha(old) }])
    const fetchImpl = fakeFetch({
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, fresh)] },
      [`${API}/v1/bible/bundles/2`]: fresh,
    })

    await expect(updater(fetchImpl).check()).resolves.toMatchObject({ status: 'updated', updated: [2] })
    expect(gunzipSync(readFileSync(path.join(downloadDir, '2.json.gz'))).equals(fresh)).toBe(true)
    expect(store.invalidate).toHaveBeenCalledWith(2)

    const manifest = JSON.parse(readFileSync(path.join(downloadDir, 'manifest.json'), 'utf8'))
    expect(manifest.versions).toEqual([expect.objectContaining({ versionId: 2, sha256: sha(fresh) })])

    const [, init] = fetchImpl.mock.calls[1]
    expect(init.headers).toMatchObject({ 'X-Client-Platform': 'desktop', 'X-Client-Version': '1.2.3' })
  })

  it('instalador sem Bíblia: baixa todas as versões completas e pula as incompletas', async () => {
    const b2 = bundleBytes(2)
    const b10 = bundleBytes(10)
    const fetchImpl = fakeFetch({
      [`${API}/v1/bible/bundles`]: {
        schema: 1,
        versions: [remoteEntry(2, b2), remoteEntry(10, b10), remoteEntry(13, b2, { complete: false, sha256: null })],
      },
      [`${API}/v1/bible/bundles/2`]: b2,
      [`${API}/v1/bible/bundles/10`]: b10,
    })

    await expect(updater(fetchImpl).check()).resolves.toMatchObject({ status: 'updated', updated: [2, 10] })
    expect(existsSync(path.join(downloadDir, '13.json.gz'))).toBe(false)
  })

  it('download já feito antes não é repetido', async () => {
    const fresh = bundleBytes(2, 'novo')
    const routes = {
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, fresh)] },
      [`${API}/v1/bible/bundles/2`]: fresh,
    }
    await updater(fakeFetch(routes)).check()
    const second = fakeFetch(routes)
    await expect(updater(second).check({ force: true })).resolves.toMatchObject({ status: 'up-to-date' })
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('arquivo baixado apagado ou corrompido conta como ausente', async () => {
    const fresh = bundleBytes(2, 'novo')
    const routes = {
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, fresh)] },
      [`${API}/v1/bible/bundles/2`]: fresh,
    }
    await updater(fakeFetch(routes)).check()
    writeFileSync(path.join(downloadDir, '2.json.gz'), gzipSync('quebrado'))
    await expect(updater(fakeFetch(routes)).check({ force: true })).resolves.toMatchObject({ updated: [2] })
  })

  it('sha256 do download não confere → descarta e mantém o anterior', async () => {
    const good = bundleBytes(2, 'bom')
    writeBundledManifest([{ versionId: 2, sha256: 'outro' }])
    const fetchImpl = fakeFetch({
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, good)] },
      [`${API}/v1/bible/bundles/2`]: bundleBytes(2, 'adulterado'),
    })
    await expect(updater(fetchImpl).check()).resolves.toMatchObject({ status: 'error', updated: [], failed: [2] })
    expect(existsSync(path.join(downloadDir, '2.json.gz'))).toBe(false)
    expect(store.invalidate).not.toHaveBeenCalled()
  })

  it('uma versão falhando não impede as outras', async () => {
    const b2 = bundleBytes(2)
    const b10 = bundleBytes(10)
    const fetchImpl = fakeFetch({
      [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, b2), remoteEntry(10, b10)] },
      [`${API}/v1/bible/bundles/2`]: new Error('rede caiu'),
      [`${API}/v1/bible/bundles/10`]: b10,
    })
    await expect(updater(fetchImpl).check()).resolves.toMatchObject({ status: 'error', updated: [10], failed: [2] })
  })

  it('API fora do ar ou sem o endpoint (versão antiga) → erro silencioso', async () => {
    await expect(updater(fakeFetch({ [`${API}/v1/bible/bundles`]: new Error('offline') })).check()).resolves.toMatchObject({
      status: 'error',
    })
    await expect(updater(fakeFetch({})).check()).resolves.toMatchObject({ status: 'error' })
  })

  it('no máximo 1 verificação por dia, salvo force; erro não conta como verificação', async () => {
    const b2 = bundleBytes(2)
    writeBundledManifest([{ versionId: 2, sha256: sha(b2) }])
    const routes = { [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, b2)] } }

    const offline = fakeFetch({ [`${API}/v1/bible/bundles`]: new Error('offline') })
    await updater(offline).check()
    const afterError = fakeFetch(routes)
    await expect(updater(afterError).check()).resolves.toMatchObject({ status: 'up-to-date' })

    const sameDay = fakeFetch(routes)
    clock += DAY - 1
    await expect(updater(sameDay).check()).resolves.toMatchObject({ status: 'skipped' })
    expect(sameDay).not.toHaveBeenCalled()
    await expect(updater(sameDay).check({ force: true })).resolves.toMatchObject({ status: 'up-to-date' })

    // a verificação forçada acima também conta: o próximo dia vale a partir dela
    clock += DAY
    const nextDay = fakeFetch(routes)
    await expect(updater(nextDay).check()).resolves.toMatchObject({ status: 'up-to-date' })
  })

  it('chamadas simultâneas compartilham a mesma verificação', async () => {
    const b2 = bundleBytes(2)
    writeBundledManifest([{ versionId: 2, sha256: sha(b2) }])
    const fetchImpl = fakeFetch({ [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, b2)] } })
    const u = updater(fetchImpl)
    const [a, b] = await Promise.all([u.check(), u.check()])
    expect(a).toBe(b)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('remove bundle baixado de versão que voltou a ser igual ao do instalador', async () => {
    const fresh = bundleBytes(2, 'novo')
    await updater(
      fakeFetch({
        [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, fresh)] },
        [`${API}/v1/bible/bundles/2`]: fresh,
      }),
    ).check()

    const bundled = bundleBytes(2, 'instalador')
    writeBundledManifest([{ versionId: 2, sha256: sha(bundled) }])
    const result = await updater(
      fakeFetch({ [`${API}/v1/bible/bundles`]: { schema: 1, versions: [remoteEntry(2, bundled)] } }),
    ).check({ force: true })
    expect(result).toMatchObject({ status: 'up-to-date' })
    expect(existsSync(path.join(downloadDir, '2.json.gz'))).toBe(false)
    expect(store.invalidate).toHaveBeenLastCalledWith(2)
  })
})
