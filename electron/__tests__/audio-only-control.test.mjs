// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
const main = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
it('audio-only playback cannot open physical projection even when targets exist', () => {
  const open = vi.fn()
  const context = { isCaptureProjectionMode: () => true, currentSourceAudioOnly: true, sourceWindow: { isDestroyed: () => false }, currentProjectionMode: 'video', mirrorWindows: [],
    lastVideoMonitorIds: [4], resolveExtendedTargets: () => [{ id: 4 }], openVideoScreensOnTargets: open }
  const a = main.indexOf('export function toggleVideoProjectionScreens()'), b = main.indexOf('export function isSiteProjectingToScreens', a)
  runInNewContext(main.slice(a, b).replace('export ', ''), context)
  expect(context.toggleVideoProjectionScreens()).toBe(false)
  expect(open).not.toHaveBeenCalled()
})
it('audio-only control does not enumerate or transmit to network connections', async () => {
  const html = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
  const slots = vi.fn(async () => [])
  const context = { audioOnly: true, window: { louvorja: { palco: { slots } } } }
  runInNewContext(html.slice(html.indexOf('async function loadTvs()'), html.indexOf('var networkMirrorSender')), context)
  await context.loadTvs()
  expect(slots).not.toHaveBeenCalled()
})
it('closing the local player stops the media, releases the file, and closes its audio graph', () => {
  const html = readFileSync(new URL('../player/local-video-player.html', import.meta.url), 'utf8')
  const video = { pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() }
  const audioCtx = { state: 'running', close: vi.fn(async () => {}) }
  const cancelAnimationFrame = vi.fn()
  const context = { video, audioCtx, cancelAnimationFrame, raf: 42 }
  runInNewContext(html.slice(html.indexOf('function disposeMedia()'), html.indexOf("window.addEventListener('pagehide'")), context)
  context.disposeMedia()
  expect(video.pause).toHaveBeenCalledOnce()
  expect(video.removeAttribute).toHaveBeenCalledWith('src')
  expect(video.load).toHaveBeenCalledOnce()
  expect(audioCtx.close).toHaveBeenCalledOnce()
  expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
})
