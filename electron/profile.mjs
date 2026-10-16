// Contrato ÚNICO de ambiente API (SPEC piano-api-env-guard v1.0).
//
// Perfis: development | test | homologation | release.
// Regra de produto: builds não-release NUNCA falam com a API de produção.
// - PIANO_BUILD_PROFILE ausente/inválido => homologation (STG), NUNCA release.
// - Renderer (vite define), main (constants) e diagnóstico derivam DAQUI.
//
// Este arquivo é ESM puro, sem dependência nova, importável por:
//   - electron/*.mjs (main + diagnóstico)
//   - vite.config.ts (via import direto — injeta o contrato no renderer)
//   - scripts/guard (build guard fail-closed)

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROFILES = ['development', 'test', 'homologation', 'release']

/** Hosts canônicos (SPEC). */
export const HOSTS = {
  stg: 'https://api-stg.pianolouvorja.com.br',
  production: 'https://api.pianolouvorja.com.br',
}

/** Fallbacks públicos aprovados — liberados SOMENTE no perfil release. */
const RELEASE_FALLBACK_HOSTS = [
  'https://api.louvorja.com.br',
  'https://api.louvorja.workers.dev',
]

export const PRODUCTION_ORIGIN = HOSTS.production
export const PRODUCTION_HOSTNAME = 'api.pianolouvorja.com.br'

export function isProductionUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  return value.includes(PRODUCTION_HOSTNAME)
}

export function isReleaseProfile(profile) {
  return profile === 'release'
}

/** Arquivo que o build grava em dist/ com o perfil do pacote (lido pelo main). */
export const BAKED_PROFILE_FILE = 'build-profile.json'

const MODULE_PATH = fileURLToPath(import.meta.url)

/**
 * Perfil gravado no pacote pelo build (dist/build-profile.json).
 *
 * O main roda no PC do usuário, onde PIANO_BUILD_PROFILE não existe: sem isso
 * uma release cai em homologation/STG. Só vale dentro do app.asar — em dev,
 * build e testes um dist/ antigo nunca decide o perfil.
 */
export function readBakedProfile(modulePath = MODULE_PATH) {
  if (!/[\\/]app\.asar[\\/]/.test(modulePath)) return undefined
  try {
    const file = path.join(path.dirname(modulePath), '..', 'dist', BAKED_PROFILE_FILE)
    const { profile } = JSON.parse(readFileSync(file, 'utf8'))
    return typeof profile === 'string' ? profile : undefined
  } catch {
    return undefined
  }
}

/**
 * Perfil efetivo. Ordem: PIANO_BUILD_PROFILE > perfil gravado no pacote >
 * homologation (fail-safe STG). Valor inválido lança — melhor falhar na cara
 * do que empacotar produção.
 */
export function resolveBuildProfile(env = process.env, bakedProfile = readBakedProfile()) {
  const raw = env.PIANO_BUILD_PROFILE?.trim() || bakedProfile?.trim()
  if (!raw) return 'homologation'
  const profile = raw.toLowerCase()
  if (!PROFILES.includes(profile)) {
    throw new Error(
      `PIANO_BUILD_PROFILE inválido: "${raw}". Valores permitidos: ${PROFILES.join(', ')}. ` +
        'Use "homologation" para builds de teste (STG). "release" exige pipeline oficial de tag.',
    )
  }
  return profile
}

/**
 * Contrato de endpoints por perfil.
 * Non-release: primária STG; fallbacks públicos legados (NÃO produção —
 * hotfix 14/09: o app sempre precisa de onde requisitar).
 * Release: produção + fallbacks públicos aprovados.
 */
const PUBLIC_FALLBACK_HOSTS = [...RELEASE_FALLBACK_HOSTS]

