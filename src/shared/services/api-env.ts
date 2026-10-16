/**
 * Contrato de ambiente API no RENDERER (SPEC piano-api-env-guard v1.0).
 *
 * Espelho tipado do `electron/profile.mjs` (contrato único). O perfil chega
 * aqui via `import.meta.env.VITE_PIANO_PROFILE` (injetado pelo vite.config
 * a partir de PIANO_BUILD_PROFILE) — NÃO confiar em .env local gitignored.
 *
 * Regra absoluta: perfil não-release usa STG e NUNCA contém produção.
 */

const HOSTS = {
  stg: 'https://api-stg.pianolouvorja.com.br',
  production: 'https://api.pianolouvorja.com.br',
} as const

/** Fallbacks públicos do ecossistema (legados LouvorJA) — NÃO são a API de
 * produção pianolouvorja; mantidos em todo perfil (hotfix 14/09: o app sempre
 * precisa de onde requisitar). Produção NUNCA entra como fallback. */
const PUBLIC_FALLBACK_HOSTS = [
  'https://api.louvorja.com.br',
  'https://api.louvorja.workers.dev',
]

export type PianoProfile = 'development' | 'test' | 'homologation' | 'release'

export function resolveRendererProfile(): PianoProfile {
  const raw = import.meta.env.VITE_PIANO_PROFILE
  if (raw === 'release') return 'release'
  // development | test | homologation (e ausente — fail-safe STG)
  return 'homologation'
}

export function isProductionHost(url: string): boolean {
  return url.includes('api.pianolouvorja.com.br')
}

export interface RendererApiEnv {
  profile: PianoProfile
  isRelease: boolean
  /** Primária por kind: base completa com caminho (/json_db | /file). */
  primary(kind: 'database' | 'files'): string
  /** Fallbacks (hosts, origem) permitidos no perfil — sem duplicar a primária. */
  fallbackHosts(): string[]
}

export function rendererApiEnv(): RendererApiEnv {
  const profile = resolveRendererProfile()
  const isRelease = profile === 'release'
  const base = isRelease ? HOSTS.production : HOSTS.stg
  return {
    profile,
    isRelease,
    primary(kind) {
      return kind === 'database' ? `${base}/json_db` : `${base}/file`
    },
    fallbackHosts() {
      return [...PUBLIC_FALLBACK_HOSTS]
    },
  }
}

/** Hosts (sem esquema) da cascata de API do perfil — paridade com o main. */
export function rendererApiHosts(): string[] {
  const apiEnv = rendererApiEnv()
  const hosts = [new URL(apiEnv.isRelease ? HOSTS.production : HOSTS.stg).hostname]
  for (const fb of apiEnv.fallbackHosts()) hosts.push(new URL(fb).hostname)
  return hosts
}

/** Defaults de perfil para consumidores renderer (VITE_* ausente => STG). */
export function defaultApiOrigin(): string {
  return rendererApiEnv().isRelease ? HOSTS.production : HOSTS.stg
}

export function defaultFilesBase(): string {
  return rendererApiEnv().primary('files')
}

export function defaultDatabaseBase(): string {
  return rendererApiEnv().primary('database')
}
