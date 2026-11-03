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
