import { describe, expect, it, vi, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'

import { readEffectiveStageSettings, subscribeStageSettings } from '../services/stage-settings-runtime'

// Setup jsdom environment with BroadcastChannel polyfill
class MockBroadcastChannel {
  private name: string
  private listeners: ((msg: MessageEvent) => void)[] = []
  static instances: Map<string, MockBroadcastChannel> = new Map()

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.set(name, this)
  }

  onmessage: ((msg: MessageEvent) => void) | null = null

  postMessage(data: any) {
    const msg = { data }
    this.listeners.forEach(fn => fn(msg))
    if (this.onmessage) this.onmessage(msg)
  }

  addEventListener(_type: string, listener: (msg: MessageEvent) => void) {
    this.listeners.push(listener)
  }

  removeEventListener(_type: string, listener: (msg: MessageEvent) => void) {
    const i = this.listeners.indexOf(listener)
    if (i >= 0) this.listeners.splice(i, 1)
  }

  close() {
    MockBroadcastChannel.instances.delete(this.name)
  }
}

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
})
globalThis.window = dom.window as unknown as Window & typeof globalThis
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage
globalThis.BroadcastChannel = MockBroadcastChannel as unknown as BroadcastChannelConstructor

describe('stage-settings-runtime (projeção popup)', () => {
  beforeEach(() => {
    localStorage.clear()
    MockBroadcastChannel.instances.clear()
    vi.restoreAllMocks()
  })

  it('lê defaults quando storage vazio', () => {
    const s = readEffectiveStageSettings('bible')
    // 05/10 Rafael: default null (não setado) — imagem vence sem escolha
    expect(s.backgroundColor).toBeNull()
    expect(s.bibleFontSize).toBe(84)
  })

  it('lê override salvo por escopo (herança global)', () => {
    localStorage.setItem('user_data', JSON.stringify({
      'stage.settings.global': { bg: '#111111', fg: '#FFFFFF' },
      'stage.settings.bible': { bg: '#222222', fg: '#FFFF00' }, // override completo
    }))
    const s = readEffectiveStageSettings('bible')
    expect(s.backgroundColor).toBe('#222222') // override do bible
    expect(s.textColor).toBe('#FFFF00') // do override (não herdado campo a campo)
    // módulo sem override → global
    const h = readEffectiveStageSettings('hymns')
    expect(h.backgroundColor).toBe('#111111')
    expect(h.textColor).toBe('#FFFFFF')
  })

  it('notifica subscriber quando BroadcastChannel dispara', () => {
    const cb = vi.fn()
    const unsub = subscribeStageSettings(cb)

    // Simula save do store → notifyStageSettingsChanged
    const channel = MockBroadcastChannel.instances.get('louvorja-stage-settings')
    channel?.postMessage('changed')

    // Processa microtask
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb).toHaveBeenCalled()
        unsub()
        resolve()
      }, 10)
    })
  })

  it('não vaza callback após unsub', () => {
    const cb = vi.fn()
    const unsub = subscribeStageSettings(cb)
    unsub()

    const channel = MockBroadcastChannel.instances.get('louvorja-stage-settings')
    channel?.postMessage('changed')

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb).not.toHaveBeenCalled()
        resolve()
      }, 10)
    })
  })
})