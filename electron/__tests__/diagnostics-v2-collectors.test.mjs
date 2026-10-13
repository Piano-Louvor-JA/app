// @vitest-environment node
// diagnostics-v2:* — testes dos collectors de triage geral (SOMENTE LEITURA).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  crashHistory,
  diskFreeMb,
  dnsSanity,
  essentialHeaders,
  safe,
  storageHealth,
  userDataWriteProbe,
} from '../diagnostics-v2-collectors.mjs'

const roots = []

function tempRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'diagv2-test-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('essentialHeaders', () => {
  it('retorna null pra essencial inexistente', () => {
    const dir = tempRoot()
    const out = essentialHeaders(path.join(dir, '.sysdata'), ['pt_categories'])
    expect(out.pt_categories).toBeNull()
  })

  it('lê bytes + header hex de arquivo existente', () => {
    const sysdata = path.join(tempRoot(), '.sysdata')
    mkdirSync(sysdata, { recursive: true })
    writeFileSync(path.join(sysdata, 'pt_categories.bin'), Buffer.from('PK\x03\x04CONTEUDO'))
    const out = essentialHeaders(sysdata, ['pt_categories'])
    expect(out.pt_categories.bytes).toBe(12)
    expect(out.pt_categories.head.startsWith('504b0304')).toBe(true)
  })

  it('marca erro de leitura sem derrubar os outros', () => {
    const sysdata = path.join(tempRoot(), '.sysdata')
    mkdirSync(sysdata, { recursive: true })
    writeFileSync(path.join(sysdata, 'a.bin'), 'ok')
    mkdirSync(path.join(sysdata, 'b.bin')) // diretório com nome de binário: readFileSync falha
    const out = essentialHeaders(sysdata, ['a', 'b'])
    expect(out.a.head).toBeDefined()
    expect(out.b.erro).toBe('leitura-falhou')
  })
})

describe('userDataWriteProbe', () => {
  it('não se aplica a diretório inexistente (nunca cria)', () => {
    const out = userDataWriteProbe(path.join(tempRoot(), 'nao-existe'))
    expect(out).toEqual({ aplicavel: false, ok: null })
  })

  it('ok=true em diretório gravável', () => {
    expect(userDataWriteProbe(tempRoot()).ok).toBe(true)
  })
})

describe('storageHealth', () => {
  it('null pra userData inexistente', () => {
    expect(storageHealth(path.join(tempRoot(), 'nada'))).toBeNull()
  })

  it('detecta lock órfão (SingletonLock apontando pra PID morto)', () => {
    const root = tempRoot()
    writeFileSync(path.join(root, 'SingletonLock'), `host-${Date.now()}`)
    const out = storageHealth(root)
    expect(out.lockOrfao).toBe(true)
  })

  it('lock com PID vivo não é órfão', () => {
    const root = tempRoot()
    writeFileSync(path.join(root, 'SingletonLock'), `host-${process.pid}`)
    expect(storageHealth(root).lockOrfao).toBe(false)
  })

  it('detecta .ldb vazio no leveldb', () => {
    const root = tempRoot()
    mkdirSync(path.join(root, 'Local Storage', 'leveldb'), { recursive: true })
    writeFileSync(path.join(root, 'Local Storage', 'leveldb', '000001.ldb'), '')
    const out = storageHealth(root)
    expect(out.ldbVazio).toBe(true)
  })

  it('soma tamanhos do Local Storage', () => {
    const root = tempRoot()
    mkdirSync(path.join(root, 'Local Storage'), { recursive: true })
    writeFileSync(path.join(root, 'Local Storage', 'data.log'), 'x'.repeat(1000))
    const out = storageHealth(root)
    expect(out.localStorageBytes).toBe(1000)
    expect(out.localStorageSuspeito).toBe(false)
  })
})

describe('dnsSanity', () => {
  it('IP compartilhado entre hosts distintos = suspeito', () => {
    const out = dnsSanity([
      { host: 'a.com', dns: { ok: true, ips: ['1.2.3.4'] } },
      { host: 'b.com', dns: { ok: true, ips: ['1.2.3.4'] } },
    ])
    expect(out[0].dnsSuspeito).toBe(true)
    expect(out[1].dnsSuspeito).toBe(true)
  })

  it('workers.dev fora de faixa Cloudflare = suspeito', () => {
    const out = dnsSanity([{ host: 'api.louvorja.workers.dev', dns: { ok: true, ips: ['10.0.0.1'] } }])
    expect(out[0].dnsSuspeito).toBe(true)
  })

  it('workers.dev em faixa Cloudflare = ok', () => {
    const out = dnsSanity([{ host: 'api.louvorja.workers.dev', dns: { ok: true, ips: ['104.21.5.9'] } }])
    expect(out[0].dnsSuspeito).toBe(false)
  })

  it('DNS que não resolveu = null (indeciso)', () => {
    const out = dnsSanity([{ host: 'a.com', dns: { ok: false, ips: [] } }])
    expect(out[0].dnsSuspeito).toBeNull()
  })
})

describe('crashHistory', () => {
  it('total 0 sem Crashpad', () => {
    expect(crashHistory(tempRoot()).total).toBe(0)
  })

  it('conta dump e gera preview sanitizado', () => {
    const root = tempRoot()
    mkdirSync(path.join(root, 'Crashpad', 'reports'), { recursive: true })
    writeFileSync(path.join(root, 'Crashpad', 'reports', 'a.dmp'), 'MINIDUMP\x00\x01fake')
    const out = crashHistory(root)
    expect(out.total).toBe(1)
    expect(out.recentes[0].arquivo).toBe('a.dmp')
    expect(out.preview).toContain('MINIDUMP')
    expect(out.preview).not.toContain('\x00')
  })
})

describe('diskFreeMb', () => {
  it('retorna número positivo pro tmp', async () => {
    const mb = await diskFreeMb(tmpdir())
    expect(mb).toBeGreaterThan(0)
  })
})

describe('safe', () => {
  it('captura exceção e devolve valor de erro', async () => {
    expect(await safe(() => { throw new Error('x') }, 'erro')).toBe('erro')
    expect(await safe(() => 'ok', 'erro')).toBe('ok')
  })
})
