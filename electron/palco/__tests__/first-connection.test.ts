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

it('preserves YouTube identity and caption visibility when a connection reloads', async () => {
  const slot = new PalcoSlot('captions', 'Captions', await freePort(), await freePort(), () => null)
  let client: WebSocket | undefined
  try {
    await slot.start()
    slot.send({ v: 2, type: 'video', youtubeId: 'abcdefghijk', positionMs: 5000 })
    slot.send({ v: 2, type: 'video', action: 'captions', captionsHidden: true })
    const port = slot.status().wsUrl.replace(/^ws:\/\/[^:]+:/, 'ws://127.0.0.1:')
    const replay = new Promise<any>((resolve, reject) => {
      client = new WebSocket(port)
      client.once('error', reject)
      client.on('message', data => { const message = JSON.parse(String(data)); if (message.type === 'video') resolve(message) })
    })
    expect(await replay).toMatchObject({ youtubeId: 'abcdefghijk', captionsHidden: true, positionMs: 5000 })
  } finally { client?.terminate(); await slot.dispose() }
}, 10000)

it('replays only clean-mirror metadata, serves its runtime, and stamps signaling with the real slot', async () => {
  const events: any[] = []
  const slot = new PalcoSlot('mirror-test', 'Mirror', await freePort(), await freePort(), () => ({ send: (channel: string, event: any) => { if (channel === 'palco:event') events.push(event) } }))
  let client: WebSocket | undefined
  try {
    await slot.start()
    const httpPort = new URL(slot.status().url).port
    expect((await fetch(`http://127.0.0.1:${httpPort}/network-mirror.js`)).status).toBe(200)
    slot.send({ v: 2, type: 'video', cleanMirror: true, mirrorSession: 'session' })
    slot.send({ v: 2, type: 'mirror-signal', action: 'offer', description: { sdp: 'PRIVATE-SDP' } })
    const messages: any[] = []
    client = new WebSocket(slot.status().wsUrl.replace(/^ws:\/\/[^:]+:/, 'ws://127.0.0.1:'))
    client.on('message', raw => messages.push(JSON.parse(String(raw))))
    await new Promise<void>((resolve, reject) => { client!.once('open', resolve); client!.once('error', reject) })
    await expect.poll(() => messages.some(message => message.cleanMirror)).toBe(true)
    expect(messages.some(message => message.type === 'mirror-signal')).toBe(false)
    client.send(JSON.stringify({ v: 2, type: 'mirror-signal', action: 'request', slotId: 'forged', sessionId: 'session', receiverId: 'receiver' }))
    await expect.poll(() => events.find(event => event.type === 'mirror-signal')?.slotId).toBe('mirror-test')
  } finally { client?.terminate(); await slot.dispose() }
}, 10000)

