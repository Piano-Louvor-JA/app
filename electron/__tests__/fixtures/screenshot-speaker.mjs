// Screenshot de validação da página /speaker (A1/A2 do SPEC) — 390×844 (celular).
import { chromium } from '@playwright/test'
import path from 'node:path'

const base = 'http://127.0.0.1:7099/?token=TEST12&remotePort=7071&palcoPort=7081'
const out = '/home/rafaelejosi/.hermes/cache/scratch'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
for (const [name, url] of [
  ['speaker-pt.png', base],
  ['speaker-en.png', base + '&lang=en'],
  ['speaker-es.png', base + '&lang=es'],
]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  // Métricas: quanto da altura útil o preview ocupa + idioma aplicado
  const m = await page.evaluate(() => {
    const pv = document.querySelector('.preview')
    const body = document.body
    const r = pv.getBoundingClientRect()
    return {
      previewH: Math.round(r.height),
      bodyH: body.getBoundingClientRect().height,
      lang: document.documentElement.lang,
      title: document.title,
      repair: document.querySelector('#repair').textContent,
    }
  })
  console.log(name, JSON.stringify(m))
  await page.screenshot({ path: path.join(out, name), fullPage: false })
  await page.close()
}
await browser.close()
