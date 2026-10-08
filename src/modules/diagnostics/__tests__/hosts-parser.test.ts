import { describe, expect, it } from 'vitest'

import { maskToken, parseHostsOverrides } from '../services/hosts-parser'

describe('parseHostsOverrides (hosts SOMENTE LEITURA)', () => {
  it('extrai entrada de AV que sequestra domínio da API', () => {
    const content = [
      '127.0.0.1 localhost',
      '::1 localhost',
      '0.0.0.0 api.pianolouvorja.com.br # blocked by AV',
      '10.0.0.5 api.louvorja.com.br',
    ].join('\n')
    const overrides = parseHostsOverrides(content)
    expect(overrides).toEqual([
      { ip: '0.0.0.0', hostname: 'api.pianolouvorja.com.br' },
      { ip: '10.0.0.5', hostname: 'api.louvorja.com.br' },
    ])
  })

  it('ignora comentários e linhas malformadas', () => {
    const content = '# 0.0.0.0 api.pianolouvorja.com.br (comentada — não conta)\njusthostname\n'
    expect(parseHostsOverrides(content)).toEqual([])
  })

  it('match de subdomínio, mas não de domínio parecido', () => {
    const content = ['1.2.3.4 sub.api.louvorja.com.br', '5.6.7.8 notapilouvorja.com.br'].join('\n')
    const overrides = parseHostsOverrides(content)
    expect(overrides).toHaveLength(1)
    expect(overrides[0]).toEqual({ ip: '1.2.3.4', hostname: 'sub.api.louvorja.com.br' })
  })

  it('hostname case-insensitive', () => {
    expect(parseHostsOverrides('1.1.1.1 API.PIANOLOUVORJA.COM.BR')).toHaveLength(1)
  })

  it('workers.dev na lista', () => {
    expect(parseHostsOverrides('9.9.9.9 api.louvorja.workers.dev')).toEqual([
      { ip: '9.9.9.9', hostname: 'api.louvorja.workers.dev' },
    ])
  })
})

describe('maskToken (Api-Token nunca vai cru no relatório)', () => {
  it('mascara: 4 primeiros chars + tamanho', () => {
    expect(maskToken('abcdef123456')).toBe('abcd…(12 chars)')
  })

  it('token ausente → null', () => {
    expect(maskToken(undefined)).toBeNull()
    expect(maskToken('')).toBeNull()
  })

  it('token curto não vaza o resto', () => {
    expect(maskToken('ab')).toBe('ab…(2 chars)')
  })
})