it('renders the clean captured stream in the actual receiver without creating a YouTube iframe', async () => {
  const { readFileSync } = await import('node:fs')
  const runtime = readFileSync(new URL('../network-mirror.js', import.meta.url), 'utf8')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
  const sender = await browser.newPage()
  const errors: string[] = []
  const slot = new PalcoSlot('mirror-live', 'Mirror live', await freePort(), await freePort(), () => ({ send: (channel: string, message: any) => {
    if (channel === 'palco:event' && message.type === 'mirror-signal') void sender.evaluate(message => (window as any).sender.handle(message), message).catch(error => errors.push(error.message))
  } }))
  try {
    await slot.start()
    await sender.exposeFunction('sendMirror', (message: any) => slot.send(message))
    await sender.addScriptTag({ content: runtime })
    const receiver = await browser.newPage()
    receiver.on('pageerror', error => errors.push(error.message))
    await receiver.goto(`http://127.0.0.1:${new URL(slot.status().url).port}/?port=${new URL(slot.status().wsUrl).port}`)
    await expect.poll(() => slot.status().clients).toBe(1)
    await sender.evaluate(async () => {
      const api = window as any
      api.sender = api.PianoNetworkMirror.createSender({
        capture: async () => {
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
          const context = canvas.getContext('2d')!
          setInterval(() => { context.fillStyle = '#117733'; context.fillRect(0, 0, 640, 360) }, 33)
          const stream = canvas.captureStream(30)
          const audio = new AudioContext(), tone = audio.createOscillator(), output = audio.createMediaStreamDestination()
          tone.connect(output); tone.start(); await audio.resume()
          stream.addTrack(output.stream.getAudioTracks()[0])
          return stream
        },
        send: (message: any) => api.sendMirror(message),
      })
      await api.sender.start('mirror-live')
    })
    await receiver.waitForFunction(() => { const video = document.querySelector('#video') as HTMLVideoElement; return video.videoWidth === 640 && video.getVideoPlaybackQuality().totalVideoFrames > 3 })
    await receiver.setViewportSize({ width: 800, height: 600 })
    expect(await receiver.locator('#video').evaluate(video => getComputedStyle(video).objectFit)).toBe('contain')
    expect(await receiver.locator('#youtubeProjection').count()).toBe(0)
    expect(await receiver.locator('#video').isVisible()).toBe(true)
    expect(await receiver.evaluate(() => { const video = document.querySelector('#video') as HTMLVideoElement; return !video.muted && (video.srcObject as MediaStream).getAudioTracks().length === 1 })).toBe(true)
    expect(await receiver.locator('#muteBadge').count()).toBe(0)
    slot.send({ v: 2, type: 'audioOutput', mode: 'player' })
    await receiver.waitForFunction(() => (document.querySelector('#video') as HTMLVideoElement).muted)
    slot.send({ v: 2, type: 'audioOutput', mode: 'connections' })
    await receiver.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).muted)
    slot.send({ v: 2, type: 'audioOutput', mode: 'both' })
    await receiver.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).muted)
    await receiver.reload()
    await receiver.waitForFunction(() => { const video = document.querySelector('#video') as HTMLVideoElement; return video.videoWidth === 640 && video.readyState >= 2 })
    await sender.evaluate(() => (window as any).sender.stop())
    await receiver.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).srcObject)
    expect(errors).toEqual([])
  } finally { await browser.close(); await slot.dispose() }
}, 30000)

it('the URL control bar projects to a selected connection without a physical monitor', async () => {
  const { readFileSync } = await import('node:fs')
  const html = readFileSync(new URL('../../player/site-control-bar.html', import.meta.url), 'utf8')
  const runtime = readFileSync(new URL('../network-mirror.js', import.meta.url), 'utf8')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
  const sender = await browser.newPage()
  const slot = new PalcoSlot('site-test', 'Conexão do site', await freePort(), await freePort(), () => ({ send: (channel: string, message: any) => {
    if (channel === 'palco:event') void sender.evaluate(message => ((window as any).listeners || []).forEach((listener: any) => listener(message)), message).catch(() => {})
  } }))
  try {
    await slot.start()
    const receiver = await browser.newPage()
    await receiver.goto(`http://127.0.0.1:${new URL(slot.status().url).port}/?port=${new URL(slot.status().wsUrl).port}`)
    await expect.poll(() => slot.status().clients).toBe(1)
    await sender.exposeFunction('slots', () => [slot.status()])
    await sender.exposeFunction('sendPalco', (message: any) => slot.send(message))
    await sender.setContent(html.replace(/<script[\s\S]*?<\/script>/g, ''))
    await sender.addScriptTag({ content: runtime })
    await sender.evaluate(() => {
      const api = window as any
      api.listeners = []
      api.louvorja = { displays: { list: async () => [] }, projection: {
        getNavigationState: async () => ({ projecting: false, canGoBack: false, canGoForward: false, audioOutput: 'player' }),
        getSiteTargetMonitors: async () => [], setSiteControlPanelOpen: async () => {},
        toggleSiteScreens: async () => { throw new Error('Must not open a physical projection') },
      }, palco: { slots: () => api.slots(), send: (message: any) => api.sendPalco(message), onEvent: (listener: any) => {
        api.listeners.push(listener); return () => { api.listeners = api.listeners.filter((other: any) => other !== listener) }
      } } }
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
        const context = canvas.getContext('2d')!
        setInterval(() => { context.fillStyle = '#115577'; context.fillRect(0, 0, 640, 360) }, 33)
        return canvas.captureStream(30)
      } } })
    })
    const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('var backBtn'))!
    await sender.addScriptTag({ content: inline })
    await sender.locator('#tvList input').waitFor({ state: 'attached' })
    expect(await sender.locator('#projectScreens').isEnabled()).toBe(true)
    await sender.locator('#projectScreens').click()
    await receiver.waitForFunction(() => { const video = document.querySelector('#video') as HTMLVideoElement; return video.videoWidth === 640 && video.readyState >= 2 })
    await sender.locator('#monitorSelect').click()
    await sender.locator('#tvList input').uncheck()
    await receiver.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).srcObject)
    await sender.locator('#tvList input').check()
    await receiver.waitForFunction(() => (document.querySelector('#video') as HTMLVideoElement).videoWidth === 640 && !!(document.querySelector('#video') as HTMLVideoElement).srcObject)
    await sender.locator('#projectScreens').click()
    await receiver.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).srcObject)
  } finally { await browser.close(); await slot.dispose() }
}, 30000)

