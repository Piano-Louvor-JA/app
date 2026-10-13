import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiCandidateBases } from '@shared/services/api-fallback'

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete (import.meta.env as Record<string, unknown>)[key]
  } else {
    ;(import.meta.env as Record<string, unknown>)[key] = value
  }
}

const STG = 'https://api-stg.pianolouvorja.com.br'
const PROD = 'https://api.pianolouvorja.com.br'

beforeEach(() => {
  setEnv('VITE_URL_DATABASE', undefined)
  setEnv('VITE_URL_FILES', undefined)
  setEnv('VITE_API_FALLBACK_URLS', undefined)
  setEnv('VITE_PALCO_API_URL', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RF-01/RF-02 — defaults do renderer derivam do perfil (non-release => STG)', () => {
  it('sem env NENHUMA: primária STG (não produção) e fallbacks sem produção', () => {
    const bases = apiCandidateBases('database')
    expect(bases[0]).toBe(`${STG}/json_db`)
    const joined = bases.join(' ')
    expect(joined).not.toContain(PROD)
    expect(joined).not.toContain('api.pianolouvorja.com.br')
  })

  it('files: base STG sem env', () => {
    expect(apiCandidateBases('files')[0]).toBe(`${STG}/file`)
  })

  it('env VITE_URL_DATABASE=STG sobrepõe default: continua STG', () => {
    setEnv('VITE_URL_DATABASE', `${STG}/json_db`)
    expect(apiCandidateBases('database')[0]).toBe(`${STG}/json_db`)
  })

  it('fallbacks default de non-release: nenhum host de produção', () => {
    const bases = apiCandidateBases('database')
    for (const b of bases) {
      expect(b).not.toContain('api.pianolouvorja.com.br')
    }
  })

  it('env injeta produção em fallback: host de produção é descartado em non-release', () => {
    setEnv('VITE_API_FALLBACK_URLS', `${PROD},https://api.louvorja.com.br`)
    const bases = apiCandidateBases('database')
    expect(bases.join(' ')).not.toContain('api.pianolouvorja.com.br')
    expect(bases.join(' ')).toContain('api.louvorja.com.br')
  })

  it('perfil release (VITE_PIANO_PROFILE=release): produção permitida com fallbacks aprovados', () => {
    setEnv('VITE_PIANO_PROFILE', 'release')
    const bases = apiCandidateBases('database')
    expect(bases[0]).toBe(`${PROD}/json_db`)
    expect(bases.join(' ')).toContain('api.louvorja.com.br')
    setEnv('VITE_PIANO_PROFILE', undefined)
  })
})
