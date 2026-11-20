export type PianoBuildProfile = 'development' | 'test' | 'homologation' | 'release'

export const PROFILES: readonly PianoBuildProfile[]
export const HOSTS: Readonly<{ stg: string; production: string }>
export const PRODUCTION_ORIGIN: string
export const PRODUCTION_HOSTNAME: string

export function isProductionUrl(value: unknown): boolean
export function isReleaseProfile(profile: string | undefined): boolean
export const BAKED_PROFILE_FILE: string
export function readBakedProfile(modulePath?: string): string | undefined
export function resolveBuildProfile(env?: NodeJS.ProcessEnv, bakedProfile?: string): PianoBuildProfile
export function profileApiConfig(profile: PianoBuildProfile): {
  profile: PianoBuildProfile
  primary: string
  fallbackHosts: string[]
}
export function rendererApiEnvFor(env?: NodeJS.ProcessEnv): {
  VITE_PIANO_PROFILE: PianoBuildProfile
  VITE_URL_DATABASE: string
  VITE_URL_FILES: string
  VITE_PALCO_API_URL: string
  VITE_API_FALLBACK_URLS?: string
}
export function resolveEffectiveApi(env?: NodeJS.ProcessEnv, bakedProfile?: string): {
  profile: PianoBuildProfile
  primary: string
  fallbackHosts: string[]
  isRelease: boolean
}
export function diagnosticApiHosts(env?: NodeJS.ProcessEnv, bakedProfile?: string): string[]
