// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  HOSTS,
  PROFILES,
  isProductionUrl,
  isReleaseProfile,
  profileApiConfig,
  resolveBuildProfile,
  resolveEffectiveApi,
} from '../profile.mjs'

const PUBLIC_FALLBACKS = ['https://api.louvorja.com.br', 'https://api.louvorja.workers.dev']

const STG = HOSTS.stg
const PROD = HOSTS.production

describe('resolveBuildProfile (RF-01)', () => {
  it('perfil ausente/vazio resolve homologation (nunca release/produção)', () => {
    expect(resolveBuildProfile({})).toBe('homologation')
    expect(resolveBuildProfile({ PIANO_BUILD_PROFILE: '   ' })).toBe('homologation')
  })

  it('perfis permitidos: development, test, homologation, release', () => {
    expect(PROFILES).toEqual(['development', 'test', 'homologation', 'release'])
    for (const p of PROFILES) expect(resolveBuildProfile({ PIANO_BUILD_PROFILE: p })).toBe(p)
  })

  it('perfil inválido: erro claro (fail-closed)', () => {
    expect(() => resolveBuildProfile({ PIANO_BUILD_PROFILE: 'production' })).toThrow(/production/)
    expect(() => resolveBuildProfile({ PIANO_BUILD_PROFILE: 'stg' })).toThrow(/PIANO_BUILD_PROFILE/)
  })

  it('normaliza maiúsculas/minúsculas e espaços', () => {
    expect(resolveBuildProfile({ PIANO_BUILD_PROFILE: ' Release ' })).toBe('release')
  })
})

describe('profileApiConfig (RF-01/RF-02)', () => {
  it('homologation: primária STG, fallbacks públicos legados (nunca produção)', () => {
    const cfg = profileApiConfig('homologation')
    expect(cfg.primary).toBe(STG)
    expect(cfg.fallbackHosts).toEqual(PUBLIC_FALLBACKS)
    expect(cfg.fallbackHosts.some(isProductionUrl)).toBe(false)
    expect(isReleaseProfile('homologation')).toBe(false)
  })

  it('development e test: idênticos a homologation (STG, sem produção)', () => {
    for (const p of ['development', 'test']) {
      const cfg = profileApiConfig(p)
      expect(cfg.primary).toBe(STG)
      expect(cfg.fallbackHosts).toEqual(PUBLIC_FALLBACKS)
    }
  })

  it('release: primária produção + fallbacks públicos aprovados', () => {
    const cfg = profileApiConfig('release')
    expect(cfg.primary).toBe(PROD)
    expect(cfg.fallbackHosts).toEqual(['https://api.louvorja.com.br', 'https://api.louvorja.workers.dev'])
    expect(isReleaseProfile('release')).toBe(true)
  })
})

describe('resolveEffectiveApi — env sobrepõe, produção bloqueada fora de release (RF-02)', () => {
  it('sem env: resolve o contrato do perfil (homologation => STG)', () => {
    const cfg = resolveEffectiveApi({})
    expect(cfg.profile).toBe('homologation')
    expect(cfg.primary).toBe(STG)
    expect(cfg.fallbackHosts).toEqual(PUBLIC_FALLBACKS)
  })

  it('PIANO_API_BASE_URL STG sobrepõe em homologation', () => {
    expect(resolveEffectiveApi({ PIANO_API_BASE_URL: `${STG}/` }).primary).toBe(STG)
  })

  it('homologation com env apontando produção: REJEITA (falha, não rebaixa em silêncio)', () => {
    expect(() => resolveEffectiveApi({ PIANO_API_BASE_URL: PROD })).toThrow(/produção|production/i)
    expect(() => resolveEffectiveApi({ VITE_URL_FILES: `${PROD}/file` })).toThrow(/produção|production/i)
  })

  it('release com env de produção: permitido', () => {
    const cfg = resolveEffectiveApi({ PIANO_BUILD_PROFILE: 'release', VITE_URL_FILES: `${PROD}/file` })
    expect(cfg.primary).toBe(PROD)
    expect(cfg.profile).toBe('release')
  })

  it('release sem env: produção pelo contrato do perfil', () => {
    expect(resolveEffectiveApi({ PIANO_BUILD_PROFILE: 'release' }).primary).toBe(PROD)
  })

  it('fallbacks de non-release nunca contêm produção (RF-05.6)', () => {
    const cfg = resolveEffectiveApi({ PIANO_API_FALLBACK_URLS: `${PROD},https://api.louvorja.com.br` })
    expect(cfg.fallbackHosts.join(' ')).not.toContain('api.pianolouvorja.com.br')
  })
})
