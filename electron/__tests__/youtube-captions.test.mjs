// @vitest-environment node
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { youtubeCaptionsScript } from '../youtube-captions.mjs'
it('hides the YouTube caption layer without hiding the video and restores the layer', () => {
  const dom = new JSDOM('<div id="movie_player"><video></video><div class="ytp-caption-window-container">Legenda</div></div>', { runScripts: 'outside-only' })
  try {
    const { window } = dom
    expect(window.eval(youtubeCaptionsScript(true))).toMatchObject({ captionsHidden: true })
    const captions = window.document.querySelector('.ytp-caption-window-container')
    expect(window.getComputedStyle(captions).display).toBe('none')
    expect(window.getComputedStyle(window.document.querySelector('video')).display).not.toBe('none')
    window.eval(youtubeCaptionsScript(true))
    expect(window.document.querySelectorAll('#louvorja-youtube-captions')).toHaveLength(1)
    expect(window.eval(youtubeCaptionsScript(false))).toMatchObject({ captionsHidden: false })
    expect(window.getComputedStyle(captions).display).not.toBe('none')
  } finally { dom.window.close() }
})
it('hides and shows the subtitle track of the local copy player', () => {
  const dom = new JSDOM('<video></video>', { runScripts: 'outside-only' })
  try {
    const { window } = dom
    const track = { mode: 'showing' }
    Object.defineProperty(window.document.querySelector('video'), 'textTracks', { value: [track] })
    window.eval(youtubeCaptionsScript(true))
    expect(track.mode).toBe('hidden')
    window.eval(youtubeCaptionsScript(false))
    expect(track.mode).toBe('showing')
  } finally { dom.window.close() }
})
it('caption button updates its tooltip and propagates the choice without restarting playback', async () => {
  const html = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
  const dom = new JSDOM(html)
  try {
    const button = dom.window.document.getElementById('captions')
    const api = vi.fn(async hidden => ({ captionsHidden: hidden }))
    const broadcast = vi.fn()
    let click
    const context = { captionsBtn: {
      disabled: false,
      set title(value) { button.title = value },
      setAttribute: (key, value) => button.setAttribute(key, value),
      addEventListener: (_type, handler) => { click = handler },
    }, captionsIcon: dom.window.document.getElementById('captionsIcon'), captionsHidden: false,
    window: { louvorja: { projection: { remoteSetCaptionsHidden: api } } }, tvBroadcast: broadcast,
    tvRerouteYoutube: vi.fn(async () => {}) }
    const code = html.slice(html.indexOf('function setCaptionsUi'), html.indexOf('async function refresh()'))
    runInNewContext(code, context)
    await click()
    expect(api).toHaveBeenLastCalledWith(true)
    expect(button.title).toBe('Mostrar legendas')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(broadcast).toHaveBeenLastCalledWith('captions', { captionsHidden: true })
    expect(context.tvRerouteYoutube).toHaveBeenCalledTimes(1)
    context.tvRerouteYoutube.mockRejectedValueOnce(new Error('TV caiu'))
    await click()
    expect(api).toHaveBeenLastCalledWith(false)
    expect(button.title).toBe('Ocultar legendas')
    expect(context.captionsBtn.disabled).toBe(false)
    expect(context.tvRerouteYoutube).toHaveBeenCalledTimes(2)
  } finally { dom.window.close() }
})
