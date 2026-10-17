// Teste de integração: builda o renderer de verdade (vite build) por perfil e
// confere o bundle gerado, do jeito que ele vai para o app.asar.
//
// Caso real (v1.31.0): o CI buildou com PIANO_BUILD_PROFILE=release, mas o
// renderer saiu em STG (define do perfil perdido num merge) e o main resolvia o
// perfil pelo env do PC do usuário (sempre homologation). Os testes unitários
// passavam porque cobriam o contrato, não o artefato.
//
// Uso: node --test scripts/release-bundle.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { verifyDist } from '../electron/guard/verify-bundle.mjs'
import { HOSTS } from '../electron/profile.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROD = HOSTS.production
const STG = HOSTS.stg

/** Env limpo de VITE_* / PIANO_* do shell de quem roda o teste. */
function cleanEnv(extra) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('VITE_') && !key.startsWith('PIANO_')) env[key] = value
  }
  return { ...env, ...extra }
}

function build(profile) {
  const outDir = mkdtempSync(path.join(tmpdir(), `piano-bundle-${profile}-`))
  const res = spawnSync(
    process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--base=./', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
    { cwd: ROOT, env: cleanEnv({ PIANO_BUILD_PROFILE: profile }), encoding: 'utf8' },
  )
  assert.equal(res.status, 0, `vite build (${profile}) falhou:\n${res.stderr}`)
  return outDir
}

function bundleText(distDir) {
  const assets = path.join(distDir, 'assets')
  return readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(path.join(assets, f), 'utf8'))
    .join('\n')
}

/** Monta app.asar/{dist,electron/profile.mjs} e resolve a API como o main empacotado. */
async function packagedMainApi(distDir) {
  const appDir = path.join(mkdtempSync(path.join(tmpdir(), 'piano-pkg-')), 'app.asar')
  cpSync(distDir, path.join(appDir, 'dist'), { recursive: true })
  mkdirSync(path.join(appDir, 'electron'))
  copyFileSync(path.join(ROOT, 'electron/profile.mjs'), path.join(appDir, 'electron/profile.mjs'))
  const mod = await import(pathToFileURL(path.join(appDir, 'electron/profile.mjs')).href)
  // Env vazio: o PC do usuário não tem PIANO_BUILD_PROFILE.
  return { effective: mod.resolveEffectiveApi({}), diagnostics: mod.diagnosticApiHosts({}) }
}

test('bundle de release: renderer e main apontam para produção', async () => {
  const distDir = build('release')

  const check = verifyDist({ distDir, env: { PIANO_BUILD_PROFILE: 'release' } })
  assert.deepEqual(check.errors, [])

  const text = bundleText(distDir)
  assert.ok(text.includes(`${PROD}/json_db`), 'renderer sem a base de catálogo de produção')
  assert.ok(text.includes(`${PROD}/file`), 'renderer sem a base de arquivos de produção')
  assert.ok(!text.includes(`${STG}/json_db`), 'renderer de release com catálogo STG')
  assert.ok(!text.includes(`${STG}/file`), 'renderer de release com arquivos STG')

  const { effective, diagnostics } = await packagedMainApi(distDir)
  assert.equal(effective.profile, 'release')
  assert.equal(effective.primary, PROD)
  assert.equal(diagnostics[0], 'api.pianolouvorja.com.br')
})

test('bundle de homologation: renderer e main ficam em STG, sem produção', async () => {
  const distDir = build('homologation')

  const check = verifyDist({ distDir, env: { PIANO_BUILD_PROFILE: 'homologation' } })
  assert.deepEqual(check.errors, [])

  const text = bundleText(distDir)
  assert.ok(text.includes(`${STG}/json_db`), 'renderer sem a base de catálogo STG')
  assert.ok(!text.includes(`${PROD}/json_db`), 'renderer de homologation com catálogo de produção')
  assert.ok(!text.includes(`${PROD}/file`), 'renderer de homologation com arquivos de produção')

  const { effective } = await packagedMainApi(distDir)
  assert.equal(effective.profile, 'homologation')
  assert.equal(effective.primary, STG)
})
