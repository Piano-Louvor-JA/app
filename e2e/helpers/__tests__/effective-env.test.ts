// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import globalSetup from '../../global-setup'
import { APP_API_ENV_KEYS } from '../prod-url-guard'

const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })) })
function fixture(content = '') {
  const root = mkdtempSync(join(tmpdir(), 'e2e-env-')); roots.push(root)
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  for (const key of [...APP_API_ENV_KEYS, 'VITE_API_FALLBACK_URLS']) vi.stubEnv(key, undefined)
  if (content) writeFileSync(join(root, '.env'), content)
  return root
}
const safe = 'VITE_URL_DATABASE=http://localhost:3100/json_db\nVITE_URL_FILES=http://localhost:3100/file\nVITE_PALCO_API_URL=http://localhost:3100\n'
describe('ambiente efetivo E2E', () => {
  it('rejeita configuração parcial que mantém defaults de produção', () => { fixture(); vi.stubEnv('VITE_URL_DATABASE', 'http://localhost:3100/json_db'); expect(() => globalSetup()).toThrow(/VITE_URL_FILES/) })
  it('rejeita produção em .env.development.local', () => { const root = fixture(safe); writeFileSync(join(root, '.env.development.local'), 'VITE_URL_FILES=https://api.pianolouvorja.com.br/file'); expect(() => globalSetup()).toThrow(/PRODUÇÃO/) })
  it('rejeita produção após expansão de variável', () => { fixture(safe+'HOST=https://api.pianolouvorja.com.br\nVITE_URL_FILES=${HOST}/file\n'); expect(() => globalSetup()).toThrow(/PRODUÇÃO/) })
  it('rejeita hostname de produção com ponto final', () => { fixture(safe+'VITE_URL_FILES=https://api.pianolouvorja.com.br./file'); expect(() => globalSetup()).toThrow(/PRODUÇÃO/) })
  it('rejeita env vazia que reativa o default', () => { fixture(safe); vi.stubEnv('VITE_URL_FILES', ''); expect(() => globalSetup()).toThrow(/VITE_URL_FILES/) })
  it('permite todos os endpoints locais explícitos', () => { fixture(safe); expect(() => globalSetup()).not.toThrow() })
})
