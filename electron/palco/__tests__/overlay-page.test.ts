// @vitest-environment node
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
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

let browser: Browser
beforeAll(async () => { browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }) })
afterAll(async () => { await browser?.close() })

async function openOverlay(slot: any, extra = ''): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`http://127.0.0.1:${slot.httpPort}/overlay?port=${slot.wsPort}${extra}`)
  await page.waitForFunction(() => document.body.dataset.connected === 'true')
  return page
}

const cardVisible = (page: Page) => page.locator('#card').evaluate(card => card.classList.contains('is-visible'))

describe('overlay route', () => {
  it('serves the page and the connection style without exposing the token', async () => {
    const slot = new PalcoSlot('route', 'Route', await freePort(), await freePort(), () => null, { overlay: { theme: 'light' } })
    try {
      await slot.prepare()
      const page = await fetch(`http://127.0.0.1:${slot.httpPort}/overlay`)
      expect(page.status).toBe(200)
      expect(page.headers.get('cache-control')).toBe('no-store')
      expect(await page.text()).toContain('data-overlay-root')
      const config = await (await fetch(`http://127.0.0.1:${slot.httpPort}/overlay-config`)).json()
      expect(config).toEqual({ style: slot.overlay })
    } finally { await slot.dispose() }
  })
})

