#!/usr/bin/env node
// Verificação pós-build do bundle (SPEC piano-api-env-guard, RF-03).
//
// O guard pré-build só valida o env. Caso real (v1.31.0): o CI buildou com
// PIANO_BUILD_PROFILE=release e o guard passou, mas o renderer saiu em STG
// (define do perfil perdido num merge) e o main não sabia o perfil no PC do
// usuário. Este passo confere o que de fato vai para o app.asar:
//  1. dist/build-profile.json existe e tem o perfil do build (lido pelo main);
//  2. as bases VITE_URL_DATABASE/VITE_URL_FILES do contrato estão no JS;
//  3. release sem base STG; non-release sem base de produção.
//
// Uso: node electron/guard/verify-bundle.mjs [distDir]   (padrão: dist)

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BAKED_PROFILE_FILE, HOSTS, rendererApiEnvFor } from '../profile.mjs'

const BASE_PATHS = ['/json_db', '/file']

/**
 * Confere o bundle já gerado. `expected` é o rendererApiEnvFor() do build,
 * `sources` o conteúdo dos .js do renderer. Retorna { ok, errors }.
 */
export function verifyRendererBundle({ expected, bakedProfile, sources }) {
  const errors = []
  const profile = expected.VITE_PIANO_PROFILE
  const text = sources.join('\n')

  if (bakedProfile !== profile) {
    errors.push(
      `${BAKED_PROFILE_FILE} com perfil "${bakedProfile ?? '(ausente)'}", esperado "${profile}": ` +
        'o main empacotado não saberia o perfil do build.',
    )
  }

  for (const key of ['VITE_URL_DATABASE', 'VITE_URL_FILES']) {
    if (!text.includes(expected[key])) {
      errors.push(`Renderer sem ${key}=${expected[key]}: o define do perfil não foi aplicado ao bundle.`)
    }
  }

  const forbiddenHost = profile === 'release' ? HOSTS.stg : HOSTS.production
  for (const base of BASE_PATHS.map((p) => `${forbiddenHost}${p}`)) {
    if (text.includes(base)) {
      errors.push(`Renderer do perfil "${profile}" contém ${base}.`)
    }
  }

  return { ok: errors.length === 0, errors }
}

/** Lê dist/ (JS do renderer + perfil gravado) e verifica contra o env do build. */
export function verifyDist({ distDir, env = process.env }) {
  const expected = rendererApiEnvFor(env)
  const assetsDir = path.join(distDir, 'assets')
  const sources = existsSync(assetsDir)
    ? readdirSync(assetsDir)
        .filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(path.join(assetsDir, f), 'utf8'))
    : []
  if (sources.length === 0) {
    return { ok: false, errors: [`Nenhum .js em ${assetsDir}: rode o vite build antes.`] }
  }

  let bakedProfile
  try {
    bakedProfile = JSON.parse(readFileSync(path.join(distDir, BAKED_PROFILE_FILE), 'utf8')).profile
  } catch {
    bakedProfile = undefined
  }

  return verifyRendererBundle({ expected, bakedProfile, sources })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distDir = path.resolve(process.argv[2] ?? 'dist')
  const { ok, errors } = verifyDist({ distDir })
  const profile = rendererApiEnvFor(process.env).VITE_PIANO_PROFILE
  if (!ok) {
    console.error(`[verify-bundle] bundle inválido para o perfil "${profile}" (${distDir}):`)
    for (const error of errors) console.error(`✗ ${error}`)
    process.exit(1)
  }
  console.log(`[verify-bundle] bundle OK: perfil ${profile} gravado e URLs de API do perfil no renderer.`)
}
