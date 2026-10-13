// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { APP_API_ENV_KEYS } from '../prod-url-guard'

it.each(['process.env', '.env.development.local'])('Playwright aborta antes da spec com produção em %s', source => {
  const root = mkdtempSync(join(tmpdir(), 'playwright-guard-'))
  try {
    const repo = resolve(import.meta.dirname, '../../..')
    const marker = join(root, 'spec-started')
    const config = join(root, 'playwright.config.mjs')
    symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir')
    writeFileSync(config, "export default {testDir:'.',testMatch:'probe.spec.ts',globalSetup:process.env.GUARD_PROBE_SETUP,reporter:'line'};")
    writeFileSync(join(root, 'probe.spec.ts'), "import {test} from '@playwright/test'; import {writeFileSync} from 'node:fs';test('sentinel',()=>{writeFileSync(process.env.GUARD_PROBE_MARKER!,'started')});")
    const env = { ...process.env, GUARD_PROBE_SETUP: join(repo, 'e2e/global-setup.ts'), GUARD_PROBE_MARKER: marker }
    for (const key of [...APP_API_ENV_KEYS, 'VITE_API_FALLBACK_URLS']) delete env[key]
    Object.assign(env, { VITE_URL_DATABASE:'http://localhost:3100/json_db',VITE_URL_FILES:'http://localhost:3100/file',VITE_PALCO_API_URL:'http://localhost:3100' })
    if (source === 'process.env') env.VITE_URL_FILES = 'https://api.pianolouvorja.com.br/file'
    else { delete env.VITE_URL_FILES; writeFileSync(join(root, '.env.development.local'), 'VITE_URL_FILES=https://api.pianolouvorja.com.br/file') }
    const result = spawnSync(process.execPath, [join(repo, 'node_modules/@playwright/test/cli.js'), 'test', '--config', config], { cwd:root,env,encoding:'utf8',timeout:20000 })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout+result.stderr).toContain('E2E apontando para PRODUÇÃO')
    expect(existsSync(marker)).toBe(false)
  } finally { rmSync(root, {recursive:true,force:true}) }
}, 30000)
