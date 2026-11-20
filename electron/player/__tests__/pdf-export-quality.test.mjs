// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const ZOOM_PAN = readFileSync(new URL('../zoom-pan.js', import.meta.url), 'utf8')

/** Roda o player de PDF com PDF.js falso: página 600×800 numa tela 960×540. */
async function loadPdfPlayer() {
  const html = readFileSync(new URL('../local-pdf-player.html', import.meta.url), 'utf8')
  const code = html.slice(html.indexOf('      pdfjsLib.GlobalWorkerOptions'), html.lastIndexOf('</script>')).replace('import.meta.url', "'file:///player/local-pdf-player.html'")
  const context2d = { fillRect() {}, drawImage() {} }
  const canvas = { width: 0, height: 0, style: {}, getContext: () => context2d }
  const exported = []
  const viewports = []
  const page = {
    getViewport: (opts) => { viewports.push(opts); return { width: 600 * opts.scale, height: 800 * opts.scale } },
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  }
  const stage = { clientWidth: 960, clientHeight: 540, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) }
  const window = { location: { search: '?src=file.pdf' }, innerWidth: 960, innerHeight: 540, addEventListener() {} }
  const document = {
    body: { classList: { toggle() {}, add() {}, remove() {} } },
    getElementById: id => id === 'frame' ? canvas : id === 'stage' ? stage : { classList: { toggle() {} } },
    createElement: () => { const flat = { width: 0, height: 0, getContext: () => context2d, toDataURL: () => 'data:image/png;base64,cG5n' }; exported.push(flat); return flat },
  }
  const context = { window, document, URL, URLSearchParams, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0),
    pdfjsLib: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => page }) }) },
  }
  runInNewContext(ZOOM_PAN, context)
  runInNewContext(code, context)
  await new Promise(resolve => setTimeout(resolve, 0))
  return { window, canvas, exported, page, viewports }
}

it('exports a PDF page directly from PDF.js at high resolution independently of the small control window', async () => {
  const { window, canvas, exported, page } = await loadPdfPlayer()
  expect(await window.__liturgyPdf.capturePng()).toBe('cG5n')
  expect(canvas.height).toBe(540)
  // [0] é o canvas de desenho fora da tela; o último é o PNG exportado
  expect(exported.at(-1).height).toBe(3840)
  expect(exported.at(-1).width).toBe(2880)
  expect(page.render).toHaveBeenCalledTimes(2)
  await window.__liturgyPdf.capturePng()
  expect(page.render).toHaveBeenCalledTimes(2)
})

it('cancels and finishes the previous preview before reusing its canvas for navigation', async () => {
  const html = readFileSync(new URL('../local-pdf-player.html', import.meta.url), 'utf8')
  const code = html.slice(html.indexOf('      pdfjsLib.GlobalWorkerOptions'), html.lastIndexOf('</script>')).replace('import.meta.url', "'file:///player/local-pdf-player.html'")
  const context2d = { drawImage() {} }
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
  const stage = { clientWidth: 960, clientHeight: 540, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) }
  const context = { window, URL, URLSearchParams, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0),
    pdfjsLib: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => page }) }) },
    document: {
      body: { classList: { toggle() {}, add() {}, remove() {} } },
      getElementById: id => id === 'frame' ? canvas : id === 'stage' ? stage : { classList: { toggle() {} } },
      // a página é desenhada fora da tela e copiada para o canvas visível
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }) }),
    },
  }
  runInNewContext(ZOOM_PAN, context)
  runInNewContext(code, context)
  await vi.waitFor(() => expect(tasks).toHaveLength(1))
  const navigation = window.__liturgyPdf.goTo(1).then(value => ({ value }), error => ({ error }))
  try {
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(2))
    expect(tasks[0].cancel).toHaveBeenCalledOnce()
    tasks[1].finish()
    expect(await navigation).toMatchObject({ value: { index: 1, total: 3 } })
    expect(window.__liturgyPdf.getState()).toMatchObject({ index: 1, total: 3 })
  } finally {
    for (const task of tasks) task.finish()
  }
})

it('com zoom, as TVs recebem só o recorte visível, em alta resolução e nítido na tela', async () => {
  const { window, canvas, exported, page, viewports } = await loadPdfPlayer()
  // encaixe: 540/800 → página 405×540 na tela
  expect(canvas.style.width).toBe('405px')

  window.__liturgyPdf.setView({ zoom: 2, x: 0, y: 0 })
  await new Promise(resolve => setTimeout(resolve, 200))
  // redesenhada com o dobro de pixels, mesmo tamanho na tela
  expect(canvas.height).toBe(1080)
  expect(canvas.style.height).toBe('540px')

  expect(await window.__liturgyPdf.capturePng()).toBe('cG5n')
  // zoom 2 no centro: a página em pé (405 de 960) ainda cabe na largura;
  // na altura aparece só a metade do meio → recorte 600×400 de 600×800
  const flat = exported.at(-1)
  expect(flat.width).toBe(3840)
  expect(flat.height).toBe(2560)
  const last = viewports.at(-1)
  expect(last.scale).toBeCloseTo(6.4, 5)
  expect(last.offsetX).toBeCloseTo(0, 3)
  expect(last.offsetY).toBeCloseTo(-200 * 6.4, 3)

  // mesma visão: reaproveita; outra visão: exporta de novo
  const renders = page.render.mock.calls.length
  await window.__liturgyPdf.capturePng()
  expect(page.render.mock.calls.length).toBe(renders)
  window.__liturgyPdf.setView({ zoom: 2, x: 0.2, y: 0 })
  await window.__liturgyPdf.capturePng()
  expect(page.render.mock.calls.length).toBe(renders + 1)
  expect(window.__liturgyPdf.getState().view).toEqual({ zoom: 2, x: 0.2, y: 0 })

  // TVs novas: página inteira mesmo com zoom (elas aplicam o zoom sozinhas)
  await window.__liturgyPdf.capturePng({ full: true })
  expect(exported.at(-1).width).toBe(2880)
  expect(exported.at(-1).height).toBe(3840)
  expect(viewports.at(-1).offsetX).toBe(-0)
})
