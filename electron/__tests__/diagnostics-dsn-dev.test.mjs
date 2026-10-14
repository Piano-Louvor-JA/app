// @vitest-environment node
// resolveDiagnosticsDsn: prioridade env > resource empacotado > build/ (dev).
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDiagnosticsDsn } from '../diagnostics.mjs'

const sandboxes = []
afterEach(() => {
  while (sandboxes.length) rmSync(sandboxes.pop(), { recursive: true, force: true })
})

function tmpWithDsn(rel, content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'diag-dsn-'))
  sandboxes.push(dir)
  mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true })
  writeFileSync(path.join(dir, rel), content)
  return dir
}

describe('resolveDiagnosticsDsn', () => {
  it('dev sem empacotar: lê build/diagnostics-dsn.txt do repo', () => {
    const dir = tmpWithDsn(path.join('build', 'diagnostics-dsn.txt'), 'https://devkey@errors.test/2\n')
    const dsn = resolveDiagnosticsDsn({ resourcesPath: path.join(dir, 'nope'), appPath: dir, isPackaged: false })
    expect(dsn).toBe('https://devkey@errors.test/2')
  })

  it('app empacotado: resource do electron-builder vence build/ do repo', () => {
    const resources = tmpWithDsn('diagnostics-dsn.txt', 'https://prodkey@errors.test/1')
    const appPath = tmpWithDsn(path.join('build', 'diagnostics-dsn.txt'), 'https://devkey@errors.test/2')
    const dsn = resolveDiagnosticsDsn({ resourcesPath: resources, appPath, isPackaged: true })
    expect(dsn).toBe('https://prodkey@errors.test/1')
  })

  it('empacotado sem resource e sem env: string vazia (envio desabilitado)', () => {
    const dsn = resolveDiagnosticsDsn({ resourcesPath: '/inexistente', appPath: '/tambem', isPackaged: true })
    expect(dsn).toBe('')
  })

  it('env DIAGNOSTICS_GLITCHTIP_DSN tem prioridade sobre arquivos', () => {
    const prev = process.env.DIAGNOSTICS_GLITCHTIP_DSN
    process.env.DIAGNOSTICS_GLITCHTIP_DSN = 'https://envkey@errors.test/3'
    try {
      const dir = tmpWithDsn(path.join('build', 'diagnostics-dsn.txt'), 'https://devkey@errors.test/2')
      const dsn = resolveDiagnosticsDsn({ resourcesPath: path.join(dir, 'nope'), appPath: dir, isPackaged: false })
      expect(dsn).toBe('https://envkey@errors.test/3')
    } finally {
      if (prev === undefined) delete process.env.DIAGNOSTICS_GLITCHTIP_DSN
      else process.env.DIAGNOSTICS_GLITCHTIP_DSN = prev
    }
  })
})
