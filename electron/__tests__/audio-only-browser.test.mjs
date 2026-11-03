// @vitest-environment node
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
it('audio controls show only playback controls and never enumerate projection destinations', async () => {
  const html = readFileSync(new URL('../player/control-bar.html', import.meta.url))
  const runtime = readFileSync(new URL('../palco/network-mirror.js', import.meta.url))
  const server = createServer((req, res) => { res.setHeader('Content-Type', req.url.includes('.js') ? 'text/javascript' : 'text/html'); res.end(req.url.includes('.js') ? runtime : html) })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 960, height: 64 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.calls = []
      const state = { paused: false, duration: 120, currentTime: 10, volume: .5, muted: false, audioOnly: true, audioOutput: 'player', projecting: false }
      window.louvorja = { projection: {
        getPlaybackState: async () => state,
        remotePause: async () => { state.paused = true; window.calls.push('pause') },
        remotePlay: async () => { state.paused = false; window.calls.push('play') },
        remoteSetVolume: async value => { state.volume = value; window.calls.push(['volume', value]); return state },
        remoteSeek: async value => { state.currentTime = value; window.calls.push(['seek', value]) },
      }, palco: { slots: async () => { window.calls.push('slots'); return [] } }, displays: { list: async () => { window.calls.push('displays'); return [] } } }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/?audioOnly=1`)
    for (const selector of ['#project', '#audioOutput', '#monitorSelect', '#captions']) expect(await page.locator(selector).isVisible()).toBe(false)
    for (const selector of ['#play', '#mute', '#volume', '#seek', '#time']) expect(await page.locator(selector).isVisible()).toBe(true)
    await page.locator('#play').click(); await page.locator('#play').click()
    await page.locator('#volume').fill('75'); await page.locator('#volume').dispatchEvent('change')
    await page.locator('#seek').fill('500'); await page.locator('#seek').dispatchEvent('change')
    const calls = await page.evaluate(() => window.calls)
    expect(calls).toContain('pause'); expect(calls).toContain('play')
    expect(calls).toContainEqual(['volume', .75]); expect(calls).toContainEqual(['seek', 60])
    expect(calls).not.toContain('slots'); expect(calls).not.toContain('displays')
    expect(errors).toEqual([])
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}, 15000)
