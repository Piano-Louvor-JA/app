// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  applyEnvFile,
  resolveApiBaseUrl,
  resolveMediaFetchUrl,
} from '../api-base.mjs'

const STG = 'https://api-stg.pianolouvorja.com.br'
const PROD = 'https://api.pianolouvorja.com.br'

describe('resolveApiBaseUrl', () => {
  it('usa PIANO_API_BASE_URL quando existe', () => {
    expect(resolveApiBaseUrl({ PIANO_API_BASE_URL: `${STG}/` })).toBe(STG)
  })

  it('cai na origem de VITE_URL_FILES', () => {
    expect(resolveApiBaseUrl({ VITE_URL_FILES: `${STG}/file` })).toBe(STG)
  })

  it('cai em VITE_PALCO_API_URL e, por último, na produção', () => {
    expect(resolveApiBaseUrl({ VITE_PALCO_API_URL: STG })).toBe(STG)
    expect(resolveApiBaseUrl({})).toBe(PROD)
  })
})

describe('resolveMediaFetchUrl', () => {
  const built = `${STG}/file/images/capa.jpg`

  it('mantém a URL https do host configurado na tela', () => {
    const requested = `${STG}/file/images/capa.jpg`
    expect(resolveMediaFetchUrl(requested, built, STG)).toBe(requested)
  })

  it('reconstroi no host configurado quando a URL pedida é de outro ambiente', () => {
    const requested = `${PROD}/file/images/capa.jpg`
    expect(resolveMediaFetchUrl(requested, built, STG)).toBe(built)
  })

  it('reconstroi quando a URL pedida não é https de um host conhecido', () => {
    expect(resolveMediaFetchUrl('http://127.0.0.1/file/x.jpg', built, STG)).toBe(built)
    expect(resolveMediaFetchUrl('', built, STG)).toBe(built)
  })
})

describe('applyEnvFile', () => {
  it('preenche variáveis ausentes e não sobrescreve as já definidas', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'louvorja-env-'))
    const envPath = path.join(dir, '.env')
    writeFileSync(envPath, "PIANO_API_BASE_URL=https://api-stg.pianolouvorja.com.br\nVITE_URL_FILES='https://api-stg.pianolouvorja.com.br/file'\n")
    const env = { VITE_URL_FILES: 'https://api.pianolouvorja.com.br/file' }
    applyEnvFile(envPath, env)
    expect(env.PIANO_API_BASE_URL).toBe(STG)
    expect(env.VITE_URL_FILES).toBe(`${PROD}/file`)
  })
})
