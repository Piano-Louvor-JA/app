// @vitest-environment node
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { appOn, getAllWebContents, fromId } = vi.hoisted(() => ({
  appOn: vi.fn(),
  getAllWebContents: vi.fn(() => []),
  fromId: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { on: appOn },
  webContents: { getAllWebContents },
  webFrameMain: { fromId },
}))

import {
  _resetYoutubeAdSkipForTests,
  disableYoutubeAdSkip,
  enableYoutubeAdSkip,
  isYoutubeFrameUrl,
  youtubeAdSkipScript,
} from '../youtube-ad-skip.mjs'

/** Player do YouTube com um <video> cujos tempos o teste controla. */
function playerDom({ ad = false, skipButton = false } = {}) {
  const dom = new JSDOM(
    `<div id="movie_player" class="html5-video-player${ad ? ' ad-showing' : ''}">
      <video class="html5-main-video"></video>
      ${skipButton ? '<button class="ytp-skip-ad-button">Pular</button>' : ''}
      <div class="ytp-ad-overlay-container">banner</div>
    </div>`,
    { runScripts: 'outside-only' },
  )
  const video = dom.window.document.querySelector('video')
  let currentTime = 2
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 15 })
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value) => { currentTime = value },
  })
  video.muted = false
  video.playbackRate = 1
  const player = dom.window.document.getElementById('movie_player')
  const tick = () => dom.window.__louvorjaYtAdSkip.tick()
  return { dom, window: dom.window, video, player, tick }
}

describe('youtubeAdSkipScript', () => {
  let env
  afterEach(() => env?.dom.window.close())

  it('durante o anúncio: esconde, silencia, leva ao fim e clica em Pular', () => {
    env = playerDom({ ad: true, skipButton: true })
    const skip = env.window.document.querySelector('.ytp-skip-ad-button')
    const clicked = vi.fn()
    skip.addEventListener('click', clicked)

    env.window.eval(youtubeAdSkipScript(true))
    env.tick()

    expect(env.video.muted).toBe(true)
    expect(env.video.currentTime).toBe(15)
    expect(env.video.playbackRate).toBe(16)
    expect(clicked).toHaveBeenCalled()
    expect(env.window.getComputedStyle(env.video).opacity).toBe('0')
    const banner = env.window.document.querySelector('.ytp-ad-overlay-container')
    expect(env.window.getComputedStyle(banner).display).toBe('none')
  })

  it('quando o anúncio acaba, devolve o som e a velocidade de antes', () => {
    env = playerDom({ ad: false })
    env.video.playbackRate = 1.25
    env.window.eval(youtubeAdSkipScript(true))
    env.tick()

    env.player.classList.add('ad-showing')
    env.tick()
    expect(env.video.muted).toBe(true)

    env.player.classList.remove('ad-showing')
    env.video.currentTime = 40
    env.tick()
    expect(env.video.muted).toBe(false)
    expect(env.video.playbackRate).toBe(1.25)
    expect(env.video.currentTime).toBe(40)
    expect(env.window.getComputedStyle(env.video).opacity).not.toBe('0')
  })

  it('não mexe no vídeo normal', () => {
    env = playerDom({ ad: false })
    env.video.muted = true
    env.window.eval(youtubeAdSkipScript(true))
    env.tick()
    expect(env.video.currentTime).toBe(2)
    expect(env.video.playbackRate).toBe(1)
    expect(env.video.muted).toBe(true)
  })

  it('reaplicar não duplica o estilo; desligar para de agir e restaura o vídeo', () => {
    env = playerDom({ ad: true })
    env.window.eval(youtubeAdSkipScript(true))
    env.window.eval(youtubeAdSkipScript(true))
    expect(env.window.document.querySelectorAll('#louvorja-yt-ad-skip')).toHaveLength(1)
    env.tick()
    expect(env.video.muted).toBe(true)

    env.window.eval(youtubeAdSkipScript(false))
    expect(env.video.muted).toBe(false)
    expect(env.video.playbackRate).toBe(1)
    expect(env.window.document.getElementById('louvorja-yt-ad-skip')).toBeNull()

    env.video.currentTime = 3
    env.tick()
    expect(env.video.currentTime).toBe(3)

    env.window.eval(youtubeAdSkipScript(true))
    env.tick()
    expect(env.video.muted).toBe(true)
  })

  it('desligar numa página que nunca recebeu o script não quebra', () => {
    env = playerDom()
    expect(() => env.window.eval(youtubeAdSkipScript(false))).not.toThrow()
  })
})

