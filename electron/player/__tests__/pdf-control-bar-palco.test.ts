/** PDF projection is explicit. Once started, retry until PDF.js supplies a
 * rendered canvas, resync newly connected receivers, and cancel late frames. */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BAR_PATH = resolve(__dirname, '../../player/pdf-control-bar.html')

let dom: JSDOM
let w: Window

interface LouvorjaStub {
  palco: {
    slots: () => Promise<Array<{ id: string; label: string; clients: number }>>
    serveMedia: (name: string, mime: string, base64: string, slotId: string) => Promise<string>
    send: (msg: Record<string, unknown>, slotId: string) => Promise<void>
    onReceiverConnected: (cb: (e: { slotId: string }) => void) => () => void
  }
  projection: {
    captureSourceFrame: () => Promise<string | null>
    getImageSlideState: () => Promise<unknown>
    getPptSlideState: () => Promise<unknown>
    getPdfPageState: () => Promise<unknown>
    getPlaybackState: () => Promise<unknown>
    getVideoTargetMonitors: () => Promise<number[]>
    toggleVideoScreens: () => Promise<void>
    remotePdfNext: () => Promise<void>
    remotePdfPrev: () => Promise<void>
  }
  displays: {
    list: () => Promise<Array<{ id: number; isPrimary: boolean; bounds?: unknown }>>
    identify: () => Promise<void>
  }
}

