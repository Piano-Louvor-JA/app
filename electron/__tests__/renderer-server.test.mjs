import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startRendererServer } from '../renderer-server.mjs'
import { join } from 'node:path'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

/**
 * Feedback Ezequias #2 (round 2): login Google fecha sozinho.
 * Causa: loadFile → origem file:// nunca está nos authorizedDomains do
 * Firebase → auth/unauthorized-domain → popup abre e morre.
 * Fix: servidor loopback servindo dist/ com origem http://127.0.0.1 válida.
 */
let dist
beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'renderer-server-test-'))
  await mkdir(join(dist, 'assets'))
  await writeFile(join(dist, 'index.html'), '<div id="app"></div><script src="./assets/app.js"></script>')
  await writeFile(join(dist, 'assets/app.js'), 'console.log("renderer-fixture")')
})

let serverHandle

afterAll(async () => {
  if (serverHandle) await new Promise((resolve, reject) => serverHandle.server.close(error => error ? reject(error) : resolve()))
  await rm(dist, { recursive: true, force: true })
})

describe('renderer-server — origem http válida para o Firebase Auth', () => {
  it('sobe em 127.0.0.1 com porta efêmera (nunca 0.0.0.0)', async () => {
    serverHandle = await startRendererServer(dist)
    // hostname 'localhost' = authorizedDomain já presente no projeto Firebase
    expect(serverHandle.url).toMatch(/^http:\/\/localhost:\d+$/)
  })

  it('serve o index.html do dist com content-type correto', async () => {
    const res = await fetch(serverHandle.url + '/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('id="app"')
  })

  it('serve assets do bundle (js) com mime de javascript', async () => {
    const html = await (await fetch(serverHandle.url + '/')).text()
    const m = html.match(/src="(\.?\/assets\/[^"]+\.js)"/)
    expect(m).toBeTruthy()
    const res = await fetch(serverHandle.url + '/' + m[1].replace(/^\.?\//, ''))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(await res.text()).toBe('console.log("renderer-fixture")')
  })

  it('SPA fallback: rota desconhecida responde 200 com o index', async () => {
    const res = await fetch(serverHandle.url + '/qualquer/deep/link')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('id="app"')
  })

  it('path traversal não vaza arquivo fora do dist', async () => {
    const res = await fetch(serverHandle.url + '/%2e%2e/%2e%2e/etc/passwd')
    const body = await res.text()
    expect(body).not.toContain('root:')
  })
})
