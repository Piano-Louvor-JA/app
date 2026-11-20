// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { checkBuildGuard, guardError } from '../build-guard.mjs'

describe('checkBuildGuard — fail-closed (RF-03)', () => {
  it('non-release sem produção: OK', () => {
    const result = checkBuildGuard({
      env: {},
      rendererConfig: {
        VITE_URL_DATABASE: 'https://api-stg.pianolouvorja.com.br/json_db',
        VITE_URL_FILES: 'https://api-stg.pianolouvorja.com.br/file',
        VITE_PALCO_API_URL: 'https://api-stg.pianolouvorja.com.br',
        VITE_API_FALLBACK_URLS: '',
      },
    })
    expect(result.ok).toBe(true)
  })

  it('non-release com PIANO_API_BASE_URL de produção: ERRO', () => {
    const result = checkBuildGuard({
      env: { PIANO_API_BASE_URL: 'https://api.pianolouvorja.com.br' },
      rendererConfig: {},
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/produção/)
  })

  it('non-release com produção em variável RENDERER (VITE_URL_DATABASE): ERRO', () => {
    const result = checkBuildGuard({
      env: {},
      rendererConfig: {
        VITE_URL_DATABASE: 'https://api.pianolouvorja.com.br/json_db',
      },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/VITE_URL_DATABASE/)
  })

  it('non-release com produção em fallbacks (VITE_API_FALLBACK_URLS): ERRO', () => {
    const result = checkBuildGuard({
      env: {},
      rendererConfig: {
        VITE_API_FALLBACK_URLS: 'https://api.pianolouvorja.com.br',
      },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/fallback/i)
  })

  it('release SEM sinal de autorização: ERRO', () => {
    const result = checkBuildGuard({
      env: { PIANO_BUILD_PROFILE: 'release' },
      rendererConfig: {},
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/autoriza/i)
  })

  it('release COM sinal de autorização do pipeline oficial: OK com produção', () => {
    const result = checkBuildGuard({
      env: {
        PIANO_BUILD_PROFILE: 'release',
        PIANO_RELEASE_AUTHORIZED: 'true',
        GITHUB_REF_TYPE: 'tag',
      },
      rendererConfig: {
        VITE_URL_DATABASE: 'https://api.pianolouvorja.com.br/json_db',
      },
    })
    expect(result.ok).toBe(true)
  })

  it('release com sinal mas SEM tag do pipeline: ERRO (workflow_dispatch não libera)', () => {
    const result = checkBuildGuard({
      env: {
        PIANO_BUILD_PROFILE: 'release',
        PIANO_RELEASE_AUTHORIZED: 'true',
        GITHUB_REF_TYPE: 'branch',
      },
      rendererConfig: {},
    })
    expect(result.ok).toBe(false)
  })

  it('guardError formata erro claro e não-vazio', () => {
    const text = guardError(['erro 1', 'erro 2'], 'homologation')
    expect(text).toContain('PIANO_BUILD_PROFILE')
    expect(text).toContain('erro 1')
  })
})
