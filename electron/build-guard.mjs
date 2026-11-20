// Guard fail-closed de build (SPEC piano-api-env-guard v1.0, RF-03).
//
// Roda ANTES de `vite build` e de `electron-builder`. Dois vetores:
//  1. non-release + qualquer URL de produção na configuração efetiva => ERRO.
//     Valida env do processo E variáveis renderer (VITE_*) já renderizadas —
//     não apenas o .env de entrada.
//  2. PIANO_BUILD_PROFILE=release exige sinal de autorização do pipeline
//     oficial de tag/release: PIANO_RELEASE_AUTHORIZED=true (setado SÓ no
//     workflow de release) E GITHUB_REF_TYPE=tag. workflow_dispatch, PR e
//     build local não obtêm bypass silencioso.

import {
  isProductionUrl,
  isReleaseProfile,
  resolveBuildProfile,
  resolveEffectiveApi,
} from './profile.mjs'

/** Variáveis renderer que carregam origens de API. */
const RENDERER_API_VARS = [
  'VITE_URL_DATABASE',
  'VITE_URL_FILES',
  'VITE_PALCO_API_URL',
  'VITE_API_FALLBACK_URLS',
]

/**
 * Valida o build. Retorna { ok, errors, profile } — NUNCA lança: o chamador
 * (CLI) imprime guardError() e sai com exit 1.
 */
export function checkBuildGuard({ env = process.env, rendererConfig = {} } = {}) {
  const errors = []
  let profile
  try {
    profile = resolveBuildProfile(env)
  } catch (error) {
    return { ok: false, profile: null, errors: [error.message] }
  }

  // (2) release exige gate explícito e auditável do pipeline oficial.
  if (isReleaseProfile(profile)) {
    const authorized = env.PIANO_RELEASE_AUTHORIZED === 'true'
    const fromTag = env.GITHUB_REF_TYPE === 'tag'
    if (!authorized || !fromTag) {
      errors.push(
        'Perfil "release" (API de produção) exige autorização do pipeline oficial de tag/release: ' +
          'PIANO_RELEASE_AUTHORIZED=true E GITHUB_REF_TYPE=tag. ' +
          'Builds locais, PR e workflow_dispatch devem usar PIANO_BUILD_PROFILE=homologation (STG).',
      )
    }
  }

  // Config efetiva do main (env + contrato). Rejeita produção em non-release.
  let effective = null
  try {
    effective = resolveEffectiveApi(env)
  } catch (error) {
    errors.push(error.message)
  }

  // Variáveis RENDERER (config já renderizada pelo vite define, não só .env).
  if (!isReleaseProfile(profile)) {
    for (const key of RENDERER_API_VARS) {
      const value = rendererConfig[key]
      if (typeof value === 'string' && isProductionUrl(value)) {
        errors.push(
          `Variável renderer ${key} contém URL de produção em perfil não-release "${profile}": ${value}`,
        )
      }
    }
  }

  return { ok: errors.length === 0, errors, profile, effective }
}

export function guardError(errors, profile) {
  return [
    '╔══════════════════════════════════════════════════════════╗',
    '║  BUILD GUARD — ambiente API inválido para este perfil    ║',
    '╚══════════════════════════════════════════════════════════╝',
    `Perfil: PIANO_BUILD_PROFILE=${profile ?? '(inválido/ausente)'}`,
    '',
    ...errors.map((e) => `✗ ${e}`),
    '',
    'Builds de desenvolvimento/teste/homologação usam API STG.',
    'Produção só entra via workflow oficial de tag/release.',
    'Ver PIANO_BUILD_PROFILE, PIANO_API_BASE_URL, VITE_URL_* e VITE_API_FALLBACK_URLS.',
  ].join('\n')
}