export function profileApiConfig(profile) {
  if (isReleaseProfile(profile)) {
    return { profile, primary: HOSTS.production, fallbackHosts: [...RELEASE_FALLBACK_HOSTS] }
  }
  return { profile, primary: HOSTS.stg, fallbackHosts: [...PUBLIC_FALLBACK_HOSTS] }
}

/**
 * Variáveis que o vite.config injeta no renderer (define). VITE_* explícito no
 * env do processo vence; senão vale o contrato do perfil. Nunca lê .env local.
 */
export function rendererApiEnvFor(env = process.env) {
  const profile = resolveBuildProfile(env)
  const contract = profileApiConfig(profile)
  const fallbacks = env.VITE_API_FALLBACK_URLS ?? contract.fallbackHosts.join(',')
  return {
    VITE_PIANO_PROFILE: profile,
    VITE_URL_DATABASE: env.VITE_URL_DATABASE ?? `${contract.primary}/json_db`,
    VITE_URL_FILES: env.VITE_URL_FILES ?? `${contract.primary}/file`,
    VITE_PALCO_API_URL: env.VITE_PALCO_API_URL ?? contract.primary,
    ...(fallbacks ? { VITE_API_FALLBACK_URLS: fallbacks } : {}),
  }
}

function originOf(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    return new URL(value.trim()).origin
  } catch {
    return ''
  }
}

/**
 * Configuração EFETIVA de API para main/empacotamento.
 *
 * Env sobrepõe o contrato do perfil, COM uma exceção de segurança (RF-02):
 * em perfil non-release, qualquer env apontando para produção é REJEITADO —
 * não rebaixado em silêncio — para que um .env local esquecido nunca vaze
 * produção num artefato de teste.
 *
 * Ordem da primária: PIANO_API_BASE_URL > VITE_URL_FILES (origem) >
 * VITE_PALCO_API_URL (origem) > contrato do perfil.
 */
export function resolveEffectiveApi(env = process.env, bakedProfile = readBakedProfile()) {
  const profile = resolveBuildProfile(env, bakedProfile)
  const contract = profileApiConfig(profile)
  const explicit = env.PIANO_API_BASE_URL?.trim()
  const candidate =
    explicit?.replace(/\/+$/, '') ||
    originOf(env.VITE_URL_FILES) ||
    originOf(env.VITE_PALCO_API_URL) ||
    contract.primary

  if (!isReleaseProfile(profile) && isProductionUrl(candidate)) {
    throw new Error(
      `[perfil ${profile}] URL de API de produção (${PRODUCTION_ORIGIN}) é proibida em perfil não-release. ` +
        'Builds de desenvolvimento/teste/homologação usam STG. Remova a variável de produção do ambiente/.env.',
    )
  }

  let fallbackHosts = contract.fallbackHosts
  const envFallbacks = env.PIANO_API_FALLBACK_URLS ?? env.VITE_API_FALLBACK_URLS
  if (typeof envFallbacks === 'string' && envFallbacks.trim()) {
    const parsed = envFallbacks
      .split(',')
      .map((h) => h.trim().replace(/\/+$/, ''))
      .filter(Boolean)
    fallbackHosts = isReleaseProfile(profile)
      ? parsed
      : parsed.filter((h) => !isProductionUrl(h))
  }

  return { profile, primary: candidate, fallbackHosts, isRelease: isReleaseProfile(profile) }
}

/**
 * Hosts para o diagnóstico (RF-02): primário do perfil + fallbacks.
 * Diagnóstico de non-release NUNCA sonda produção.
 */
export function diagnosticApiHosts(env = process.env, bakedProfile = readBakedProfile()) {
  const { primary, fallbackHosts } = resolveEffectiveApi(env, bakedProfile)
  const hosts = [new URL(primary).hostname]
  for (const fb of fallbackHosts) {
    try {
      hosts.push(new URL(fb).hostname)
    } catch {
      // fallback inválido no env: ignora (diagnóstico só usa hosts válidos)
    }
  }
  return [...new Set(hosts)]
}
