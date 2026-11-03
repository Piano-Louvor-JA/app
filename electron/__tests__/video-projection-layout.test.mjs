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
