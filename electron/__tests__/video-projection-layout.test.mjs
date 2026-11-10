// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const source = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
const mirror = readFileSync(new URL('../player/mirror-player.html', import.meta.url), 'utf8')
it('uses an exact 16:9 content area instead of counting OS decorations as video pixels', () => {
  const createSource = source.slice(source.indexOf('function createSourceWindow'), source.indexOf('function createSiteSourceWindow'))
  expect(createSource).toContain('useContentSize: true')
  expect(createSource).toContain('setContentSize(CONTROL_WIDTH, CONTROL_HEIGHT)')
  expect(createSource).not.toMatch(/setMinimumSize\(CONTROL_WIDTH/)
})
it('fills the target display proportionally without the old fixed vertical overscan', () => {
  expect(mirror).not.toContain('104%')
  expect(mirror).toMatch(/object-fit:\s*cover/)
  expect(mirror).toMatch(/object-position:\s*center center/)
})

it('fills the source video and resets positioning inherited from the embedded player', () => {
  expect(source).toMatch(/video\.html5-main-video[\s\S]*?object-fit: cover !important/)
  expect(source).toContain('object-position: center center !important')
  expect(source).toContain('transform: none !important')
  const local = readFileSync(new URL('../player/local-video-player.html', import.meta.url), 'utf8')
  expect(local).toMatch(/video\s*\{[^}]*object-fit: cover/)
})

it('caps mirror capture to source resolution rather than allowing a 4K capture per display', () => {
  expect(mirror).toContain('maxWidth: 960')
  expect(mirror).toContain('maxHeight: 540')
  expect(mirror).not.toContain('maxWidth: 3840')
})
it('coalesces YouTube DOM updates and does not disable the GPU for every dev launch', () => {
  expect(source).not.toContain('new MutationObserver(apply)')
  expect(source).toContain('if (style.textContent !== css)')
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8')
  expect(main).toContain('process.env.LOUVORJA_DISABLE_GPU === "1"')
})

it('batches a burst of YouTube mutations into one layout update', async () => {
  const { runInNewContext } = await import('node:vm')
  const start = source.indexOf('const HIDE_YOUTUBE_SIDEBAR_SCRIPT =')
  const end = source.indexOf('/** @type {BrowserWindow', start)
  const script = runInNewContext(source.slice(start, end) + '\nHIDE_YOUTUBE_SIDEBAR_SCRIPT')
  const timers = []
  let observerCallback
  let queries = 0
  let styleWrites = 0
  let css = ''
  const style = {
    get textContent() { return css },
    set textContent(value) { css = value; styleWrites++ },
  }
  const context = {
    window: {},
    document: {
      getElementById: () => style,
      documentElement: {},
      querySelector: () => { queries++; return null },
    },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback }
      observe() {}
    },
    setTimeout: callback => { timers.push(callback); return timers.length },
    setInterval: () => 1,
  }
  runInNewContext(script, context)
  const initialQueries = queries
  for (let i = 0; i < 100; i++) observerCallback()
  expect(timers).toHaveLength(1)
  expect(queries).toBe(initialQueries)
  timers.shift()()
  expect(queries).toBe(initialQueries * 2)
  runInNewContext(script, context)
  expect(styleWrites).toBe(1)
})

it('removes the YouTube Premium promo card from the projected page', async () => {
  const { runInNewContext } = await import('node:vm')
  const { JSDOM } = await import('jsdom')
  const start = source.indexOf('const HIDE_YOUTUBE_SIDEBAR_SCRIPT =')
  const end = source.indexOf('/** @type {BrowserWindow', start)
  const script = runInNewContext(source.slice(start, end) + '\nHIDE_YOUTUBE_SIDEBAR_SCRIPT')
  const dom = new JSDOM(`<body>
    <div id="movie_player"><video></video></div>
    <ytd-popup-container>
      <tp-yt-paper-dialog>
        <ytd-mealbar-promo-renderer>
          <div id="dismiss-button"><button>Agora não</button></div>
          <div id="action-button"><button>Inscreva-se</button></div>
        </ytd-mealbar-promo-renderer>
      </tp-yt-paper-dialog>
    </ytd-popup-container>
  </body>`, { runScripts: 'outside-only' })
  try {
    const { window } = dom
    let dismissed = 0
    let subscribed = 0
    window.document.querySelector('#dismiss-button button').addEventListener('click', () => { dismissed++ })
    window.document.querySelector('#action-button button').addEventListener('click', () => { subscribed++ })

    window.eval(script)

    const dialog = window.document.querySelector('tp-yt-paper-dialog')
    const promo = window.document.querySelector('ytd-mealbar-promo-renderer')
    expect(window.getComputedStyle(promo).display).toBe('none')
    expect(dialog.style.getPropertyValue('display')).toBe('none')
    expect(dismissed).toBe(1)
    expect(subscribed).toBe(0)
    expect(window.getComputedStyle(window.document.querySelector('video')).display).not.toBe('none')
  } finally { dom.window.close() }
})

