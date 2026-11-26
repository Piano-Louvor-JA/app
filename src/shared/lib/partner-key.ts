/**
 * Token de parceiro da API Piano (X-Partner-Key) — SPEC api/partner-keys.
 *
 * Identifica o desktop nas métricas e permite revogar o acesso sem afetar
 * web/APK. Não é segredo forte (vai no binário); STG e prod têm chaves
 * distintas geradas na VPS (`node dist/cli/partners.js create "…"`).
 *
 * - Sem env: não envia o header (comportamento atual da API).
 * - Só hosts da API Piano (nunca PHP legado / R2 / Google).
 */

import { resolveRendererProfile, type PianoProfile } from '../services/api-env'

export const PARTNER_KEY_HEADER = 'X-Partner-Key'

const PIANO_API_HOSTS = new Set([
  'api-stg.pianolouvorja.com.br',
  'api.pianolouvorja.com.br',
  'localhost',
  '127.0.0.1',
])

type EnvBag = Record<string, string | undefined>

function readEnv(env: EnvBag, key: string): string {
  return String(env[key] ?? '').trim()
}

/** Host da API Piano (STG/prod/local) — único lugar onde o header entra. */
export function isPianoApiHost(hostname: string): boolean {
  return PIANO_API_HOSTS.has(hostname.toLowerCase())
}

/**
 * Resolve a chave do perfil atual.
 * Ordem: `VITE_PARTNER_KEY` (override do build) → STG ou PROD conforme perfil.
 * Só aceita o formato `plj_…` para não mandar lixo e tomar 401.
 */
export function resolvePartnerKey(
  env: EnvBag = import.meta.env as EnvBag,
  profile: PianoProfile = resolveRendererProfile(),
): string {
  const override = readEnv(env, 'VITE_PARTNER_KEY')
  const fromProfile =
    profile === 'release'
      ? readEnv(env, 'VITE_PARTNER_KEY_PROD')
      : readEnv(env, 'VITE_PARTNER_KEY_STG')
  const key = override || fromProfile
  return key.startsWith('plj_') ? key : ''
}

export function partnerKeyForUrl(
  url: string,
  env?: EnvBag,
  profile?: PianoProfile,
): string {
  try {
    const host = new URL(url).hostname
    if (!isPianoApiHost(host)) return ''
  } catch {
    return ''
  }
  return resolvePartnerKey(env, profile)
}