it('image control starts locally and projects only to selected connections on request', async () => {
  const { readFileSync } = await import('node:fs')
  const html = readFileSync(new URL('../../player/image-control-bar.html', import.meta.url), 'utf8')
  const runtime = readFileSync(new URL('../network-mirror.js', import.meta.url), 'utf8')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
  const sender = await browser.newPage()
  const slot = new PalcoSlot('gallery-test', 'Conexão de imagens', await freePort(), await freePort(), () => ({ send: (channel: string, message: any) => {
    if (channel === 'palco:event') void sender.evaluate(message => ((window as any).listeners || []).forEach((listener: any) => listener(message)), message).catch(() => {})
  } }))
  try {
    await slot.start()
    const receiver = await browser.newPage()
    await receiver.goto(`http://127.0.0.1:${new URL(slot.status().url).port}/?port=${new URL(slot.status().wsUrl).port}`)
    await expect.poll(() => slot.status().clients).toBe(1)
    await sender.exposeFunction('slots', () => [slot.status()])
    await sender.exposeFunction('sendPalco', (message: any) => slot.send(message))
    await sender.setContent(html.replace(/<script[\s\S]*?<\/script>/g, ''))
    await sender.addScriptTag({ content: runtime })
    await sender.evaluate(() => {
      const api = window as any
      api.listeners = []; api.slide = 0
      api.louvorja = { displays: { list: async () => [] }, projection: {
        getImageSlideState: async () => ({ index: api.slide, total: 3, projecting: false, canGoBack: false, canGoForward: false, audioOutput: 'player' }),
        remoteImageNext: async () => { api.slide++; return { index: api.slide, total: 3 } },
        remoteImagePrev: async () => { api.slide--; return { index: api.slide, total: 3 } },
        getVideoTargetMonitors: async () => [], setSiteControlPanelOpen: async () => {},
        toggleVideoScreens: async () => { throw new Error('Must not open a physical projection') },
      }, palco: { slots: () => api.slots(), send: (message: any) => api.sendPalco(message), onEvent: (listener: any) => {
        api.listeners.push(listener); return () => { api.listeners = api.listeners.filter((other: any) => other !== listener) }
      } } }
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
        const context = canvas.getContext('2d')!
        setInterval(() => { context.fillStyle = api.slide === 0 ? '#115577' : '#AA5500'; context.fillRect(0, 0, 640, 360) }, 33)
        return canvas.captureStream(30)
      } } })
    })
    const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('var prevBtn'))!
    await sender.addScriptTag({ content: inline })
    await sender.locator('#tvList input').waitFor({ state: 'attached' })
    expect(await receiver.evaluate(() => !!(document.querySelector('#video') as HTMLVideoElement).srcObject)).toBe(false)
    expect(await sender.locator('#project').isEnabled()).toBe(true)
    await sender.locator('#project').click()
    await receiver.waitForFunction(() => { const video = document.querySelector('#video') as HTMLVideoElement; return video.videoWidth === 640 && video.readyState >= 2 })
    await sender.locator('#next').click()
    await expect.poll(() => sender.locator('#counter').textContent()).toMatch(/2\s*\/\s*3/)
    await receiver.waitForFunction(() => {
      const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2
      const context = canvas.getContext('2d')!
      context.drawImage(document.querySelector('#video') as HTMLVideoElement, 0, 0, 2, 2)
      return context.getImageData(0, 0, 1, 1).data[0] > 130
    })
    await sender.locator('#monitorSelect').click()
    await sender.locator('#tvList input').uncheck()
    await receiver.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).srcObject)
    await sender.locator('#tvList input').check()
    await receiver.waitForFunction(() => (document.querySelector('#video') as HTMLVideoElement).videoWidth === 640 && !!(document.querySelector('#video') as HTMLVideoElement).srcObject)
    await sender.locator('#project').click()
    await receiver.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).srcObject)
  } finally { await browser.close(); await slot.dispose() }
}, 30000)

