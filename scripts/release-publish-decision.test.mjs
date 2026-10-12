import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

import { decidePublish, fetchDecision } from './release-publish-decision.mjs'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const scriptPath = join(repoRoot, 'scripts/release-publish-decision.mjs')
const authorized = '6b6fdf14fbe29303459621848579709ecd7ff0e5'
const tagged = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const repo = 'Piano-Louvor-JA/app'

const policy = {
  promotions: [
    {
      repo,
      version: '1.30.0',
      mode: 'tag_only',
      promotionPr: 431,
      authorizedCommit: authorized,
      authorizeContainingTree: true,
    },
  ],
}

function decision(overrides = {}) {
  return decidePublish({
    repo,
    tag: 'v1.30.0',
    commit: tagged,
    packageVersion: '1.30.0',
    policy,
    policyFromTaggedCommit: true,
    authorizedCommitIsAncestor: false,
    ...overrides,
  })
}

test('versão futura continua publicando', () => {
  const result = decision({ tag: 'v1.31.0', packageVersion: '1.31.0' })
  assert.equal(result.publish, true)
  assert.equal(result.fail, false)
})

test('ausência de política publica', () => {
  const result = decision({ policy: null, policyFromTaggedCommit: false, tag: 'v1.29.2' })
  assert.equal(result.publish, true)
})

test('tag_only no commit que contém a política não publica', () => {
  const first = decision()
  const resumed = decision()
  assert.equal(first.publish, false)
  assert.equal(first.fail, false)
  assert.deepEqual(resumed, first)
})

test('tag_only quando o commit autorizado é ancestral não publica', () => {
  const result = decision({
    policy: {
      promotions: [{ ...policy.promotions[0], authorizeContainingTree: false }],
    },
    authorizedCommitIsAncestor: true,
  })
  assert.equal(result.publish, false)
  assert.equal(result.fail, false)
})

test('commit diferente sem autorização da árvore bloqueia a publicação', () => {
  const result = decision({
    policy: {
      promotions: [{ ...policy.promotions[0], authorizeContainingTree: false }],
    },
    authorizedCommitIsAncestor: false,
  })
  assert.equal(result.publish, false)
  assert.equal(result.fail, true)
})

test('repositório ou manifesto divergente bloqueia a publicação', () => {
  assert.equal(decision({ repo: 'Piano-Louvor-JA/api' }).fail, true)
  assert.equal(decision({ packageVersion: '1.29.1' }).publish, false)
  assert.equal(decision({ packageVersion: '1.29.1' }).fail, true)
})

test('política presente e malformada bloqueia a publicação', () => {
  const result = decision({ policy: { repo }, policyFromTaggedCommit: true })
  assert.equal(result.fail, true)
  assert.equal(result.publish, false)
})

