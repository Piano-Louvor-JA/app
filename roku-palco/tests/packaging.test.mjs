import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync(new URL('../scripts/package.mjs', import.meta.url), 'utf8')

test('package script builds deterministic ZIP entries', () => {
  assert.match(script, /dosEpoch|1980|fixed/i, 'packaging must pin entry timestamps')
  assert.match(script, /sort\(\)/, 'packaging must order entries')
})

test('bsconfig and package config stay in sync', () => {
  const bsconfig = JSON.parse(readFileSync(new URL('../bsconfig.json', import.meta.url), 'utf8'))
  assert.equal(bsconfig.outFile, 'dist/PianoPalcoRoku.zip')
  assert.equal(bsconfig.stagingFolderPath, 'dist/staging')
  assert.ok(bsconfig.diagnosticFilters.some((f) => f.codes.includes(1129)))
})
