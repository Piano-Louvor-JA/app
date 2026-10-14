// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createMainLogger } from '../main-log.mjs'
import { collectLogs } from '../diagnostics-v2-collectors.mjs'

const roots = []

function tempRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'main-log-test-'))
  roots.push(dir)
  return dir
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true })
})

describe('main logger', () => {
  it('cria main.log e mascara segredos antes de persistir', () => {
    const root = tempRoot()
    const log = createMainLogger(() => root)

    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'
    const blob = 'a'.repeat(41)
    log.info(`Api-Token secret-token authorization: top-secret Bearer bearer-secret https://user:pass@example.test/a?token=query-secret#hash dsn=https://key@example.test/42 ${jwt} ${blob}`)

    const text = readFileSync(path.join(root, 'logs', 'main.log'), 'utf8')
    expect(text).toContain('INFO')
    for (const secret of ['secret-token', 'top-secret', 'bearer-secret', 'user:pass', 'query-secret', 'key@example.test', jwt, blob]) {
      expect(text).not.toContain(secret)
    }
  })

  it('rotaciona antes do append que ultrapassa 1 MiB e mantém uma geração', () => {
    const root = tempRoot()
    const log = createMainLogger(() => root)
    const logs = path.join(root, 'logs')
    const current = path.join(logs, 'main.log')
    mkdirSync(logs, { recursive: true })
    writeFileSync(current, 'a'.repeat(1_048_570))
    writeFileSync(path.join(logs, 'main.log.1'), 'old generation')

    log.info('novo registro')

    expect(readFileSync(path.join(logs, 'main.log.1'), 'utf8')).toHaveLength(1_048_570)
    expect(readFileSync(current, 'utf8')).toContain('novo registro')
  })

  it('serializa writes concorrentes sem perder linhas ou lançar', async () => {
    const root = tempRoot()
    const log = createMainLogger(() => root)

    await expect(Promise.all(Array.from({ length: 100 }, (_, index) => log.info(`linha-${index}`)))).resolves.toEqual(Array(100).fill(undefined))
    const text = readFileSync(path.join(root, 'logs', 'main.log'), 'utf8')
    for (let index = 0; index < 100; index++) expect(text).toContain(`linha-${index}`)
  })

  it('ignora falha de I/O', () => {
    const root = tempRoot()
    const log = createMainLogger(() => root)
    writeFileSync(path.join(root, 'logs'), 'not a directory')

    expect(() => log.error('falha')).not.toThrow()
  })
})

describe('collectLogs', () => {
  it('inclui main.log sanitizado, limitado a 100 linhas e 20 KiB', () => {
    const root = tempRoot()
    const logs = path.join(root, 'logs')
    const lines = Array.from({ length: 150 }, (_, index) => `line-${index} Bearer exposed-token-${index} https://user:pass@example.test/a?token=query-${index}`)
    mkdirSync(logs, { recursive: true })
    writeFileSync(path.join(logs, 'main.log'), lines.join('\n'))
    writeFileSync(path.join(logs, 'main.log.1'), 'rotated generation')

    const out = collectLogs(root, 'never-in-log')
    const main = out.find((log) => log.arquivo === 'main.log')
    expect(out).toContainEqual(expect.objectContaining({ arquivo: 'main.log.1', conteudo: 'rotated generation' }))

    expect(main.conteudo).not.toContain('exposed-token')
    expect(main.conteudo).not.toContain('user:pass')
    expect(main.conteudo).not.toContain('query-')
    expect(main.conteudo.split('\n')).toHaveLength(100)
    expect(Buffer.byteLength(main.conteudo)).toBeLessThanOrEqual(20 * 1024)
  })
})
