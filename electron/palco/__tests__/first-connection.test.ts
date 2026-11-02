// @vitest-environment node
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { chromium } from 'playwright'
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, ipcMain: { handle: vi.fn() } }))
// @ts-ignore Electron runtime module.
import { PalcoSlot } from '../../palco-server.mjs'
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}
it('serve a página antes de ligar e reconecta após desligar/ligar sem recarregar', async () => {
  const httpPort = await freePort(), wsPort = await freePort()
  const slot = new PalcoSlot('test', 'OBS test', httpPort, wsPort, () => null)
  let client: WebSocket | undefined
  try {
    await slot.prepare()
    expect((await fetch(`http://127.0.0.1:${httpPort}/`)).status).toBe(200)
    expect(slot.running).toBe(false)
    await slot.start()
    client = new WebSocket(`ws://127.0.0.1:${wsPort}/palco`)
    await new Promise<void>((resolve, reject) => { client!.once('open', resolve); client!.once('error', reject) })
    client.close()
    await slot.stop()
    expect((await fetch(`http://127.0.0.1:${httpPort}/`)).status).toBe(200)
    expect(await slot.start()).toBe(true)
  } finally { client?.terminate(); await slot.dispose() }
}, 10000)

it('a fonte aberta antes de ligar recebe conteúdo sem F5 e reconecta após reiniciar', async () => {
  const httpPort = await freePort(), wsPort = await freePort()
  const slot = new PalcoSlot('test', 'OBS test', httpPort, wsPort, () => null)
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    await slot.prepare()
    const page = await browser.newPage()
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
    await page.addInitScript(() => { localStorage.setItem('palcoHost', '192.168.99.99'); localStorage.setItem('palcoPort', '7081') })
    await page.goto(`http://127.0.0.1:${httpPort}/?port=${wsPort}`)
    await page.waitForTimeout(300)
    await slot.start()
    slot.send({ v: 2, type: 'projection', text: 'PRIMEIRO ENVIO', scope: 'bible' })
    await page.waitForFunction(() => document.querySelector('#text')?.textContent === 'PRIMEIRO ENVIO', undefined, { timeout: 12000 })
    await slot.stop()
    await slot.start()
    slot.send({ v: 2, type: 'projection', text: 'REINICIO SEM F5', scope: 'bible' })
    await page.waitForFunction(() => document.querySelector('#text')?.textContent === 'REINICIO SEM F5', undefined, { timeout: 12000 })
    expect(await page.locator('#text').isVisible()).toBe(true)
    expect(navigations).toBe(1)
  } finally { await browser.close(); await slot.dispose() }
}, 30000)

// A real source can reconnect after the old three-second send deadline.
it('confirms a delayed browser source shows the logo for three seconds, then receives content', async () => {
  const httpPort = await freePort(), wsPort = await freePort()
  const events: Array<{ type?: string; requestId?: string }> = []
  const slot = new PalcoSlot('test', 'OBS test', httpPort, wsPort, () => ({
    send: (channel: string, event: { type?: string; requestId?: string }) => { if (channel === 'palco:event') events.push(event) },
  }))
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    await slot.start()
    slot.send({ v: 2, type: 'obsWarmup', requestId: 'delayed', durationMs: 3000, expiresAt: Date.now() + 20000 })
    await new Promise(resolve => setTimeout(resolve, 3500))
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${httpPort}/?port=${wsPort}`)
    await page.locator('#obsWarmupView img').waitFor({ state: 'visible' })
    await page.waitForTimeout(2000)
    expect(await page.locator('#obsWarmupView').isVisible()).toBe(true)
    await expect.poll(() => events.some(event => event.type === 'obs-warmup-complete' && event.requestId === 'delayed')).toBe(true)
    expect(await page.locator('#obsWarmupView').count()).toBe(0)
    slot.send({ v: 2, type: 'projection', text: 'CONTEUDO APOS TESTE', scope: 'bible' })
    await page.waitForFunction(() => document.querySelector('#text')?.textContent === 'CONTEUDO APOS TESTE')
    expect(await page.locator('#text').isVisible()).toBe(true)
  } finally { await browser.close(); await slot.dispose() }
}, 30000)
