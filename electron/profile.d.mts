export type PianoBuildProfile = 'development' | 'test' | 'homologation' | 'release'

export const PROFILES: readonly PianoBuildProfile[]
export const HOSTS: Readonly<{ stg: string; production: string }>
export const PRODUCTION_ORIGIN: string
export const PRODUCTION_HOSTNAME: string

export function isProductionUrl(value: unknown): boolean
export function isReleaseProfile(profile: string | undefined): boolean
export function resolveBuildProfile(env?: NodeJS.ProcessEnv): PianoBuildProfile
export function profileApiConfig(profile: PianoBuildProfile): {
  profile: PianoBuildProfile
  primary: string
  fallbackHosts: string[]
}
export function resolveEffectiveApi(env?: NodeJS.ProcessEnv): {
  profile: PianoBuildProfile
  primary: string
  fallbackHosts: string[]
  isRelease: boolean
}
export function diagnosticApiHosts(env?: NodeJS.ProcessEnv): string[]
