// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { diagnosticApiHosts } from '../profile.mjs'


const STG_HOST = 'api-stg.pianolouvorja.com.br'
const PROD_HOST = 'api.pianolouvorja.com.br'

describe('RF-02 — diagnóstico deriva hosts do perfil (não API_HOSTS[0] fixo de produção)', () => {
  it('sem perfil: host primário é STG', () => {
    expect(diagnosticApiHosts({})[0]).toBe(STG_HOST)
  })

  it('perfil homologation/development/test: primário STG, sem host de produção', () => {
    for (const profile of ['development', 'test', 'homologation']) {
      const hosts = diagnosticApiHosts({ PIANO_BUILD_PROFILE: profile })
      expect(hosts[0]).toBe(STG_HOST)
      expect(hosts.join(' ')).not.toContain(PROD_HOST)
    }
  })

  it('perfil release: primário produção + fallbacks aprovados', () => {
    const hosts = diagnosticApiHosts({ PIANO_BUILD_PROFILE: 'release' })
    expect(hosts[0]).toBe(PROD_HOST)
    expect(hosts.join(' ')).toContain('api.louvorja.com.br')
  })
})
