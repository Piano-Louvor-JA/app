import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  coverageMinimumPercent,
  evaluateCoverage,
} from './coverage-gate-limit.mjs'

function summary(pct) {
  const metric = { pct, covered: pct, total: 100 }
  return {
    total: {
      statements: metric,
      branches: metric,
      functions: metric,
      lines: metric,
    },
    'src/example.vue': {
      statements: metric,
      branches: metric,
      functions: metric,
      lines: metric,
    },
  }
}

test('PR para staging usa 50% e os demais caminhos permanecem em 100%', () => {
  assert.equal(
    coverageMinimumPercent({ eventName: 'pull_request', baseRef: 'staging' }),
    50,
  )
  assert.equal(
    coverageMinimumPercent({ eventName: 'pull_request', baseRef: 'main' }),
    100,
  )
  assert.equal(
    coverageMinimumPercent({ eventName: 'push', baseRef: 'staging' }),
    100,
  )
  assert.equal(
    coverageMinimumPercent({ eventName: 'push', baseRef: 'main' }),
    100,
  )
  assert.equal(
    coverageMinimumPercent({ eventName: 'workflow_dispatch', baseRef: '' }),
    100,
  )
  assert.equal(coverageMinimumPercent({ eventName: 'pull_request' }), 100)
})

test('medição de 50% passa na staging e falha no caminho de 100%', () => {
  const atFloor = evaluateCoverage(summary(50), 50)
  const belowFloor = evaluateCoverage(summary(49.99), 50)
  const onMain = evaluateCoverage(summary(50), 100)
  const full = evaluateCoverage(summary(100), 100)

  assert.deepEqual(atFloor.failures, [])
  assert.equal(belowFloor.failures.length, 4)
  assert.equal(onMain.failures.length, 4)
  assert.deepEqual(full.failures, [])
})

test('o comando aplica 50% na PR para staging e 100% fora dela', () => {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-'))
  const file = join(dir, 'summary.json')
  writeFileSync(file, JSON.stringify(summary(50)))

  const staging = spawnSync(
    process.execPath,
    ['scripts/coverage-gate-limit.mjs', file],
    {
      cwd: repoRoot,
      env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', PR_BASE_REF: 'staging' },
      encoding: 'utf8',
    },
  )
  assert.equal(staging.status, 0, staging.stderr)
  assert.match(staging.stdout, /Limite de cobertura: 50%/)

  const main = spawnSync(
    process.execPath,
    ['scripts/coverage-gate-limit.mjs', file],
    {
      cwd: repoRoot,
      env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', PR_BASE_REF: 'main' },
      encoding: 'utf8',
    },
  )
  assert.equal(main.status, 1)
  assert.match(main.stdout, /Limite de cobertura: 100%/)
  assert.match(main.stderr, /COBERTURA < 100/)
})
