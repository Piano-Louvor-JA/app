// File: src/modules/libras/__tests__/VLibrasUnityPlayer.test.ts
// SPDX-License-Identifier: MIT
// F-B.1 (SPEC v2.1): player Unity VLibras via iframe + postMessage.
// Protocolo: {type:'unity', object, method, params} → PlayerManager (icaro/hozana).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// SPEC AC-1 / PLAN l.11: lookup ANTES de playNow — o componente nunca toca glosa crua.
// Mock controlado para observar exatamente o que chega ao PlayerManager.playNow.
const prepareMock = vi.fn()
vi.mock('../services/libras-trie', () => ({
  prepareGlossForPlayback: (gloss: string) => prepareMock(gloss),
}))
import VLibrasUnityPlayer from '../components/VLibrasUnityPlayer.vue'

const UNITY_URL = '/vlibras/index.html'

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
  prepareMock.mockReset()
  // resposta padrão do prepare: devolve a glosa preparada (usada pelos testes de fluxo)
  prepareMock.mockImplementation(async (gloss: string) => ({ gloss: `PREP:${gloss}`, fingerspelled: [] }))
})

function playNowCalls(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.filter((c) => c[0]?.method === 'playNow')
}

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

  it('playGloss antes de ready: glosa PREPARADA enviada após on_load_player (nunca crua)', async () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('DEUS AMOR')
    await vi.waitFor(() => expect(prepareMock).toHaveBeenCalledWith('DEUS AMOR'))
    expect(postMessage).not.toHaveBeenCalled()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    const plays = playNowCalls(postMessage)
    expect(plays).toHaveLength(1)
    expect(plays[0][0].params).toBe('PREP:DEUS AMOR')
  })

  it('playGloss com ready: playNow único e somente com glosa preparada', async () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    postMessage.mockClear()
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('CASA')
    await vi.waitFor(() => expect(playNowCalls(postMessage)).toHaveLength(1))
    const plays = playNowCalls(postMessage)
    expect(plays[0][0].params).toBe('PREP:CASA')
  })

  it('glosa crua NUNCA vai ao Unity: todo playNow tem prefixo PREP (última glosa vence)', async () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('DEUS AMOR')
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('JESUS CRISTO')
    await vi.waitFor(() => expect(prepareMock).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(playNowCalls(postMessage)).toHaveLength(1))
    const plays = playNowCalls(postMessage)
    // supersede: sequence guard faz a glosa mais recente vencer (máx 1 playNow por glosa)
    expect(plays[0][0].params).toBe('PREP:JESUS CRISTO')
  })

  it('idempotência: mesma glosa preparada repetida NÃO dispara segundo playNow', async () => {
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('CASA')
    await vi.waitFor(() => expect(playNowCalls(postMessage)).toHaveLength(1))
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('CASA')
    await vi.waitFor(() => expect(prepareMock).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 20))
    expect(playNowCalls(postMessage)).toHaveLength(1)
  })

  it('prepare falha: silêncio — glosa crua NÃO é tocada como fallback', async () => {
    prepareMock.mockReset()
    prepareMock.mockRejectedValue(new Error('trie offline'))
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    postMessage.mockClear()
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('CASA')
    await vi.waitFor(() => expect(prepareMock).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(playNowCalls(postMessage)).toHaveLength(0)
  })

  // REWORK 2 (AC-2/AC-3): glosa vazia → prepare devolve null → NENHUM postMessage ao Unity
  it('REWORK 2: glosa vazia → playNow NÃO é chamado (nenhum payload vazio ao Unity)', async () => {
    prepareMock.mockReset()
    prepareMock.mockResolvedValue(null)
    const { w, iframeEl, postMessage } = mountPlayer()
    unityEvent(iframeEl.contentWindow, 'on_load_player')
    postMessage.mockClear()
    ;(w.vm as unknown as { playGloss: (g: string) => void }).playGloss('')
    await vi.waitFor(() => expect(prepareMock).toHaveBeenCalledWith(''))
    await new Promise((r) => setTimeout(r, 20))
    expect(postMessage).not.toHaveBeenCalled()
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
