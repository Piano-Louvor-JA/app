// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BAKED_PROFILE_FILE,
  HOSTS,
  PROFILES,
  isProductionUrl,
  isReleaseProfile,
  diagnosticApiHosts,
  profileApiConfig,
  readBakedProfile,
  rendererApiEnvFor,
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

// Caso real (v1.31.0): o main resolvia o perfil pelo env do PC do usuário, onde
// PIANO_BUILD_PROFILE não existe — release publicada caía em STG. O build grava
// o perfil em dist/build-profile.json e o app empacotado lê dali.
describe('perfil gravado no pacote (dist/build-profile.json)', () => {
  function packagedModulePath(content, { asar = true } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'piano-profile-'))
    const appDir = path.join(root, asar ? 'app.asar' : 'app')
    mkdirSync(path.join(appDir, 'electron'), { recursive: true })
    mkdirSync(path.join(appDir, 'dist'), { recursive: true })
    if (content !== undefined) writeFileSync(path.join(appDir, 'dist', BAKED_PROFILE_FILE), content)
    return path.join(appDir, 'electron', 'profile.mjs')
  }

  it('app empacotado: lê o perfil gravado pelo build', () => {
    expect(readBakedProfile(packagedModulePath(JSON.stringify({ profile: 'release' })))).toBe('release')
  })

  it('fora do asar (dev, build, testes): nunca usa um dist/ antigo', () => {
    const modulePath = packagedModulePath(JSON.stringify({ profile: 'release' }), { asar: false })
    expect(readBakedProfile(modulePath)).toBeUndefined()
  })

  it('arquivo ausente ou inválido: sem perfil gravado (cai em homologation)', () => {
    expect(readBakedProfile(packagedModulePath(undefined))).toBeUndefined()
    expect(readBakedProfile(packagedModulePath('{quebrado'))).toBeUndefined()
    expect(readBakedProfile(packagedModulePath(JSON.stringify({ profile: 7 })))).toBeUndefined()
  })

  it('sem env, o perfil gravado decide: release usa produção no main', () => {
    expect(resolveBuildProfile({}, 'release')).toBe('release')
    expect(resolveEffectiveApi({}, 'release').primary).toBe(PROD)
    expect(diagnosticApiHosts({}, 'release')[0]).toBe('api.pianolouvorja.com.br')
  })

  it('env explícito vence o perfil gravado', () => {
    expect(resolveBuildProfile({ PIANO_BUILD_PROFILE: 'homologation' }, 'release')).toBe('homologation')
    expect(resolveEffectiveApi({ PIANO_BUILD_PROFILE: 'development' }, 'release').primary).toBe(STG)
  })

  it('perfil gravado inválido: erro claro (fail-closed)', () => {
    expect(() => resolveBuildProfile({}, 'production')).toThrow(/PIANO_BUILD_PROFILE/)
  })
})

describe('rendererApiEnvFor — o que o vite injeta no renderer', () => {
  it('release: perfil e URLs de produção', () => {
    expect(rendererApiEnvFor({ PIANO_BUILD_PROFILE: 'release' })).toEqual({
      VITE_PIANO_PROFILE: 'release',
      VITE_URL_DATABASE: `${PROD}/json_db`,
      VITE_URL_FILES: `${PROD}/file`,
      VITE_PALCO_API_URL: PROD,
      VITE_API_FALLBACK_URLS: PUBLIC_FALLBACKS.join(','),
    })
  })

  it('sem perfil: homologation com URLs STG', () => {
    const env = rendererApiEnvFor({})
    expect(env.VITE_PIANO_PROFILE).toBe('homologation')
    expect(env.VITE_URL_DATABASE).toBe(`${STG}/json_db`)
    expect(env.VITE_URL_FILES).toBe(`${STG}/file`)
    expect(env.VITE_PALCO_API_URL).toBe(STG)
  })

  it('development sem VITE_URL_DATABASE expõe STG explícito ao renderer dev', () => {
    expect(rendererApiEnvFor({ PIANO_BUILD_PROFILE: 'development' }).VITE_URL_DATABASE)
      .toBe(`${STG}/json_db`)
  })

  it('non-release rejeita override PROD, vazio, relativo ou localhost', () => {
    for (const value of [PROD, '', '/json_db', 'http://localhost:5173/json_db']) {
      expect(() => rendererApiEnvFor({ PIANO_BUILD_PROFILE: 'development', VITE_URL_DATABASE: value }))
        .toThrow(/VITE_URL_DATABASE|produção|production/i)
    }
  })
})
