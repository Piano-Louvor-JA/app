// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { handlers } = vi.hoisted(() => ({ handlers: new Map() }))
vi.mock('electron', () => ({ app: { getVersion: () => '1.30.0' }, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, session: {}, shell: {}, screen: {} }))
import { registerDiagnosticsIpc } from '../diagnostics.mjs'
const report = { meta: { campanha: 'teste', versao: '1.30.0' }, triage: { discoLivreMb: 100 } }
beforeEach(() => {
 registerDiagnosticsIpc()
 vi.stubEnv('DIAGNOSTICS_GLITCHTIP_DSN', 'https://public@example.invalid/42')
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('envio Glitchtip pelo handler IPC', () => {
 it('envia evento autenticado no endpoint store e preserva relatório v2', async () => {
  expect(await handlers.get('diagnostics:send')(null, report)).toEqual({ ok: true })
  const [url, options] = fetch.mock.calls[0]
  expect(url).toBe('https://example.invalid/api/42/store/')
  expect(options.method).toBe('POST')
  expect(options.headers['X-Client-Platform']).toBe('desktop')
  expect(options.headers['X-Client-Version']).toBe('1.30.0')
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_version=7, sentry_key=public')
  const event = JSON.parse(options.body)
  expect(event.event_id).toMatch(/^[a-f0-9]{32}$/)
  expect(event.tags).toEqual({ campanha: 'teste', versao: '1.30.0' })
  expect(event.extra.report).toEqual(report)
 })
 it.each(['', 'invalid', 'https://example.invalid/42', 'https://public@example.invalid/'])('DSN inválido ou ausente mantém fallback local: %s', async (dsn) => {
  vi.stubEnv('DIAGNOSTICS_GLITCHTIP_DSN', dsn)
  expect((await handlers.get('diagnostics:send')(null, report)).ok).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
 })
 it('HTTP malsucedido retorna razão sem descartar o relatório', async () => {
  fetch.mockResolvedValue({ok:false,status:503})
  expect(await handlers.get('diagnostics:send')(null, report)).toEqual({ok:false,reason:'HTTP 503'})
  expect(report.triage.discoLivreMb).toBe(100)
 })
 it('erro de rede retorna fallback local', async () => {
  fetch.mockRejectedValue(Object.assign(new Error('ENOTFOUND'),{code:'ENOTFOUND'}))
  expect(await handlers.get('diagnostics:send')(null, report)).toEqual({ok:false,reason:'ENOTFOUND'})
 })
})
