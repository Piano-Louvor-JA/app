import { afterEach, describe, expect, it, vi } from 'vitest'
import { rendererApiEnv, rendererApiHosts, defaultApiOrigin, defaultFilesBase,
  defaultDatabaseBase, isProductionHost } from '../api-env'

afterEach(() => vi.unstubAllEnvs())

describe('renderer API environment contract', () => {
  it.each(['release', 'development', 'test', 'homologation', '', undefined])(
    'selects the approved primary and fallbacks for profile %s', (profile) => {
      vi.stubEnv('VITE_PIANO_PROFILE', profile)
      const release = profile === 'release'
      const host = release ? 'api.pianolouvorja.com.br' : 'api-stg.pianolouvorja.com.br'
      const origin = `https://${host}`
      const env = rendererApiEnv()
      expect(env.profile).toBe(release ? 'release' : 'homologation')
      expect(env.isRelease).toBe(release)
      expect(env.primary('database')).toBe(`${origin}/json_db`)
      expect(env.primary('files')).toBe(`${origin}/file`)
      expect(defaultApiOrigin()).toBe(origin)
      expect(defaultDatabaseBase()).toBe(`${origin}/json_db`)
      expect(defaultFilesBase()).toBe(`${origin}/file`)
      expect(rendererApiHosts()).toEqual([host, 'api.louvorja.com.br', 'api.louvorja.workers.dev'])
      expect(env.fallbackHosts()).toEqual(['https://api.louvorja.com.br', 'https://api.louvorja.workers.dev'])
      env.fallbackHosts().push('https://invalid.example')
      expect(env.fallbackHosts()).toHaveLength(2)
      expect(isProductionHost(origin)).toBe(release)
    })
})