function loadBar(captureSourceFrame: () => Promise<string | null>, customize?: (stub: Record<string, any>) => void): {
  sent: Array<{ slotId: string; msg: Record<string, unknown> }>
  served: string[]
  receiverConnectedCbs: Array<(e: { slotId: string }) => void>
} {
  const html = readFileSync(BAR_PATH, 'utf-8')
  dom = new JSDOM(html, {
    url: 'file:///pdf-control-bar.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  w = dom.window as unknown as Window

  const sent: Array<{ slotId: string; msg: Record<string, unknown> }> = []
  const served: string[] = []
  const receiverConnectedCbs: Array<(e: { slotId: string }) => void> = []

  const stub: LouvorjaStub = {
    palco: {
      slots: () =>
        Promise.resolve([{ id: '0', label: 'Principal', clients: 1 }]),
      serveMedia: (_name, _mime, base64) => {
        served.push(base64)
        return Promise.resolve('http://tv/media/' + _name)
      },
      send: (msg, slotId) => {
        sent.push({ slotId, msg })
        return Promise.resolve()
      },
      onReceiverConnected: (cb) => {
        receiverConnectedCbs.push(cb)
        return () => {}
      },
    },
    projection: {
      captureSourceFrame,
      getImageSlideState: () => Promise.resolve(null),
      getPptSlideState: () => Promise.resolve(null),
      getPdfPageState: () => Promise.resolve(null),
      getPlaybackState: () => Promise.resolve({ projecting: false }),
      getVideoTargetMonitors: () => Promise.resolve([]),
      toggleVideoScreens: () => Promise.resolve(),
      remotePdfNext: () => Promise.resolve(),
      remotePdfPrev: () => Promise.resolve(),
    },
    displays: {
      list: () => Promise.resolve([{ id: 1, isPrimary: true }]),
      identify: () => Promise.resolve(),
    },
  }
  customize?.(stub as unknown as Record<string, any>)
  Object.defineProperty(w, 'louvorja', { value: stub, configurable: true })

  for (const el of dom.window.document.querySelectorAll('script')) {
    const src = el.getAttribute('src')
    // scripts da própria barra (seletor de telas, zoom); os demais ficam de fora
    if (src === 'screen-targets.js' || src === 'palco-zoom-sender.js') {
      w.eval(readFileSync(resolve(dirname(BAR_PATH), src), 'utf-8'))
      continue
    }
    const code = el.textContent ?? ''
    if (!code.trim()) continue
    w.eval(code)
  }
  return { sent, served, receiverConnectedCbs }
}

describe('pdf-control-bar: explicit PDF projection and safe capture', () => {
  afterEach(() => dom?.window.close())
  it('opening the control only lists connections and does not capture or transmit', async () => {
    let captures = 0
    const { sent } = loadBar(async () => { captures++; return 'frame' })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(captures).toBe(0); expect(sent).toEqual([])
    const checkbox = w.document.querySelector('#tvList input') as HTMLInputElement
    expect(checkbox.disabled).toBe(false)
  })
  it('NÃO envia frame cinza: capturePng null → abort SEM fallback capturePage', async () => {
    const { sent, served } = loadBar(() => Promise.resolve(null))
    await new Promise((r) => setTimeout(r, 50))
    ;(w.document.getElementById('project') as HTMLButtonElement).click()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(served).toEqual([])
    expect(sent).toEqual([])
  })

  it('RETRY: canvas PDF.js demora >1.8s → sync repete até captura válida', async () => {
    let calls = 0
    const { sent, served } = loadBar(() => {
      calls++
      return Promise.resolve(calls < 4 ? null : 'aGVsbG8=')
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    ;(w.document.getElementById('project') as HTMLButtonElement).click()
    // tentativas: 0ms(1ª) + 500 + 800 + 1280 ≈ 2.6s até a 4ª (válida)
    await new Promise((r) => setTimeout(r, 3500))
    expect(served).toEqual([])
    expect(sent[0]?.msg.background).toBe('data:image/png;base64,aGVsbG8=')
    expect(sent.length).toBeGreaterThan(0)
    expect((sent[0]!.msg as { type: string }).type).toBe('projection')
  })

  it('RE-SYNC quando TV conecta depois do boot', async () => {
    const { sent, receiverConnectedCbs } = loadBar(() => Promise.resolve('aGVsbG8='))
    await new Promise((r) => setTimeout(r, 50))
    ;(w.document.getElementById('project') as HTMLButtonElement).click()
    await new Promise(resolve => setTimeout(resolve, 50))
    const before = sent.length
    receiverConnectedCbs[0]?.({ slotId: '0' })
    await new Promise((r) => setTimeout(r, 50))
    expect(sent.length).toBeGreaterThan(before)
  })
})

 it('unchecking a connection sends a stop only to that destination', async () => {
  const { sent } = loadBar(async () => 'frame')
  await new Promise(resolve => setTimeout(resolve, 50))
  ;(w.document.getElementById('project') as HTMLButtonElement).click()
  await new Promise(resolve => setTimeout(resolve, 50))
  sent.splice(0)
  const input = w.document.querySelector('#tvList input') as HTMLInputElement
  input.checked = false; input.dispatchEvent(new dom.window.Event('change'))
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(sent).toEqual([{ slotId: '0', msg: { v: 2, type: 'idle' } }])
  dom.window.close()
})

it('a capture completing after projection stops cannot transmit a late frame', async () => {
  let release!: (value: string) => void
  const pending = new Promise<string>(resolve => { release = resolve })
  const { sent, served } = loadBar(() => pending)
  await new Promise(resolve => setTimeout(resolve, 30))
  ;(w.document.getElementById('project') as HTMLButtonElement).click()
  await new Promise(resolve => setTimeout(resolve, 30))
  ;(w.document.getElementById('project') as HTMLButtonElement).click()
  await new Promise(resolve => setTimeout(resolve, 0))
  release('frame')
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(served).toEqual([])
  expect(sent).toEqual([])
  dom.window.close()
})

it('seletor de telas igual ao do app: seções, nomes, Tela retorno e o mesmo número', async () => {
  const remoteChanges: Array<[string, boolean]> = []
  const muted: Array<[string, boolean]> = []
  loadBar(async () => 'frame', (stub) => {
    stub.palco.slots = () => Promise.resolve([
      { id: '0', label: 'Principal', clients: 2, running: true },
      { id: '3', label: 'Lateral', clients: 0, running: false },
    ])
    stub.palco.clients = () => Promise.resolve([
      { uid: 'u1', slotId: '0', slotLabel: 'Principal', platform: 'androidtv', name: 'TV da entrada', muted: false },
      { uid: 'u2', slotId: '0', slotLabel: 'Principal', platform: 'obs', name: 'OBS', muted: false },
    ])
    stub.palco.setClientMuted = (_slot: string, uid: string, value: boolean) => { muted.push([uid, value]); return Promise.resolve(true) }
    stub.projection.screenContext = () => Promise.resolve({ returnDisplayId: 4, remotes: [{ id: '0', name: 'OBS', selected: true }] })
    stub.projection.setRemoteSelected = (id: string, selected: boolean) => { remoteChanges.push([id, selected]); return Promise.resolve(true) }
    stub.projection.getVideoTargetMonitors = () => Promise.resolve([2, 3, 4])
    stub.displays.list = () => Promise.resolve([
      { id: 1, isPrimary: true, bounds: { width: 2560, height: 1080 } },
      { id: 2, isPrimary: false, bounds: { width: 2560, height: 1080 } },
      { id: 3, isPrimary: false, bounds: { width: 2560, height: 1080 } },
      { id: 4, isPrimary: false, bounds: { width: 1080, height: 2560 } },
    ])
  })
  await new Promise(resolve => setTimeout(resolve, 50))
  ;(w.document.getElementById('monitorSelect') as HTMLButtonElement).click()
  await new Promise(resolve => setTimeout(resolve, 80))

  const doc = w.document
  expect(doc.querySelector('.panel__title')?.textContent).toBe('Conexões Cabeadas')
  // 3 monitores + a conexão remota marcada, como no app
  expect(doc.getElementById('monitorBadge')?.textContent).toBe('4')
  const monitors = [...doc.querySelectorAll('#monitorList .panel__option-name')].map(el => el.textContent)
  expect(monitors).toEqual(['Monitor 2', 'Monitor 3', 'Monitor 4Tela retorno'])
  expect(doc.querySelector('#tvList .st-section')?.textContent).toBe('Conexões Remotas')
  expect([...doc.querySelectorAll('#tvList .panel__option-name')].map(el => el.textContent)).toEqual(['OBS'])
  expect(doc.querySelector('#tvList .panel__option-meta')?.textContent).toBe('Conexões ativas: 2')
  expect(doc.querySelector('#palcoTvList .st-section')?.textContent).toBe('TVs com Palco')
  expect([...doc.querySelectorAll('#palcoTvList .panel__option-name')].map(el => el.textContent)).toEqual(['TV da entrada'])
  expect(doc.querySelector('#palcoTvList .panel__option-meta')?.textContent).toBe('Principal')

  // desmarcar a conexão no player vale no app e baixa o número
  const remote = doc.querySelector('#tvList input') as HTMLInputElement
  remote.checked = false; remote.dispatchEvent(new dom.window.Event('change'))
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(remoteChanges).toEqual([['0', false]])
  expect(doc.getElementById('monitorBadge')?.textContent).toBe('3')

  // TV desmarcada fica na espera (mesmo controle do app)
  const tv = doc.querySelector('#palcoTvList input') as HTMLInputElement
  tv.checked = false; tv.dispatchEvent(new dom.window.Event('change'))
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(muted).toEqual([['u1', true]])
  dom.window.close()
})

