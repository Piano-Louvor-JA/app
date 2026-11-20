import { execFile } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
// ponytail: cwd-based em vez de import.meta.url (vite reescreve a URL do módulo
// sob vitest). Só vale enquanto o teste roda da raiz do repo — upgrade: __dirname via setup.
const CLI = 'electron/guard/cli.mjs'

// QA 2026-10-11: o CLI quebrou (import ./build-guard.mjs inexistente) sem nenhum
// teste falhar — os testes cobriam o módulo, não o binário. Estes testes spawnam
// o processo real e validam o contrato de exit code (RF-03).
async function runCli(env) {
  try {
    const { stdout } = await execFileAsync('node', [CLI], { env: { ...process.env, ...env }, timeout: 10_000 })
    return { code: 0, stdout }
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

describe('guard CLI (spawn real, exit codes)', () => {
  it('import resolve e default passa com STG', async () => {
    const { code, stdout } = await runCli({})
    expect(code).toBe(0)
    expect(stdout).toContain('perfil OK: homologation')
  })

  it('produção em perfil non-release aborta com exit 1', async () => {
    const { code, stderr } = await runCli({
      PIANO_BUILD_PROFILE: 'homologation',
      PIANO_API_BASE_URL: 'https://api.pianolouvorja.com.br',
    })
    expect(code).toBe(1)
    expect(stderr).toContain('proibida em perfil não-release')
  })

  it('release sem autorização aborta com exit 1', async () => {
    const { code, stderr } = await runCli({ PIANO_BUILD_PROFILE: 'release' })
    expect(code).toBe(1)
    expect(stderr).toContain('pipeline oficial de tag/release')
  })

  it('release autorizada (true + tag) passa', async () => {
    const { code, stdout } = await runCli({
      PIANO_BUILD_PROFILE: 'release',
      PIANO_RELEASE_AUTHORIZED: 'true',
      GITHUB_REF_TYPE: 'tag',
    })
    expect(code).toBe(0)
    expect(stdout).toContain('perfil OK: release')
  })
})
