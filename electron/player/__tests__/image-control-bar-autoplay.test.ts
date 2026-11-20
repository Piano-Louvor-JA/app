/** Galeria de imagens (Liturgia e Avisos): "Passar sozinho" avança pelo relógio
 * do sistema, recomeça a contagem no avanço manual e lembra os segundos. */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BAR_PATH = resolve(__dirname, '../../player/image-control-bar.html')

let dom: JSDOM | null = null

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadBar(options: { total?: number; savedSeconds?: string; savedRepeat?: string } = {}) {
  const html = readFileSync(BAR_PATH, 'utf-8')
  dom = new JSDOM(html, { url: 'http://localhost/image-control-bar.html', runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window as unknown as Window & { eval: (code: string) => void }
  if (options.savedSeconds) w.localStorage.setItem('louvorja-image-autoplay-seconds', options.savedSeconds)
  if (options.savedRepeat) w.localStorage.setItem('louvorja-image-autoplay-repeat', options.savedRepeat)

  let now = 1_000_000
  ;(w as unknown as { Date: DateConstructor }).Date.now = () => now
  const total = options.total ?? 3
  const state = { index: 0, nextCalls: 0, prevCalls: 0 }
  const stub = {
    palco: { slots: async () => [], onEvent: () => () => {}, send: async () => true },
    projection: {
      getImageSlideState: async () => ({ index: state.index, total, projecting: false }),
      getPlaybackState: async () => ({ projecting: false }),
      getVideoTargetMonitors: async () => [],
      remoteImageNext: async () => {
        state.nextCalls += 1
        state.index = (state.index + 1) % total
        return { index: state.index, total }
      },
      remoteImagePrev: async () => {
        state.prevCalls += 1
        state.index = (state.index - 1 + total) % total
        return { index: state.index, total }
      },
      toggleVideoScreens: async () => {},
    },
    displays: { list: async () => [{ id: 1, isPrimary: true }], identify: async () => {} },
  }
  Object.defineProperty(w, 'louvorja', { value: stub, configurable: true })
  for (const el of dom.window.document.querySelectorAll('script')) {
    const code = el.textContent ?? ''
    if (code.trim() && !el.getAttribute('src')) w.eval(code)
  }
  const doc = dom.window.document
  return {
    state,
    doc,
    autoplay: doc.getElementById('autoplay') as HTMLButtonElement,
    seconds: doc.getElementById('autoplaySeconds') as HTMLSelectElement,
    repeat: doc.getElementById('autoplayRepeat') as HTMLInputElement,
    advance: (ms: number) => { now += ms },
    storage: w.localStorage,
  }
}

afterEach(() => {
  dom?.window.close()
  dom = null
})

describe('image-control-bar: passar sozinho', () => {
  it('liga com várias imagens, avança no tempo e volta ao início depois da última', async () => {
    const bar = loadBar()
    expect(bar.autoplay.disabled).toBe(true)
    await wait(30)
    expect(bar.autoplay.disabled).toBe(false)
    expect(bar.seconds.value).toBe('5')

    bar.autoplay.click()
    expect(bar.autoplay.getAttribute('aria-pressed')).toBe('true')
    bar.advance(4_900)
    await wait(300)
    expect(bar.state.nextCalls).toBe(0)
    bar.advance(200)
    await wait(300)
    expect(bar.state.nextCalls).toBe(1)
    bar.advance(5_000)
    await wait(300)
    bar.advance(5_000)
    await wait(300)
    expect(bar.state.nextCalls).toBe(3)
    expect(bar.state.index).toBe(0)
    expect(bar.doc.getElementById('counter')!.textContent).toBe('1 / 3')
  })

  it('pausar para de avançar', async () => {
    const bar = loadBar()
    await wait(30)
    bar.autoplay.click()
    bar.autoplay.click()
    expect(bar.autoplay.getAttribute('aria-pressed')).toBe('false')
    bar.advance(60_000)
    await wait(300)
    expect(bar.state.nextCalls).toBe(0)
  })

  it('avançar à mão recomeça a contagem', async () => {
    const bar = loadBar()
    await wait(30)
    bar.autoplay.click()
    bar.advance(4_000)
    ;(bar.doc.getElementById('next') as HTMLButtonElement).click()
    await wait(30)
    expect(bar.state.nextCalls).toBe(1)
    bar.advance(4_000)
    await wait(300)
    expect(bar.state.nextCalls).toBe(1)
    ;(bar.doc.getElementById('prev') as HTMLButtonElement).click()
    await wait(30)
    bar.advance(4_000)
    await wait(300)
    expect(bar.state.nextCalls).toBe(1)
    bar.advance(1_100)
    await wait(300)
    expect(bar.state.nextCalls).toBe(2)
  })

  it('segundos escolhidos ficam salvos e valem na hora', async () => {
    const bar = loadBar({ savedSeconds: '10' })
    await wait(30)
    expect(bar.seconds.value).toBe('10')
    bar.autoplay.click()
    bar.seconds.value = '3'
    bar.seconds.dispatchEvent(new bar.doc.defaultView!.Event('change'))
    expect(bar.storage.getItem('louvorja-image-autoplay-seconds')).toBe('3')
    bar.advance(3_100)
    await wait(300)
    expect(bar.state.nextCalls).toBe(1)
  })

  it('controles ficam à esquerda, junto do transporte', () => {
    const bar = loadBar()
    expect(bar.autoplay.closest('.transport')).not.toBeNull()
    expect(bar.repeat.closest('.transport')).not.toBeNull()
    expect(bar.repeat.checked).toBe(true)
  })

  it('sem repetir: para na última imagem e desliga o automático', async () => {
    const bar = loadBar()
    await wait(30)
    bar.repeat.checked = false
    bar.repeat.dispatchEvent(new bar.doc.defaultView!.Event('change'))
    expect(bar.storage.getItem('louvorja-image-autoplay-repeat')).toBe('false')
    bar.autoplay.click()
    for (let i = 0; i < 4; i++) {
      bar.advance(5_100)
      await wait(300)
    }
    expect(bar.state.nextCalls).toBe(2)
    expect(bar.state.index).toBe(2)
    expect(bar.autoplay.getAttribute('aria-pressed')).toBe('false')
    bar.autoplay.click()
    await wait(30)
    expect(bar.state.index).toBe(0)
    expect(bar.autoplay.getAttribute('aria-pressed')).toBe('true')
  })

  it('"não repetir" salvo volta desmarcado; marcar de novo salva', async () => {
    const bar = loadBar({ savedRepeat: 'false' })
    expect(bar.repeat.checked).toBe(false)
    bar.repeat.checked = true
    bar.repeat.dispatchEvent(new bar.doc.defaultView!.Event('change'))
    expect(bar.storage.getItem('louvorja-image-autoplay-repeat')).toBe('true')
  })

  it('valor salvo inválido cai no padrão; uma imagem só não liga', async () => {
    const bar = loadBar({ total: 1, savedSeconds: '999' })
    await wait(30)
    expect(bar.seconds.value).toBe('5')
    expect(bar.autoplay.disabled).toBe(true)
    bar.autoplay.click()
    expect(bar.autoplay.getAttribute('aria-pressed')).toBe('false')
  })
})