it('PDF control opens locally, allows receiver selection, and publishes only after projecting', async () => {
  const { readFileSync } = await import('node:fs')
  const html = readFileSync(new URL('../../player/pdf-control-bar.html', import.meta.url), 'utf8')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const slot = new PalcoSlot('pdf-test', 'PDF receiver', await freePort(), await freePort(), () => null)
  try {
    await slot.start()
    const receiver = await browser.newPage()
    await receiver.goto(`http://127.0.0.1:${new URL(slot.status().url).port}/?port=${new URL(slot.status().wsUrl).port}`)
    await expect.poll(() => slot.status().clients).toBe(1)
    const sender = await browser.newPage()
    await sender.exposeFunction('slots', () => [slot.status()])
    // Simulate a receiver without the newer frameSlide flag.
    await sender.exposeFunction('sendPalco', (message: any) => { const { frameSlide, ...legacyMessage } = message; slot.send(legacyMessage) })
    await sender.exposeFunction('servePng', (name: string, mime: string, base64: string) => slot.serveMediaBase64(name, mime, base64)?.replace(/http:\/\/[^:]+:/, 'http://127.0.0.1:'))
    await sender.setContent(html.replace(/<script[\s\S]*?<\/script>/g, ''))
    await sender.evaluate(() => {
      const api = window as any; api.slide = 0; api.captures = 0
      api.louvorja = { displays: { list: async () => [] }, projection: {
        getPptSlideState: async () => ({ index: api.slide, total: 3, projecting: false }),
        getPlaybackState: async () => ({ projecting: false }), getVideoTargetMonitors: async () => [],
        setSiteControlPanelOpen: async () => {}, toggleVideoScreens: async () => { throw new Error('No physical monitor selected') },
        remotePptNext: async () => { api.slide++ }, remotePptPrev: async () => { api.slide-- },
        captureSourceFrame: async () => {
          api.captures++
          const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800
          const context = canvas.getContext('2d')!; context.fillStyle = api.slide === 0 ? '#117733' : '#AA5511'; context.fillRect(0, 0, 600, 800)
          return canvas.toDataURL('image/png').split(',')[1]
        },
      }, palco: { slots: () => api.slots(), send: (message: any) => api.sendPalco(message),
        serveMedia: (name: string, mime: string, base64: string) => api.servePng(name, mime, base64), onReceiverConnected: () => () => {} } }
    })
    const code = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('var prevBtn'))!
    await sender.addScriptTag({ content: code })
    await sender.locator('#tvList input').waitFor({ state: 'attached' })
    expect(await sender.evaluate(() => (window as any).captures)).toBe(0)
    expect(await sender.locator('#tvList input').isEnabled()).toBe(true)
    await sender.locator('#project').click()
    await receiver.waitForFunction(() => (document.querySelector('#bg') as HTMLImageElement).naturalWidth === 600)
    expect(await receiver.locator('#bg').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain')
    // Older, already-open receivers recognize data images without frameSlide.
    expect(await receiver.locator('#bg').getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    for (const viewport of [{ width: 770, height: 980 }, { width: 820, height: 615 }]) {
      await receiver.setViewportSize(viewport)
      const fit = await receiver.locator('#bg').evaluate((image: HTMLImageElement) => {
        const bounds = image.getBoundingClientRect()
        const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight)
        return { mode: getComputedStyle(image).objectFit, width: image.naturalWidth * scale, height: image.naturalHeight * scale }
      })
      expect(fit.mode).toBe('contain')
      expect(fit.width).toBeLessThanOrEqual(viewport.width + 0.01)
      expect(fit.height).toBeLessThanOrEqual(viewport.height + 0.01)
    }
    const first = await receiver.locator('#bg').getAttribute('src')
    await sender.locator('#next').click()
    await expect.poll(() => receiver.locator('#bg').getAttribute('src')).not.toBe(first)
    await sender.locator('#monitorSelect').click()
    await sender.locator('#tvList input').uncheck()
    await expect.poll(() => receiver.locator('#bg').getAttribute('src')).toBeNull()
  } finally { await browser.close(); await slot.dispose() }
}, 30000)
