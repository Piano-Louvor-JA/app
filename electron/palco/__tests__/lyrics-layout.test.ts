// @vitest-environment node
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
it('keeps authored lyric lines across source sizes instead of wrapping them at half the screen', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.route('http://127.0.0.1:7080/**', async route => {
      const asset = ['purify.min.js', 'network-mirror.js'].find(name => route.request().url().endsWith(name))
      await route.fulfill({ contentType: asset ? 'text/javascript' : 'text/html', body: readFileSync(new URL(asset ? '../' + asset : '../receiver.html', import.meta.url), 'utf8') })
    })
    await page.goto('http://127.0.0.1:7080/?obsPane=1')
    for (const width of [800, 1280, 1920]) {
      await page.setViewportSize({ width, height: Math.round(width * 9 / 16) })
      await page.evaluate(() => (window as any).handle({ v: 2, type: 'projection', scope: 'hymns', text: 'Rumo àquele lar eu sigo<br>\nMeu eterno e bom país', fontSize: 54, textBox: true, textShadow: false }))
      const layout = await page.locator('#text').evaluate(el => {
        const rect = el.getBoundingClientRect(), style = getComputedStyle(el)
        return { lines: (rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2 * parseFloat(style.borderTopWidth)) / parseFloat(style.lineHeight), left: rect.left, right: rect.right }
      })
      expect(layout.lines).toBeLessThan(2.2)
      expect(layout.left).toBeGreaterThanOrEqual(0)
      expect(layout.right).toBeLessThanOrEqual(width)
    }
  } finally { await browser.close() }
}, 20000)

it('applies the monitor title corner marks and custom title color on connection sources', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.route('http://127.0.0.1:7080/**', async route => {
      const asset = ['purify.min.js', 'network-mirror.js'].find(name => route.request().url().endsWith(name))
      await route.fulfill({ contentType: asset ? 'text/javascript' : 'text/html', body: readFileSync(new URL(asset ? '../' + asset : '../receiver.html', import.meta.url), 'utf8') })
    })
    await page.goto('http://127.0.0.1:7080/?obsPane=1')
    await page.evaluate(() => (window as any).handle({ v: 2, type: 'projection', scope: 'hymns', isCover: true, textBox: true, titleTextBox: false, text: 'Chegou a hora', titleTextColor: '#f6c32a', fontSize: 54 }))
    const title = await page.locator('#text').evaluate(el => ({ color: getComputedStyle(el).color, corner: getComputedStyle(el, '::before').borderTopStyle, content: getComputedStyle(el, '::after').content, background: getComputedStyle(el).backgroundColor, backdrop: getComputedStyle(el).backdropFilter }))
    expect(title).toMatchObject({ color: 'rgb(246, 195, 42)', corner: 'solid', content: '""', background: 'rgba(0, 0, 0, 0)', backdrop: 'none' })
    expect(await page.locator('#text').evaluate(el => el.classList.contains('box-on'))).toBe(false)
    await page.evaluate(() => (window as any).handle({ v: 2, type: 'projection', scope: 'hymns', isCover: false, text: 'Estrofe', textBox: true }))
    expect(await page.locator('#text').evaluate(el => getComputedStyle(el).backdropFilter)).toBe('blur(16px)')

  } finally { await browser.close() }
}, 20000)
