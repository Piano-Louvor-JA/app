// File: src/modules/libras/__tests__/VLibrasUnityPlayer.test.ts
// SPDX-License-Identifier: MIT
// F-B.1 (SPEC v2.1): player Unity VLibras via iframe + postMessage.
// Protocolo: {type:'unity', object, method, params} → PlayerManager (icaro/hozana).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VLibrasUnityPlayer from '../components/VLibrasUnityPlayer.vue'

const UNITY_URL = 'https://vlibras.gov.br/app/unity/index.html'

function mountPlayer() {
  const w = mount(VLibrasUnityPlayer)
  const iframeEl = w.find('iframe').element as HTMLIFrameElement
  const postMessage = vi.fn()
  Object.defineProperty(iframeEl, 'contentWindow', {
    value: { postMessage },
    configurable: true,
  })
  return { w, iframeEl, postMessage }
}

function unityEvent(source: unknown, event: string, data?: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'unity_event', event, data },
      source: source as MessageEventSource | null,
    })
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('F-B.1 — VLibrasUnityPlayer', () => {
  it('renderiza iframe Unity com sandbox e URL oficial', () => {
    const { w } = mountPlayer()
    const iframe = w.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('src')).toBe(UNITY_URL)
    expect(iframe.attributes('sandbox')).toContain('allow-scripts')
    expect(iframe.attributes('sandbox')).toContain('allow-same-origin')
  })

  it('não está ready antes de on_load_player', () => {
    const { w } = mountPlayer()
    expect((w.vm as unknown as { ready: boolean }).ready).toBe(false)
  })

  it('on_load_player: fica ready e manda PlayerManager.Change icaro', () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    expect((w.vm as unknown as { ready: boolean }).ready).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unity', object: 'PlayerManager', method: 'Change', params: 'icaro' }),
      '*'
    )
  })

  it('evento de outra source é ignorado (não fica ready)', () => {
    const { w } = mountPlayer()
    unityEvent(window, 'on_load_player')
    expect((w.vm as unknown as { ready: boolean }).ready).toBe(false)
  })

  it('evento que não é unity_event é ignorado', () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'outra', event: 'on_load_player' },
        source: iframeEl.contentWindow as MessageEventSource,
      })
    )
    expect((w.vm as unknown as { ready: boolean }).ready).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('playGloss antes de ready: pendencia enviada após on_load_player', () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('DEUS AMOR')
    expect(postMessage).not.toHaveBeenCalled()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unity', object: 'PlayerManager', method: 'playNow', params: 'DEUS AMOR' }),
      '*'
    )
  })

  it('playGloss com ready: playNow imediato', () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    postMessage.mockClear()
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('CASA')
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unity', object: 'PlayerManager', method: 'playNow', params: 'CASA' }),
      '*'
    )
  })

  it('stop envia stopAll quando ready', () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    postMessage.mockClear()
    ;(w.vm as unknown as { stop: () => void }).stop()
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unity', object: 'PlayerManager', method: 'stopAll' }),
      '*'
    )
  })

  it('stop antes de ready não envia nada (sem crash)', () => {
    const { postMessage } = mountPlayer()
    const { w } = mountPlayer()
    ;(w.vm as unknown as { stop: () => void }).stop()
    expect(postMessage).not.toHaveBeenCalled()
  })
})
