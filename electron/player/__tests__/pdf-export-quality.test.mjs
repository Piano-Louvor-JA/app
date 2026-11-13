// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
it('exports a PDF page directly from PDF.js at high resolution independently of the small control window', async () => {
  const html = readFileSync(new URL('../local-pdf-player.html', import.meta.url), 'utf8')
  const code = html.slice(html.indexOf('      pdfjsLib.GlobalWorkerOptions'), html.lastIndexOf('</script>')).replace('import.meta.url', "'file:///player/local-pdf-player.html'")
  const context2d = { fillRect() {}, drawImage() {} }
  const canvas = { width: 0, height: 0, style: {}, getContext: () => context2d }
  const exported = []
  const page = { getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }), render: vi.fn(() => ({ promise: Promise.resolve() })) }
  const window = { location: { search: '?src=file.pdf' }, innerWidth: 960, innerHeight: 540, addEventListener() {} }
  runInNewContext(code, { window, URL, URLSearchParams,
    pdfjsLib: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => page }) }) },
    document: { getElementById: id => id === 'frame' ? canvas : id === 'stage' ? { clientWidth: 960, clientHeight: 540 } : { classList: { toggle() {} } },
      createElement: () => { const flat = { width: 0, height: 0, getContext: () => context2d, toDataURL: () => 'data:image/png;base64,cG5n' }; exported.push(flat); return flat } },
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(await window.__liturgyPdf.capturePng()).toBe('cG5n')
  expect(canvas.height).toBe(540)
  expect(exported[0].height).toBe(3840)
  expect(exported[0].width).toBe(2880)
  expect(page.render).toHaveBeenCalledTimes(2)
  await window.__liturgyPdf.capturePng()
  expect(page.render).toHaveBeenCalledTimes(2)
})

it('cancels and finishes the previous preview before reusing its canvas for navigation', async () => {
  const html = readFileSync(new URL('../local-pdf-player.html', import.meta.url), 'utf8')
  const code = html.slice(html.indexOf('      pdfjsLib.GlobalWorkerOptions'), html.lastIndexOf('</script>')).replace('import.meta.url', "'file:///player/local-pdf-player.html'")
  const context2d = {}
  const canvas = { width: 0, height: 0, style: {}, getContext: () => context2d }
  const tasks = []
  let rendering = false
  const page = {
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
    render: vi.fn(() => {
      if (rendering) throw new Error('Cannot use the same canvas during multiple render() operations')
      rendering = true
      let resolve, reject
      const promise = new Promise((yes, no) => { resolve = yes; reject = no })
      const task = {
        promise,
        finish() { rendering = false; resolve() },
        cancel: vi.fn(() => {
          rendering = false
          reject(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' }))
        }),
      }
      tasks.push(task)
      return task
    }),
  }
  const window = { location: { search: '?src=file.pdf' }, innerWidth: 960, innerHeight: 540, addEventListener() {} }
  runInNewContext(code, { window, URL, URLSearchParams,
    pdfjsLib: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => page }) }) },
    document: { getElementById: id => id === 'frame' ? canvas : id === 'stage' ? { clientWidth: 960, clientHeight: 540 } : { classList: { toggle() {} } } },
  })
  await vi.waitFor(() => expect(tasks).toHaveLength(1))
  const navigation = window.__liturgyPdf.goTo(1).then(value => ({ value }), error => ({ error }))
  try {
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(2))
    expect(tasks[0].cancel).toHaveBeenCalledOnce()
    tasks[1].finish()
    expect(await navigation).toEqual({ value: { index: 1, total: 3 } })
    expect(window.__liturgyPdf.getState()).toEqual({ index: 1, total: 3 })
  } finally {
    for (const task of tasks) task.finish()
  }
})