describe('overlay page', () => {
  it('stays transparent, renders sanitized lyrics and follows style changes live', async () => {
    const slot = new PalcoSlot('live', 'Live', await freePort(), await freePort(), () => null, { overlay: { theme: 'transparent' } })
    try {
      await slot.start()
      const page = await openOverlay(slot)
      let navigations = 0
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      expect(await cardVisible(page)).toBe(false)

      slot.send({ v: 2, type: 'projection', scope: 'hymns', text: '<span style="color:#fff">Santo, Santo, Santo<br>Deus onipotente</span><script>window.hacked=1</script>', footerRef: '' })
      await expect.poll(() => cardVisible(page)).toBe(true)
      expect(await page.locator('#content').innerText()).toBe('Santo, Santo, Santo\nDeus onipotente')
      expect(await page.locator('#content [style]').count()).toBe(0)
      expect(await page.evaluate(() => (window as any).hacked)).toBeUndefined()
      expect(await page.evaluate(() => document.body.dataset.layout)).toBe('lower-third')

      slot.setOverlay({ layout: 'fullscreen', theme: 'light', textScale: 130, accentColor: '#123456' })
      await page.waitForFunction(() => document.body.dataset.layout === 'fullscreen' && document.body.dataset.theme === 'light')
      expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--overlay-scale').trim())).toBe('1.3')
      expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--overlay-accent').trim())).toBe('#123456')
      expect(navigations).toBe(0)
    } finally { await slot.dispose() }
  }, 30000)

  it('wraps the lyrics in a soft band that hugs the text in every theme', async () => {
    const slot = new PalcoSlot('band', 'Band', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const page = await openOverlay(slot)
      slot.send({ v: 2, type: 'projection', scope: 'hymns', text: 'Toda tribo e nação' })
      await expect.poll(() => cardVisible(page)).toBe(true)
      for (const layout of ['lower-third', 'fullscreen']) {
        for (const theme of ['dark', 'light', 'transparent']) {
          slot.setOverlay({ layout, theme })
          await page.waitForFunction(([l, t]) => document.body.dataset.layout === l && document.body.dataset.theme === t, [layout, theme])
          const band = await page.locator('#card').evaluate((card) => {
            const alpha = /rgba?\(([^)]+)\)/.exec(getComputedStyle(card).backgroundColor)?.[1].split(',')[3]
            const style = getComputedStyle(card)
            const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(parseFloat)
            return { width: card.getBoundingClientRect().width, alpha: alpha === undefined ? 1 : Number(alpha), corners }
          })
          expect(band.corners[0], `${layout}/${theme}`).toBeGreaterThan(0)
          expect(band.corners, `${layout}/${theme}`).toEqual([band.corners[0], 0, band.corners[0], 0])
          expect(band.width, `${layout}/${theme}`).toBeLessThan(1280 * 0.6)
          expect(band.alpha, `${layout}/${theme}`).toBeGreaterThan(0.2)
          expect(band.alpha, `${layout}/${theme}`).toBeLessThan(0.9)
        }
      }
      const look = () => page.locator('#card').evaluate((card) => {
        const style = getComputedStyle(card)
        return { background: style.backgroundColor, shadow: style.boxShadow }
      })
      slot.setOverlay({ layout: 'lower-third', theme: 'dark', bandOpacity: 25 })
      await expect.poll(async () => (await look()).background).toBe('rgba(10, 10, 12, 0.25)')
      slot.setOverlay({ bandOpacity: 0 })
      await expect.poll(async () => (await look()).background).toBe('rgba(10, 10, 12, 0)')
      expect((await look()).shadow).toBe('none')
    } finally { await slot.dispose() }
  }, 30000)

  it('shows the Bible reference only while the heading is enabled and highlights covers', async () => {
    const slot = new PalcoSlot('bible', 'Bible', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const page = await openOverlay(slot)
      slot.send({ v: 2, type: 'projection', scope: 'bible', text: 'Porque Deus amou o mundo de tal maneira', footerRef: 'João 3:16 (ARC)' })
      await expect.poll(() => page.locator('#reference').innerText()).toBe('João 3:16 (ARC)')
      expect(await page.locator('#reference').isVisible()).toBe(true)
      slot.setOverlay({ showHeading: false })
      await expect.poll(() => page.locator('#reference').isVisible()).toBe(false)
      slot.send({ v: 2, type: 'projection', scope: 'hymns', text: 'Castelo forte', isCover: true })
      await expect.poll(() => page.locator('#card').evaluate(card => card.classList.contains('is-cover'))).toBe(true)
    } finally { await slot.dispose() }
  }, 30000)

  it('does not animate again for an identical state and clears on idle or stop', async () => {
    const slot = new PalcoSlot('dedupe', 'Dedupe', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const page = await openOverlay(slot)
      const message = { v: 2, type: 'projection', scope: 'hymns', text: 'Grandioso és tu' }
      slot.send(message)
      await expect.poll(() => page.evaluate(() => Number(document.body.dataset.renders))).toBe(1)
      slot.send({ ...message, fontSize: 80 })
      slot.send({ v: 2, type: 'audio', action: 'pause' })
      await page.waitForTimeout(400)
      expect(await page.evaluate(() => Number(document.body.dataset.renders))).toBe(1)
      slot.send({ v: 2, type: 'idle', msg: '' })
      await expect.poll(() => cardVisible(page)).toBe(false)
      slot.send(message)
      await expect.poll(() => cardVisible(page)).toBe(true)
      await slot.stop()
      await expect.poll(() => cardVisible(page)).toBe(false)
    } finally { await slot.dispose() }
  }, 30000)

  it('applies only the latest of several quick changes', async () => {
    const slot = new PalcoSlot('burst', 'Burst', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const page = await openOverlay(slot)
      for (const text of ['Primeira', 'Segunda', 'Terceira', 'Quarta']) slot.send({ v: 2, type: 'projection', scope: 'hymns', text })
      await expect.poll(() => page.locator('#content').innerText()).toBe('Quarta')
      await page.waitForTimeout(500)
      expect(await page.locator('#content').innerText()).toBe('Quarta')
    } finally { await slot.dispose() }
  }, 30000)

  it('renders timers from an absolute deadline, ready text and stops them', async () => {
    const slot = new PalcoSlot('timer', 'Timer', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const page = await openOverlay(slot)
      slot.send({ v: 2, type: 'timer', mode: 'countdown', duration: 90, label: 'Intervalo' })
      await expect.poll(() => page.locator('#content').innerText()).toMatch(/^00:01:(30|29)$/)
      expect(await page.locator('#reference').innerText()).toBe('Intervalo')
      slot.send({ v: 2, type: 'timer', mode: 'chrono', chronoRuntime: { status: 'paused', accumulatedMs: 61000, segmentStartedAt: null }, timeFormat: 'mm:ss' })
      await expect.poll(() => page.locator('#content').innerText()).toBe('01:01')
      slot.send({ v: 2, type: 'timer', text: '10:30' })
      await expect.poll(() => page.locator('#content').innerText()).toBe('10:30')
      slot.send({ v: 2, type: 'timer', action: 'stop' })
      await expect.poll(() => cardVisible(page)).toBe(false)
    } finally { await slot.dispose() }
  }, 30000)

  it('confirms the startup test and the reload request to the app', async () => {
    const events: any[] = []
    const slot = new PalcoSlot('ack', 'Ack', await freePort(), await freePort(), () => ({ send: (channel: string, event: any) => { if (channel === 'palco:event') events.push(event) } }))
    try {
      await slot.start()
      const page = await openOverlay(slot)
      slot.send({ v: 2, type: 'obsWarmup', requestId: 'warm', durationMs: 999999999, expiresAt: Date.now() + 10000 })
      await expect.poll(() => events.some(event => event.type === 'obs-warmup-started' && event.requestId === 'warm')).toBe(true)
      await expect.poll(() => events.some(event => event.type === 'obs-warmup-complete' && event.requestId === 'warm'), { timeout: 4500 }).toBe(true)
      slot.send({ v: 2, type: 'obsControl', action: 'reload', requestId: 'again' })
      await expect.poll(() => events.some(event => event.type === 'receiver-ready' && event.requestId === 'again'), { timeout: 10000 }).toBe(true)
      expect(await page.evaluate(() => document.body.dataset.connected)).toBe('true')
    } finally { await slot.dispose() }
  }, 30000)

  it('connects only to its own network and loads backgrounds through its own server', async () => {
    const slot = new PalcoSlot('safe', 'Safe', await freePort(), await freePort(), () => null, { overlay: { layout: 'fullscreen' } })
    try {
      await slot.start()
      const page = await openOverlay(slot, '&host=example.com')
      const backdrop = () => page.locator('#backdrop').getAttribute('src')
      slot.send({ v: 2, type: 'projection', scope: 'hymns', text: 'Santo, Santo, Santo', background: `http://127.0.0.1:${slot.httpPort}/bg/bg-3.png` })
      await expect.poll(backdrop).toBe('/bg/bg-3.png')
      slot.send({ v: 2, type: 'projection', scope: 'hymns', text: 'Deus onipotente', background: `http://127.0.0.1:${slot.httpPort}/media/capa%20hino.jpg?token=ABCDE` })
      await expect.poll(backdrop).toBe('/media/capa%20hino.jpg')
      slot.send({ v: 2, type: 'projection', scope: 'hymns', text: 'Cedo de manhã', background: 'https://example.invalid/capa.jpg' })
      await expect.poll(backdrop).toBe('/proxy?url=https%3A%2F%2Fexample.invalid%2Fcapa.jpg')
      slot.send({ v: 2, type: 'projection', scope: 'hymns', text: 'Cantaremos', background: `http://127.0.0.1:${slot.httpPort}/outro/arquivo.png` })
      await expect.poll(() => page.locator('#content').innerText()).toBe('Cantaremos')
      expect(await page.locator('#backdrop').evaluate(img => img.classList.contains('is-shown'))).toBe(false)
    } finally { await slot.dispose() }
  }, 30000)

  it('reconnects after the connection restarts and receives the replayed state', async () => {
    const slot = new PalcoSlot('reconnect', 'Reconnect', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const page = await openOverlay(slot)
      await slot.stop()
      await page.waitForFunction(() => document.body.dataset.connected === 'false')
      await slot.start()
      slot.send({ v: 2, type: 'projection', scope: 'bible', text: 'Depois de reconectar' })
      await expect.poll(() => page.locator('#content').innerText(), { timeout: 10000 }).toBe('Depois de reconectar')
    } finally { await slot.dispose() }
  }, 30000)
})
