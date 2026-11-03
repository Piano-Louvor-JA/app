// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8')
function lifecycle() {
  const app = new EventEmitter()
  app.quit = vi.fn(() => app.emit('before-quit'))
  const stop = vi.fn(), unregisterAll = vi.fn()
  const context = { app, mainWindow: {}, isQuitting: false, process: { platform: 'darwin' },
    globalShortcut: { unregisterAll }, getPalcoManager: () => ({ stopAllMedia: stop }), console }
  runInNewContext(main.slice(main.indexOf('app.on("before-quit"'), main.indexOf('app.on("window-all-closed"')), context)
  return { app, context, stop, unregisterAll }
}
it('closing the main window quits on macOS even with auxiliary windows alive', () => {
  const { app, context, stop } = lifecycle()
  const window = new EventEmitter()
  context.mainWindow = window
  runInNewContext(main.slice(main.indexOf('mainWindow.on("closed"'), main.indexOf('\n}', main.indexOf('mainWindow.on("closed"'))), context)
  window.emit('closed')
  expect(app.quit).toHaveBeenCalledOnce()
  expect(context.mainWindow).toBeNull()
  expect(stop).toHaveBeenCalledOnce()
  window.emit('closed')
  expect(app.quit).toHaveBeenCalledOnce()
})
it('explicit quit stops receivers before windows close and releases shortcuts without require', () => {
  const { app, stop, unregisterAll } = lifecycle()
  app.emit('before-quit')
  expect(stop).toHaveBeenCalledOnce()
  app.emit('will-quit')
  expect(unregisterAll).toHaveBeenCalledOnce()
})
it('projection keyboard shields allow Cmd+Q while blocking normal input', () => {
  const projection = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
  const handlers = [...projection.matchAll(/(?:shield|win)\.webContents\.on\('before-input-event', \(event(?:, input)?\) => \{\n([\s\S]*?)\n  \}\)/g)]
  expect(handlers.length).toBeGreaterThanOrEqual(2)
  for (const [, body] of handlers.filter(([, body]) => !body.includes('input.type'))) {
    const preventDefault = vi.fn()
    runInNewContext('(function(){' + body + '\n})()', { event: { preventDefault }, input: { meta: true, key: 'q' } })
    expect(preventDefault).not.toHaveBeenCalled()
    runInNewContext('(function(){' + body + '\n})()', { event: { preventDefault }, input: { meta: false, key: 'a' } })
    expect(preventDefault).toHaveBeenCalledOnce()
  }
})
