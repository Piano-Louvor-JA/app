// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { electronOptions, runElectron } from './run-electron.mjs'

const require = createRequire(import.meta.url)

describe('portable Electron launcher', () => {
  for (const platform of ['linux', 'win32', 'darwin']) {
    it(`clears Node mode without a shell on ${platform}`, () => {
      const original = { ELECTRON_RUN_AS_NODE: '1', PIANO_DEV_DATA_DIR: '/isolated data', CUSTOM: 'keep' }
      const options = electronOptions({ env: original, platform, args: ['--trace-warnings'] })
      expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
      expect(options.env.CUSTOM).toBe('keep')
      expect(options.env.PIANO_DEV_DATA_DIR).toBe('/isolated data')
      expect(original.ELECTRON_RUN_AS_NODE).toBe('1')
      expect(options.args).toEqual(platform === 'linux' ? ['.', '--class=louvorja-piano', '--trace-warnings'] : ['.', '--trace-warnings'])
      expect(options.shell).toBe(false)
    })
  }

  it('uses the executable resolved by the installed Electron package', () => {
    expect(electronOptions().executable).toBe(require('electron'))
  })

  it('propagates exit status and captures both output streams in paths with spaces', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'piano launcher '))
    const fixture = join(directory, 'fake electron.cjs')
    const logPath = join(directory, 'desktop log.txt')
    writeFileSync(fixture, "console.log(process.env.ELECTRON_RUN_AS_NODE || 'node-mode-cleared'); console.error('stderr-preserved'); process.exitCode = 7")
    try {
      const result = await runElectron({ executable: process.execPath, args: [fixture], logPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
      expect(result).toBe(7)
      const log = readFileSync(logPath, 'utf8')
      expect(log).toContain('node-mode-cleared')
      expect(log).toContain('stderr-preserved')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('returns failure when the executable cannot start', async () => {
    expect(await runElectron({ executable: join(tmpdir(), 'piano-nonexistent-binary'), args: [] })).toBe(1)
  })

  it('rejects unknown CLI options before opening the application', () => {
    const result = spawnSync(process.execPath, ['scripts/run-electron.mjs', '--invalid'], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unknown option')
  })

  it('keeps npm desktop entry points free of POSIX-only environment commands', () => {
    const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    for (const name of ['electron:dev', 'electron:preview', 'electron:dev-log']) {
      expect(scripts[name]).not.toMatch(/env -u|\| tee|&& PIANO_BUILD_PROFILE=|^PIANO_BUILD_PROFILE=/)
      expect(scripts[name]).toContain('scripts/run-electron.mjs')
    }
  })
})