function installFakeGh(fixtures) {
  const dir = mkdtempSync(join(tmpdir(), 'gh-fake-'))
  const bin = join(dir, 'gh')
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const fixtures = JSON.parse(process.env.GH_FIXTURES)
const api = process.argv.find((arg) => String(arg).includes('repos/')) || ''
const hit = fixtures.find((item) => api.includes(item.match))
if (!hit) {
  console.error('sem fixture para ' + api)
  process.exit(1)
}
if (hit.status && hit.status !== 200) {
  console.error(hit.error || 'Not Found')
  process.exit(hit.status)
}
if (process.argv.includes('--jq')) {
  process.stdout.write(String(hit.jq ?? ''))
  process.exit(0)
}
process.stdout.write(hit.raw ?? '')
`,
  )
  chmodSync(bin, 0o755)
  return {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    GH_FIXTURES: JSON.stringify(fixtures),
  }
}

function runFetch(env, ref) {
  return spawnSync(process.execPath, [scriptPath, '--fetch', '--repo', repo, '--ref', ref], {
    env,
    encoding: 'utf8',
  })
}

test('consulta remota tag_only omite a release e a retomada repete a omissão', () => {
  const env = installFakeGh([
    { match: '/commits/v1.30.0', jq: tagged },
    { match: 'contents/package.json', raw: JSON.stringify({ version: '1.30.0' }) },
    { match: 'tag-only-promotions.json', raw: JSON.stringify(policy) },
    { match: '/compare/', jq: 'diverged' },
  ])
  const output = join(mkdtempSync(join(tmpdir(), 'gh-out-')), 'output')
  env.GITHUB_OUTPUT = output
  const first = runFetch(env, 'v1.30.0')
  const second = runFetch(env, 'v1.30.0')
  assert.equal(first.status, 0, first.stderr)
  assert.equal(second.status, 0)
  assert.match(first.stdout, /publish=false/)
  assert.match(second.stdout, /publish=false/)
  assert.equal(readFileSync(output, 'utf8').trim().split('\n').at(-2), 'publish=false')
})

test('consulta remota de outra versão publica', () => {
  const future = {
    promotions: policy.promotions,
  }
  const env = installFakeGh([
    { match: '/commits/v1.31.0', jq: tagged },
    { match: 'contents/package.json', raw: JSON.stringify({ version: '1.31.0' }) },
    { match: 'tag-only-promotions.json', raw: JSON.stringify(future) },
    { match: '/compare/', jq: 'ahead' },
  ])
  const result = runFetch(env, 'v1.31.0')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /publish=true/)
})

test('consulta remota sem política publica e falha de identidade não publica', () => {
  const missing = installFakeGh([
    { match: '/commits/v1.29.0', jq: tagged },
    { match: 'contents/package.json', raw: JSON.stringify({ version: '1.29.0' }) },
    { match: 'tag-only-promotions.json', status: 404, error: 'Not Found' },
  ])
  const published = runFetch(missing, 'v1.29.0')
  assert.equal(published.status, 0, published.stderr)
  assert.match(published.stdout, /publish=true/)

  const mismatch = installFakeGh([
    { match: '/commits/v1.30.0', jq: tagged },
    { match: 'contents/package.json', raw: JSON.stringify({ version: '1.29.1' }) },
    { match: 'tag-only-promotions.json', raw: JSON.stringify(policy) },
    { match: '/compare/', jq: 'ahead' },
  ])
  const blocked = runFetch(mismatch, 'v1.30.0')
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stdout, /publish=false/)
  assert.doesNotMatch(blocked.stdout, /publish=true/)
})

test('fetchDecision usa o mesmo contrato da linha de comando', () => {
  const env = installFakeGh([
    { match: 'contents/package.json', raw: JSON.stringify({ version: '1.30.0' }) },
    { match: 'tag-only-promotions.json', raw: JSON.stringify(policy) },
    { match: '/compare/', jq: 'ahead' },
  ])
  const previous = process.env
  process.env = env
  try {
    const result = fetchDecision({ repo, ref: tagged })
    assert.equal(result.publish, false)
    assert.equal(result.fail, false)
  } finally {
    process.env = previous
  }
})

test('workflows preservam a publicação padrão e omitem só a promoção marcada', () => {
  const workflows = {
    'release.yml': readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8'),
    'build-macos.yml': readFileSync(join(repoRoot, '.github/workflows/build-macos.yml'), 'utf8'),
    'build-windows.yml': readFileSync(join(repoRoot, '.github/workflows/build-windows.yml'), 'utf8'),
    'build-flatpak.yml': readFileSync(join(repoRoot, '.github/workflows/build-flatpak.yml'), 'utf8'),
  }
  for (const [name, text] of Object.entries(workflows)) {
    assert.match(text, /^on:/m, name)
    assert.match(text, /scripts\/release-publish-decision\.mjs/, name)
    assert.match(text, /needs\.decide\.outputs\.publish == 'true'|steps\.decision\.outputs\.publish == 'true'/, name)
  }
  for (const name of ['release.yml', 'build-macos.yml', 'build-windows.yml']) {
    assert.match(workflows[name], /tags:/, name)
  }
  assert.match(workflows['release.yml'], /gh release create/)
  assert.match(workflows['release.yml'], /if: needs\.decide\.outputs\.publish == 'true'/)
  assert.match(workflows['build-macos.yml'], /--publish always/)
  assert.match(workflows['build-macos.yml'], /if: steps\.decision\.outputs\.publish == 'true'/)
  assert.match(workflows['build-windows.yml'], /gh release upload/)
  assert.match(workflows['build-windows.yml'], /if: steps\.decision\.outputs\.publish == 'true'/)
  assert.match(workflows['build-flatpak.yml'], /needs: decide/)
  assert.ok(workflows['build-flatpak.yml'].includes('name=louvorja-piano.flatpak'))
})
