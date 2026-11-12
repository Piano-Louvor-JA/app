// @vitest-environment node
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
function vectorPdf() {
  const content = 'BT /F1 9 Tf 40 720 Td (Fine text from the original PDF) Tj ET\n0.2 w 40 700 m 550 700 l S\n'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 6 0 R 7 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}endstream`]
  objects.push(objects[2], objects[2])
  let result = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const start = Buffer.byteLength(result)
  result += `xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return Buffer.from(result)
}
it('renders the original vector PDF into a 3840px PNG even when the operator window is small', async () => {
  const html = readFileSync(new URL('../local-pdf-player.html', import.meta.url))
  const pdf = vectorPdf()
  const server = createServer((req, res) => {
    const name = new URL(req.url, 'http://local').pathname
    if (name === '/document.pdf') { res.setHeader('Content-Type', 'application/pdf'); res.end(pdf); return }
    if (name === '/vendor/pdfjs/pdf.min.mjs' || name === '/vendor/pdfjs/pdf.worker.min.mjs') {
      res.setHeader('Content-Type', 'text/javascript'); res.end(readFileSync(new URL('..' + name, import.meta.url))); return
    }
    res.setHeader('Content-Type', 'text/html'); res.end(html)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
    await page.goto(`http://127.0.0.1:${server.address().port}/?src=/document.pdf`)
    await page.waitForFunction(() => window.__liturgyPdf?.getState().total === 3 && document.querySelector('#frame').height === 540)
    await page.waitForFunction(async () => Boolean(await window.__liturgyPdf.capturePng()))
    await page.evaluate(() => window.__liturgyPdf.goTo(1))
    const neighbors = await page.evaluate(async () => {
      const before = window.__liturgyPdf.getState().index
      const gallery = await window.__liturgyPdf.captureGalleryPreviews()
      const sizes = await Promise.all(gallery.previews.map(async base64 => {
        const image = new Image(); image.src = 'data:image/jpeg;base64,' + base64
        await image.decode(); return image.naturalWidth
      }))
      return { before, after: window.__liturgyPdf.getState().index, sizes }
    })
    expect(neighbors).toEqual({ before: 1, after: 1, sizes: [480, 480, 480] })
    const exportedSize = () => page.evaluate(async () => {
      const png = await window.__liturgyPdf.capturePng()
      if (!png) return null
      const image = new Image(); image.src = 'data:image/png;base64,' + png
      try { await image.decode() } catch { return null }
      return { width: image.naturalWidth, height: image.naturalHeight }
    })
    await expect.poll(exportedSize).toEqual({ width: 2880, height: 3840 })
    await page.setViewportSize({ width: 480, height: 300 })
    await page.waitForFunction(() => document.querySelector('#frame').height === 300)
    await expect.poll(exportedSize).toEqual({ width: 2880, height: 3840 })
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}, 30000)
