/**
 * Regressão do bug "palco cinza" (13/10): syncPptToTvs do pdf-control-bar
 * enviava slide cinza às TVs. Duas causas combinadas:
 *
 * 1. captureSourceFrameBase64 (web-projection.mjs): capturePng() do PDF.js
 *    retorna null enquanto o canvas não renderizou → caía no fallback
 *    capturePage() que captura o frame cinza de loading do BrowserWindow.
 *    Em PDF grande (24 pág, LibreOffice), os 3 syncs do boot (0/700/1800ms)
 *    TODOS capturavam cinza → TV exibia "png cinza" (print do Rafael).
 * 2. Se a TV conecta DEPOIS do boot, nenhum re-sync dispara (replay devolve
 *    estado antigo/cinza).
 *
 * Aqui o pdf-control-bar real roda em jsdom: stub de window.louvorja com
 * captureSourceFrame controlável. O sync do boot TEM que:
 * - NÃO enviar frame cinza (capturePng null → abort, sem fallback);
 * - REPETIR até o canvas PDF.js estar pronto (retry com backoff);
 * - RE-SINCRONIZAR quando uma TV conecta (onReceiverConnected).
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
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

function loadBar(captureSourceFrame: () => Promise<string | null>): {
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
      getPlaybackState: () => Promise.resolve(null),
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
  Object.defineProperty(w, 'louvorja', { value: stub, configurable: true })

  const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) ?? []
  for (const s of scripts) {
    w.eval(s.replace(/<\/?script>/g, ''))
  }
  return { sent, served, receiverConnectedCbs }
}

describe('pdf-control-bar: sync PPT/PDF → Palco (regressão cinza)', () => {
  it('NÃO envia frame cinza: capturePng null → abort SEM fallback capturePage', async () => {
    const { sent, served } = loadBar(() => Promise.resolve(null))
    await new Promise((r) => setTimeout(r, 50))
    expect(served).toEqual([])
    expect(sent).toEqual([])
  })

  it('RETRY: canvas PDF.js demora >1.8s → sync repete até captura válida', async () => {
    let calls = 0
    const { sent, served } = loadBar(() => {
      calls++
      return Promise.resolve(calls < 4 ? null : 'aGVsbG8=')
    })
    // tentativas: 0ms(1ª) + 500 + 800 + 1280 ≈ 2.6s até a 4ª (válida)
    await new Promise((r) => setTimeout(r, 3500))
    expect(served.length).toBeGreaterThan(0)
    expect(sent.length).toBeGreaterThan(0)
    expect((sent[0]!.msg as { type: string }).type).toBe('projection')
  })

  it('RE-SYNC quando TV conecta depois do boot', async () => {
    const { sent, receiverConnectedCbs } = loadBar(() => Promise.resolve('aGVsbG8='))
    await new Promise((r) => setTimeout(r, 50))
    const before = sent.length
    receiverConnectedCbs[0]?.({ slotId: '0' })
    await new Promise((r) => setTimeout(r, 50))
    expect(sent.length).toBeGreaterThan(before)
  })
})
