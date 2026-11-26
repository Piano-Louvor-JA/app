import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPianoApiHost,
  partnerKeyForUrl,
  PARTNER_KEY_HEADER,
  resolvePartnerKey,
} from '../partner-key'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('partner-key', () => {
  it('reconhece só hosts da API Piano', () => {
    expect(isPianoApiHost('api-stg.pianolouvorja.com.br')).toBe(true)
    expect(isPianoApiHost('api.pianolouvorja.com.br')).toBe(true)
    expect(isPianoApiHost('localhost')).toBe(true)
    expect(isPianoApiHost('api.louvorja.com.br')).toBe(false)
    expect(isPianoApiHost('files.louvorja.com.br')).toBe(false)
  })

  it('STG usa VITE_PARTNER_KEY_STG; release usa PROD', () => {
    const env = {
      VITE_PARTNER_KEY_STG: 'plj_stgkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      VITE_PARTNER_KEY_PROD: 'plj_prodkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    }
    expect(resolvePartnerKey(env, 'homologation')).toBe(env.VITE_PARTNER_KEY_STG)
    expect(resolvePartnerKey(env, 'development')).toBe(env.VITE_PARTNER_KEY_STG)
    expect(resolvePartnerKey(env, 'release')).toBe(env.VITE_PARTNER_KEY_PROD)
  })

  it('VITE_PARTNER_KEY vence o par STG/PROD', () => {
    const env = {
      VITE_PARTNER_KEY: 'plj_overridexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      VITE_PARTNER_KEY_STG: 'plj_stgkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      VITE_PARTNER_KEY_PROD: 'plj_prodkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    }
    expect(resolvePartnerKey(env, 'release')).toBe(env.VITE_PARTNER_KEY)
    expect(resolvePartnerKey(env, 'homologation')).toBe(env.VITE_PARTNER_KEY)
  })

  it('ignora valor sem prefixo plj_ (não manda lixo → 401)', () => {
    expect(resolvePartnerKey({ VITE_PARTNER_KEY_STG: 'token-errado' }, 'homologation')).toBe('')
    expect(resolvePartnerKey({ VITE_PARTNER_KEY: '   ' }, 'release')).toBe('')
  })

  it('partnerKeyForUrl só em hosts Piano', () => {
    const env = { VITE_PARTNER_KEY_STG: 'plj_stgkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
    expect(partnerKeyForUrl('https://api-stg.pianolouvorja.com.br/json_db/x.json', env, 'homologation')).toBe(
      env.VITE_PARTNER_KEY_STG,
    )
    expect(partnerKeyForUrl('https://api.louvorja.com.br/json_db/x.json', env, 'homologation')).toBe('')
    expect(PARTNER_KEY_HEADER).toBe('X-Partner-Key')
  })
})
