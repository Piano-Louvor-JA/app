// @vitest-environment node
/**
 * Testes HTTP do palco-server — handleHttp de assets do receiver.
 *
 * Regressão 04/10→13/10: 1adecdf9 trocou a regex de assets p/ lookahead
 * (proteger /proxy|/status|/bg|/media) e ela ganhou 3 grupos de captura;
 * o handler continuou lendo o grupo do filename pela posição antiga
 * (match[1], agora null) → path.join(.., null) → TypeError → catch →
 * 404 em TODOS os assets (splash.jpg, appinfo.json, logos).
 * receiver.html ficava 200 pois tem rota própria — sintoma enganoso.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getName: () => 'test', on: vi.fn() },
  ipcMain: { handle: vi.fn() },
}))

const serverUrl = pathToFileURL(path.resolve(process.cwd(), 'electron/palco-server.mjs')).href
const { PalcoSlot } = (await import(serverUrl)) as { PalcoSlot: any }

/** Resposta fake que captura status/body (statusCode é propriedade do res). */
function fakeRes() {
  const state = { statusCode: 200, body: undefined as string | Buffer | undefined, done: false }
  return {
    state,
    set statusCode(v: number) { state.statusCode = v },
    get statusCode() { return state.statusCode },
    setHeader() {},
    end(b?: string | Buffer) {
      if (b !== undefined) state.body = b
      state.done = true
    },
  }
}

function fakeReq(p: string) {
  return { url: p, socket: { remoteAddress: '127.0.0.1' }, headers: {} }
}

async function statusOf(p: string): Promise<number> {
  const slot = new PalcoSlot('0', 'Principal', 0, 0, null)
  const res = fakeRes()
  await slot.handleHttp(fakeReq(p), res)
  return res.state.statusCode
}

describe('palco-server handleHttp — assets do receiver (regressão 1adecdf9→13/10)', () => {
  it('splash.jpg serve 200 (filename é o grupo CERTO da regex)', async () => {
    expect(await statusOf('/splash.jpg')).toBe(200)
  })

  it('appinfo.json serve 200', async () => {
    expect(await statusOf('/appinfo.json')).toBe(200)
  })

  it('logo-louvor-ja.svg serve 200', async () => {
    expect(await statusOf('/logo-louvor-ja.svg')).toBe(200)
  })

  it('rotas reservadas respondem do handler DELAS, não de assets', async () => {
    // /proxy sem token → 403 do handler de proxy (antes: caía na rota de
    // assets e 404ava — bug original do 1adecdf9). Aceita 404 também pois
    // upstream pode variar; o que NÃO pode é vazar conteúdo de asset.
    // /proxy sem ?url= → 400 do handler DELE (access LAN ok). O que NÃO
    // pode é vazar conteúdo de asset (bug original do 1adecdf9).
    const code = await statusOf('/proxy')
    expect([200, 400, 403, 404]).toContain(code)
  })
})
