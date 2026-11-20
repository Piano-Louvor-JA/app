// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
const source = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
it('removes only the unchecked monitor and preserves the other window instance', () => {
  const videoDisplayIds = new WeakMap()
  const make = id => { const win = { isDestroyed: () => false, close: vi.fn() }; videoDisplayIds.set(win, id); return win }
  const first = make(2), second = make(4)
  const create = vi.fn(display => make(display.id))
  const context = { mirrorWindows: [first, second], videoDisplayIds, currentProjectionMode: 'video', createMirrorWindow: create,
    closeMirrorWindowsOnly: vi.fn(() => { first.close(); second.close(); context.mirrorWindows = [] }) }
  runInNewContext(source.slice(source.indexOf('function openVideoScreensOnTargets('), source.indexOf('/**', source.indexOf('function openVideoScreensOnTargets('))), context)
  context.openVideoScreensOnTargets([{ id: 4 }])
  expect(first.close).toHaveBeenCalledOnce()
  expect(second.close).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
  expect(context.mirrorWindows).toEqual([second])
})
it('closing one mirror does not broadcast a global stop to network connections', () => {
  const block = source.slice(source.indexOf('function createMirrorWindow('), source.indexOf('const mirrorUrl', source.indexOf('function createMirrorWindow(')))
  const body = /win.on\('closed', \(\) => \{([\s\S]*?)\n  \}\)/.exec(block)[1]
  const win = {}, other = {}, stop = vi.fn()
  const context = { win, mirrorWindows: [win, other], stopPalcoMediaOnClose: stop }
  runInNewContext(body, context)
  expect(context.mirrorWindows).toEqual([other])
  expect(stop).not.toHaveBeenCalled()
})
it('site selection removes only the unchecked window and its interaction shield', () => {
  const videoDisplayIds = new WeakMap()
  const make = id => { const win = { isDestroyed: () => false, close: vi.fn() }; videoDisplayIds.set(win, id); return win }
  const removed = make(2), kept = make(4), removedShield = make(2), keptShield = make(4)
  const create = vi.fn()
  const context = { mirrorWindows: [removed, kept], siteShieldWindows: [removedShield, keptShield], videoDisplayIds,
    createSiteProjectionWindow: create, createSiteShieldWindow: create, startSiteProjectionSync: vi.fn(), stopSiteProjectionSync: vi.fn() }
  runInNewContext(source.slice(source.indexOf('function openSiteScreensOnTargets('), source.indexOf('let currentSourceFilePath')), context)
  context.openSiteScreensOnTargets('https://example.test', [{ id: 4 }])
  expect(removed.close).toHaveBeenCalledOnce()
  expect(removedShield.close).toHaveBeenCalledOnce()
  expect(kept.close).not.toHaveBeenCalled()
  expect(keptShield.close).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
})
