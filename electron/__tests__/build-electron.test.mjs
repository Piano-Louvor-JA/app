// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

describe('build-electron wrapper', () => {
  it.each([false, true])('configura APPX somente com identidade completa e restaura após falha (%s)', (enabled) => {
    const root = mkdtempSync(join(tmpdir(), 'appx-build-'))
    try {
      mkdirSync(join(root, 'scripts'))
      mkdirSync(join(root, 'bin'))
      copyFileSync(new URL('../../scripts/build-electron.mjs', import.meta.url), join(root, 'scripts/build-electron.mjs'))
      const original = JSON.stringify({ build: { win: { target: [{ target: 'nsis' }, { target: 'portable' }, { target: 'appx' }] }, appx: { applicationId: 'PianoLouvorJA' } } })
      writeFileSync(join(root, 'package.json'), original)
      writeFileSync(join(root, 'bin/npx'), `#!${process.execPath}\nconst fs=require('node:fs');fs.copyFileSync('package.json','observed.json');fs.writeFileSync('args.json',JSON.stringify(process.argv.slice(2)));process.exit(7)\n`, { mode: 0o755 })
      const env = { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, MS_STORE_IDENTITY_NAME: enabled ? 'example.identity' : '', MS_STORE_PUBLISHER_CN: 'CN=Example', MS_STORE_PUBLISHER_DISPLAY: 'Example' }
      const result = spawnSync(process.execPath, ['scripts/build-electron.mjs', '--', '--win', '--x64', '--publish', 'never'], { cwd: root, env, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(7)
      expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(original)
      const observed = JSON.parse(readFileSync(join(root, 'observed.json'), 'utf8'))
      expect(observed.build.win.target.map(t => t.target)).toEqual(enabled ? ['nsis', 'portable', 'appx'] : ['nsis', 'portable'])
      if (enabled) expect(observed.build.appx).toMatchObject({ identityName: 'example.identity', publisher: 'CN=Example', publisherDisplayName: 'Example' })
      else expect(observed.build.appx).toBeUndefined()
      expect(JSON.parse(readFileSync(join(root, 'args.json'), 'utf8'))).toEqual(['electron-builder', '--win', '--x64', '--publish', 'never'])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
