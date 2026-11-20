import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ensureRelease, releasesForTag } from './release-draft.mjs'

const repo = 'Piano-Louvor-JA/app'
const tag = 'v1.31.2'

// API em memória: reproduz a lista de releases que o GitHub devolve (com drafts).
function fakeApi(initial = []) {
  const releases = [...initial]
  const calls = { list: 0, create: 0 }
  return {
    releases,
    calls,
    list(target) {
      assert.equal(target, repo)
      calls.list += 1
      return releases.map((release) => ({ ...release }))
    },
    create(target, name) {
      assert.equal(target, repo)
      calls.create += 1
      const release = { id: 1000 + releases.length, tag_name: name, draft: true }
      releases.push(release)
      return { ...release }
    },
  }
}

const noSleep = async () => {}

test('releasesForTag ignora releases de outras tags', () => {
  const found = releasesForTag(
    [
      { id: 1, tag_name: 'v1.31.1', draft: false },
      { id: 2, tag_name: tag, draft: true },
    ],
    tag,
  )
  assert.deepEqual(
    found.map((release) => release.id),
    [2],
  )
})

test('create: sem release para a tag, cria um único draft', async () => {
  const api = fakeApi()
  const result = await ensureRelease({ repo, tag, mode: 'create', api, sleep: noSleep })
  assert.equal(result.created, true)
  assert.equal(result.release.draft, true)
  assert.equal(api.calls.create, 1)
  assert.equal(api.releases.length, 1)
})

test('create: release já existente é reutilizada sem criar outra', async () => {
  const api = fakeApi([{ id: 7, tag_name: tag, draft: false }])
  const result = await ensureRelease({ repo, tag, mode: 'create', api, sleep: noSleep })
  assert.equal(result.created, false)
  assert.equal(result.release.id, 7)
  assert.equal(api.calls.create, 0)
})

test('wait: nunca cria release; espera o criador único publicar o draft', async () => {
  const api = fakeApi()
  let polls = 0
  const sleep = async () => {
    polls += 1
    // O release.yml cria o draft enquanto o build Windows/macOS espera.
    if (polls === 2) api.releases.push({ id: 9, tag_name: tag, draft: true })
  }
  const result = await ensureRelease({ repo, tag, mode: 'wait', api, sleep, timeoutMs: 60_000, intervalMs: 1_000 })
  assert.equal(result.release.id, 9)
  assert.equal(result.created, false)
  assert.equal(api.calls.create, 0)
})

test('wait: falha ao estourar o tempo sem release, sem criar nenhuma', async () => {
  const api = fakeApi()
  await assert.rejects(
    ensureRelease({ repo, tag, mode: 'wait', api, sleep: noSleep, timeoutMs: 3_000, intervalMs: 1_000 }),
    /nenhuma GitHub Release para v1\.31\.2/,
  )
  assert.equal(api.calls.create, 0)
})

test('duplicada para a mesma tag falha em todos os modos e não cria mais nada', async () => {
  // Caso v1.31.2: dois publishers criaram releases 415509227 e 415509229.
  const duplicated = [
    { id: 415509227, tag_name: tag, draft: false },
    { id: 415509229, tag_name: tag, draft: true },
  ]
  for (const mode of ['create', 'wait', 'check']) {
    const api = fakeApi(duplicated)
    await assert.rejects(
      ensureRelease({ repo, tag, mode, api, sleep: noSleep }),
      /2 GitHub Releases para v1\.31\.2 \(415509227, 415509229\)/,
    )
    assert.equal(api.calls.create, 0)
  }
})

test('check: exige exatamente uma release', async () => {
  await assert.rejects(ensureRelease({ repo, tag, mode: 'check', api: fakeApi(), sleep: noSleep }), /nenhuma/)
  const result = await ensureRelease({
    repo,
    tag,
    mode: 'check',
    api: fakeApi([{ id: 3, tag_name: tag, draft: false }]),
    sleep: noSleep,
  })
  assert.equal(result.release.id, 3)
})

test('rejeita tag fora do formato vX.Y.Z e modo desconhecido', async () => {
  await assert.rejects(ensureRelease({ repo, tag: 'main', mode: 'create', api: fakeApi() }), /tag inválida/)
  await assert.rejects(ensureRelease({ repo, tag, mode: 'publish', api: fakeApi() }), /modo inválido/)
})