describe('isYoutubeFrameUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc', true],
    ['https://youtube.com/embed/abc', true],
    ['https://www.youtube-nocookie.com/embed/abc', true],
    ['https://m.youtube.com/watch?v=abc', true],
    ['https://notyoutube.com/watch', false],
    ['https://youtube.com.evil.test/', false],
    ['file:///app/player/youtube-player.html', false],
    ['about:blank', false],
    ['', false],
  ])('%s → %s', (url, expected) => {
    expect(isYoutubeFrameUrl(url)).toBe(expected)
  })
})

describe('enableYoutubeAdSkip / disableYoutubeAdSkip', () => {
  const frame = (url) => ({ url, executeJavaScript: vi.fn(async () => true) })
  const contents = (frames) => {
    const listeners = new Map()
    return {
      isDestroyed: () => false,
      mainFrame: { framesInSubtree: frames },
      on: vi.fn((event, fn) => listeners.set(event, fn)),
      emit: (event, ...args) => listeners.get(event)?.(...args),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getAllWebContents.mockReturnValue([])
    _resetYoutubeAdSkipForTests()
  })

  it('injeta só nos frames do YouTube já abertos', () => {
    const yt = frame('https://www.youtube.com/watch?v=abc')
    const app = frame('file:///app/index.html')
    getAllWebContents.mockReturnValue([contents([app, yt])])

    enableYoutubeAdSkip()

    expect(yt.executeJavaScript).toHaveBeenCalledWith(youtubeAdSkipScript(true), true)
    expect(app.executeJavaScript).not.toHaveBeenCalled()
  })

  it('injeta quando um frame do YouTube carrega numa janela nova', () => {
    enableYoutubeAdSkip()
    const created = appOn.mock.calls.find(([event]) => event === 'web-contents-created')[1]
    const wc = contents([])
    created({}, wc)

    const embed = frame('https://www.youtube.com/embed/abc')
    fromId.mockReturnValue(embed)
    wc.emit('did-frame-navigate', {}, embed.url, 200, 'OK', false, 7, 9)

    expect(fromId).toHaveBeenCalledWith(7, 9)
    expect(embed.executeJavaScript).toHaveBeenCalledWith(youtubeAdSkipScript(true), true)

    const site = frame('https://example.com/')
    fromId.mockReturnValue(site)
    wc.emit('did-frame-finish-load', {}, true, 7, 10)
    expect(site.executeJavaScript).not.toHaveBeenCalled()
  })

  it('desligado: avisa os frames abertos e não injeta mais nos novos', () => {
    const yt = frame('https://www.youtube.com/watch?v=abc')
    getAllWebContents.mockReturnValue([contents([yt])])
    enableYoutubeAdSkip()
    const created = appOn.mock.calls.find(([event]) => event === 'web-contents-created')[1]

    disableYoutubeAdSkip()
    expect(yt.executeJavaScript).toHaveBeenLastCalledWith(youtubeAdSkipScript(false), true)

    const wc = contents([])
    created({}, wc)
    const later = frame('https://www.youtube.com/watch?v=xyz')
    fromId.mockReturnValue(later)
    wc.emit('did-frame-finish-load', {}, true, 1, 2)
    expect(later.executeJavaScript).not.toHaveBeenCalled()
  })

  it('registra o listener global uma vez só, mesmo ligando várias vezes', () => {
    enableYoutubeAdSkip()
    disableYoutubeAdSkip()
    enableYoutubeAdSkip()
    expect(appOn.mock.calls.filter(([event]) => event === 'web-contents-created')).toHaveLength(1)
  })

  it('frame destruído ou falha de injeção não derruba o processo', () => {
    const broken = { url: 'https://www.youtube.com/watch?v=abc', executeJavaScript: vi.fn(() => Promise.reject(new Error('gone'))) }
    getAllWebContents.mockReturnValue([contents([broken]), { isDestroyed: () => true }])
    expect(() => enableYoutubeAdSkip()).not.toThrow()

    const created = appOn.mock.calls.find(([event]) => event === 'web-contents-created')[1]
    const wc = contents([])
    created({}, wc)
    fromId.mockReturnValue(null)
    expect(() => wc.emit('did-frame-finish-load', {}, true, 1, 2)).not.toThrow()
    fromId.mockImplementation(() => { throw new Error('frame disposed') })
    expect(() => wc.emit('did-frame-navigate', {}, 'https://www.youtube.com/', 200, 'OK', true, 1, 2)).not.toThrow()
  })
})