async function openYoutubePage(url = 'https://www.youtube.com/watch?v=RxEJ9J45lnA') {
  const { runInNewContext } = await import('node:vm')
  const { JSDOM } = await import('jsdom')
  const start = source.indexOf('const HIDE_YOUTUBE_SIDEBAR_SCRIPT =')
  const end = source.indexOf('/** @type {BrowserWindow', start)
  const script = runInNewContext(source.slice(start, end) + '\nHIDE_YOUTUBE_SIDEBAR_SCRIPT')
  const dom = new JSDOM('<body><div id="movie_player" class="html5-video-player"><video class="html5-main-video"></video></div></body>', {
    runScripts: 'outside-only',
    url,
  })
  const { window } = dom
  const timers = []
  window.setTimeout = (callback, ms) => { timers.push({ callback, ms }); return timers.length }
  window.clearTimeout = () => {}
  window.setInterval = () => 1
  const video = window.document.querySelector('video')
  const media = { paused: true, ended: false, currentTime: 0 }
  for (const key of Object.keys(media)) {
    Object.defineProperty(video, key, { configurable: true, get: () => media[key] })
  }
  const player = window.document.getElementById('movie_player')
  const veilShown = () => window.document.getElementById('louvorja-yt-veil')?.style.getPropertyValue('display') === 'block'
  const emit = (type, state) => {
    Object.assign(media, state)
    video.dispatchEvent(new window.Event(type))
  }
  return { dom, window, script, timers, player, veilShown, emit, run: () => window.eval(script) }
}

it('covers the YouTube player until the content starts playing', async () => {
  const page = await openYoutubePage()
  try {
    page.run()
    expect(page.veilShown()).toBe(true)
    page.emit('playing', { paused: false, currentTime: 0.2 })
    expect(page.veilShown()).toBe(false)
  } finally { page.dom.window.close() }
})

it('keeps the YouTube player covered while an ad is showing', async () => {
  const page = await openYoutubePage()
  try {
    page.run()
    page.player.classList.add('ad-showing')
    page.emit('playing', { paused: false, currentTime: 3 })
    expect(page.veilShown()).toBe(true)
    page.player.classList.remove('ad-showing')
    page.emit('loadstart', { paused: true, currentTime: 0 })
    expect(page.veilShown()).toBe(true)
    page.emit('playing', { paused: false, currentTime: 0.1 })
    expect(page.veilShown()).toBe(false)
  } finally { page.dom.window.close() }
})

it('covers the YouTube end screen and uncovers when the video plays again', async () => {
  const page = await openYoutubePage()
  try {
    page.run()
    page.emit('playing', { paused: false, currentTime: 1 })
    page.emit('pause', { paused: true })
    expect(page.veilShown()).toBe(false)
    page.emit('ended', { paused: true, ended: true, currentTime: 288 })
    expect(page.veilShown()).toBe(true)
    page.emit('playing', { paused: false, ended: false, currentTime: 10 })
    expect(page.veilShown()).toBe(false)
  } finally { page.dom.window.close() }
})

it('lifts the veil after 15 s when the YouTube video never starts', async () => {
  const page = await openYoutubePage()
  try {
    page.run()
    const timeout = page.timers.find(timer => timer.ms === 15000)
    expect(timeout).toBeDefined()
    timeout.callback()
    expect(page.veilShown()).toBe(false)
  } finally { page.dom.window.close() }
})

it('installs a single veil when the cleanup script is injected again', async () => {
  const page = await openYoutubePage()
  try {
    page.run()
    page.run()
    expect(page.window.document.querySelectorAll('#louvorja-yt-veil')).toHaveLength(1)
  } finally { page.dom.window.close() }
})

it('does not cover local video pages that share the source window', async () => {
  const page = await openYoutubePage('https://localhost/player/local-video-player.html')
  try {
    page.run()
    expect(page.window.document.getElementById('louvorja-yt-veil')).toBeNull()
  } finally { page.dom.window.close() }
})
