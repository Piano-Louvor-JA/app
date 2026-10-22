// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const validator = resolve('scripts/validate-release-artifacts.mjs')
function validateMac(options: { zip?: boolean; listed?: boolean; blockmap?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mac-update-'))
  const output = join(root, 'dist-electron')
  mkdirSync(output)
  const dmg = 'LouvorJA-PIANO-1.32.1-universal.dmg'
  const zip = 'LouvorJA-PIANO-1.32.1-universal.zip'
  const path = options.zip === false ? dmg : zip
  writeFileSync(join(output, dmg), '')
  if (options.zip !== false) writeFileSync(join(output, zip), '')
  if (options.blockmap !== false) writeFileSync(join(output, `${path}.blockmap`), '')
  writeFileSync(join(output, 'latest-mac.yml'), [
    'version: 1.32.1', 'files:',
    `  - url: ${options.listed === false ? dmg : path}`,
    `    sha512: ${'a'.repeat(88)}`,
    `path: ${path}`, `sha512: ${'a'.repeat(88)}`,
    'releaseDate: 2026-10-21T12:00:00.000Z',
  ].join('\n'))
  try {
    return spawnSync(process.execPath, [validator, 'mac', '1.32.1'], { cwd: root, encoding: 'utf8' })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

describe('pacote de atualização macOS', () => {
  it('aceita DMG + ZIP com manifesto e blockmap', () => {
    const result = validateMac()
    expect(result.status, result.stderr).toBe(0)
  })
  it('rejeita o pacote antigo que só contém DMG', () => {
    const result = validateMac({ zip: false })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('path não é .zip')
  })
  it('rejeita manifesto que não oferece ZIP ao MacUpdater', () => {
    const result = validateMac({ listed: false })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ZIP ausente da lista files')
  })
  it('rejeita ZIP sem blockmap', () => {
    expect(validateMac({ blockmap: false }).status).not.toBe(0)
  })
})
