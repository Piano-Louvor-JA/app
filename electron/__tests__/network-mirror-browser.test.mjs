// @vitest-environment node
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
it('transmits live clean video and audio between browsers and releases receivers on stop', async () => {
  const script = readFileSync(new URL('../palco/network-mirror.js', import.meta.url))
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/mirror.js' ? 'text/javascript' : 'text/html')
    res.end(req.url === '/mirror.js' ? script : '<video id="video" autoplay muted playsinline></video><script src="/mirror.js"></script>')
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
    const sender = await browser.newPage(), receiver = await browser.newPage()
    const errors = []
    for (const page of [sender, receiver]) page.on('pageerror', error => errors.push(error.message))
    await sender.exposeFunction('signal', message => receiver.evaluate(async message => {
      if (message.cleanMirror) window.receiver.start(message.mirrorSession)
      else if (message.action === 'stop') window.receiver.stop()
      else await window.receiver.handle(message)
    }, message))
    await receiver.exposeFunction('signal', message => sender.evaluate(message => window.sender.handle({ ...message, slotId: '0' }), message))
    const url = `http://127.0.0.1:${server.address().port}`
    await Promise.all([sender.goto(url), receiver.goto(url)])
    await receiver.evaluate(() => {
      window.receiver = PianoNetworkMirror.createReceiver({
        send: message => { void window.signal(message) },
        attach: stream => { window.received = stream; document.querySelector('video').srcObject = stream },
        clear: () => { document.querySelector('video').srcObject = null },
      })
    })
    await sender.evaluate(async () => {
      window.sender = PianoNetworkMirror.createSender({
        capture: async () => {
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
          const context = canvas.getContext('2d')
          window.paint = setInterval(() => { context.fillStyle = 'rgb(10, 150, 80)'; context.fillRect(0, 0, 640, 360) }, 33)
          const stream = canvas.captureStream(30)
          const audio = new AudioContext(), tone = audio.createOscillator(), output = audio.createMediaStreamDestination()
          tone.connect(output); tone.start(); await audio.resume()
          stream.addTrack(output.stream.getAudioTracks()[0]); window.sent = stream
          return stream
        },
        send: message => window.signal(message),
      })
      await window.sender.start('0')
    })
    await receiver.waitForFunction(() => document.querySelector('video').videoWidth === 640 && document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames > 3)
    expect(await receiver.evaluate(() => window.received.getAudioTracks().length)).toBe(1)
    // Same stream, a newly connected/reloaded receiver negotiates again.
    await receiver.evaluate(() => { window.receiver.stop() })
    await sender.evaluate(() => window.sender.start('0'))
    await receiver.waitForFunction(() => document.querySelector('video').srcObject && document.querySelector('video').readyState >= 2)
    await sender.evaluate(() => window.sender.stop())
    await receiver.waitForFunction(() => !document.querySelector('video').srcObject)
    expect(await sender.evaluate(() => window.sent.getTracks().every(track => track.readyState === 'ended'))).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}, 30000)
