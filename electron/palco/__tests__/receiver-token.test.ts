/**
 * Regressão do bug "palco não conecta" (13/10): o 082ece48 endureceu
 * palcoSocketUrl() com token, mas doConnect()/directTry() nunca passaram
 * a usá-la — WS abria SEM token e o servidor (requestHasPalcoAccess,
 * exigindo token p/ IP de LAN) fechava o socket. clients: 0 pra sempre.
 *
 * Aqui o receiver real roda em jsdom e interceptamos o construtor de
 * WebSocket: a URL capturada TEM que carregar o token da querystring.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECEIVER_PATH = resolve(__dirname, '../../../electron/palco/receiver.html')

declare global {
  interface Window {
    handle: (m: unknown) => void
  }
}

let dom: JSDOM
let w: Window
let capturedUrls: string[]

function loadReceiver(url: string): void {
  const html = readFileSync(RECEIVER_PATH, 'utf-8')
  dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  w = dom.window as unknown as Window
  capturedUrls = []

  class FakeWebSocket {
    url: string
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((ev: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    constructor(u: string) {
      this.url = u
      capturedUrls.push(u)
    }
    close() {}
    send() {}
  }
  Object.defineProperty(w, 'WebSocket', { value: FakeWebSocket, configurable: true })
  Object.defineProperty(w, 'fetch', {
    configurable: true,
    value: () => Promise.reject(new Error('fetch stubbed')),
  })
  ;(w as unknown as { PalmSystem?: unknown }).PalmSystem = undefined
  w.localStorage.clear()

  for (const el of dom.window.document.querySelectorAll('script')) {
    const code = el.textContent ?? ''
    if (!code.trim()) continue
    try {
      dom.window.eval(code)
    } catch {
      // boot pode tocar APIs ausentes no jsdom
    }
  }
}

beforeAll(() => {
  loadReceiver('http://192.168.1.192:7080/?token=91KCV')
})

describe('receiver — token no WebSocket (regressão 082ece48)', () => {
  it('palcoSocketUrl() anexa ?token= quando a URL traz token', () => {
    const fn = (w as unknown as { palcoSocketUrl: () => string }).palcoSocketUrl
    expect(typeof fn).toBe('function')
    const url = fn.call(w)
    expect(url).toContain('?token=91KCV')
    expect(url).toMatch(/^ws:\/\/192\.168\.1\.192:7081\/palco\?token=91KCV$/)
  })

  it('doConnect() usa palcoSocketUrl() — WS carrega o token (LAN)', () => {
    // guarda estado original p/ restaurar (testes seguintes)
    const state = w as unknown as { host: string; port: string; doConnect: () => void; retry: () => void }
    const origHost = state.host
    const origPort = state.port
    state.host = '192.168.1.192'
    state.port = '7081'
    capturedUrls.length = 0
    try {
      state.doConnect()
      expect(capturedUrls.length).toBeGreaterThan(0)
      expect(capturedUrls[0]).toContain('?token=91KCV')
      expect(capturedUrls[0]).toContain('/palco')
    } finally {
      state.host = origHost
      state.port = origPort
    }
  })

  it('directTry() também usa a URL endurecida', () => {
    const state = w as unknown as { host: string; port: string; directTry: () => void }
    const origHost = state.host
    state.host = '192.168.1.192'
    capturedUrls.length = 0
    try {
      state.directTry()
      expect(capturedUrls.length).toBeGreaterThan(0)
      expect(capturedUrls[0]).toContain('?token=91KCV')
    } finally {
      state.host = origHost
    }
  })

  it('sem token na URL → conecta sem ?token= (não trava)', () => {
    loadReceiver('http://192.168.1.192:7580/?token=') // novo load, sem token
    const state = w as unknown as { host: string; port: string; doConnect: () => void }
    state.host = '192.168.1.192'
    state.port = '7081'
    capturedUrls.length = 0
    state.doConnect()
    expect(capturedUrls[0]).toBe('ws://192.168.1.192:7081/palco')
  })
})
