import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  generatePalcoToken,
  isValidPalcoTokenFormat,
  loadOrCreatePalcoToken,
  requestHasPalcoAccess,
} from '../palco-token.mjs'

const dirs = []
function tempDir() {
  const d = mkdtempSync(path.join(tmpdir(), 'palco-token-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

describe('generatePalcoToken', () => {
  it('gera 5 chars A-Z0-9 (faixa do Delphi/original)', () => {
    const t = generatePalcoToken()
    expect(t).toMatch(/^[A-Z0-9]{5}$/)
  })
  it('gera tokens distintos (99,9%+)', () => {
    expect(generatePalcoToken()).not.toBe(generatePalcoToken())
  })
})

describe('isValidPalcoTokenFormat', () => {
  it('aceita 5 A-Z0-9', () => {
    expect(isValidPalcoTokenFormat('ABC12')).toBe(true)
  })
  it('rejeita curto/longo/caracteres', () => {
    expect(isValidPalcoTokenFormat('abc12')).toBe(false)
    expect(isValidPalcoTokenFormat('ABC123')).toBe(false)
    expect(isValidPalcoTokenFormat('ABC1')).toBe(false)
    expect(isValidPalcoTokenFormat('')).toBe(false)
  })
})

describe('loadOrCreatePalcoToken', () => {
  it('cria e persiste no config path', () => {
    const cfg = path.join(tempDir(), 'cfg', 'palco-token.txt')
    const t1 = loadOrCreatePalcoToken(cfg)
    expect(t1).toMatch(/^[A-Z0-9]{5}$/)
    expect(readFileSync(cfg, 'utf8')).toBe(t1)
  })
  it('reaproveita token existente', () => {
    const cfg = path.join(tempDir(), 'palco-token.txt')
    const t1 = loadOrCreatePalcoToken(cfg)
    expect(loadOrCreatePalcoToken(cfg)).toBe(t1)
  })
  it('token inválido no arquivo → regenera', () => {
    const cfg = path.join(tempDir(), 'palco-token.txt')
    writeBad(cfg)
    const t = loadOrCreatePalcoToken(cfg)
    expect(t).toMatch(/^[A-Z0-9]{5}$/)
    expect(readFileSync(cfg, 'utf8')).toBe(t)
  })
})

import { writeFileSync } from 'node:fs'
function writeBad(p) {
  writeFileSync(p, 'x', 'utf8')
}

describe('requestHasPalcoAccess', () => {
  const TOKEN = 'ABC12'

  it('localhost (127.0.0.1/::1/::ffff:127.0.0.1) bypassa', () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(requestHasPalcoAccess({ token: null, url: '/palco', remoteAddress: ip, expectedToken: TOKEN })).toBe(true)
    }
  })
  it('query ?token= correto passa (TV/OBS)', () => {
    expect(requestHasPalcoAccess({ token: 'ABC12', url: '/palco?token=ABC12', remoteAddress: '192.168.0.50', expectedToken: TOKEN })).toBe(true)
  })
  it('query ?token= errado NÃO passa', () => {
    expect(requestHasPalcoAccess({ token: 'XXX', url: '/palco?token=99999', remoteAddress: '192.168.0.50', expectedToken: TOKEN })).toBe(false)
  })
  it('sem token e fora do localhost → NÃO passa', () => {
    expect(requestHasPalcoAccess({ token: null, url: '/palco', remoteAddress: '192.168.0.50', expectedToken: TOKEN })).toBe(false)
  })
  it('header x-palco-token também é aceito (WS clients sem query)', () => {
    expect(requestHasPalcoAccess({ token: null, url: '/palco', remoteAddress: '192.168.0.50', expectedToken: TOKEN, headers: { 'x-palco-token': 'ABC12' } })).toBe(true)
  })
  it('sem expectedToken (feature desligada) → libera (compat atual)', () => {
    expect(requestHasPalcoAccess({ token: null, url: '/palco', remoteAddress: '192.168.0.50', expectedToken: null })).toBe(true)
  })
})
