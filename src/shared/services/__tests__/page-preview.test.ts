// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { capturePagePreview } from '../page-preview'

const originalBridge = window.louvorja

function element(rect: Partial<DOMRect>) {
  const el = document.createElement('main')
  el.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, ...rect }) as DOMRect
  return el
}

function installBridge({ factor = 1, capture = vi.fn(async () => 'data:image/jpeg;base64,AA') } = {}) {
  window.louvorja = {
    ...originalBridge,
    isElectron: true,
    zoom: { getFactor: () => factor },
    window: { capturePreview: capture },
  } as unknown as typeof window.louvorja
  return capture
}

afterEach(() => {
  window.louvorja = originalBridge
})

describe('capturePagePreview', () => {
  it('captura a área do elemento e devolve a miniatura', async () => {
    const capture = installBridge()
    const result = await capturePagePreview(element({ x: 0, y: 120, width: 1600, height: 700 }))
    expect(capture).toHaveBeenCalledWith({ x: 0, y: 120, width: 1600, height: 700 })
    expect(result).toBe('data:image/jpeg;base64,AA')
  })

  it('desconta o rodapé reservado (faixa de histórico e dock ficam por cima)', async () => {
    const capture = installBridge()
    const el = element({ x: 0, y: 120, width: 1600, height: 780 })
    el.style.paddingBottom = '108px'
    await capturePagePreview(el)
    expect(capture).toHaveBeenCalledWith({ x: 0, y: 120, width: 1600, height: 672 })
  })

  it('rodapé maior que a área: nada a capturar', async () => {
    const capture = installBridge()
    const el = element({ x: 0, y: 0, width: 800, height: 100 })
    el.style.paddingBottom = '100px'
    expect(await capturePagePreview(el)).toBeNull()
    expect(capture).not.toHaveBeenCalled()
  })

  it('aplica o zoom da interface (CSS px → px da janela)', async () => {
    const capture = installBridge({ factor: 1.25 })
    await capturePagePreview(element({ x: 10, y: 100, width: 800, height: 400 }))
    expect(capture).toHaveBeenCalledWith({ x: 13, y: 125, width: 1000, height: 500 })
  })

  it('no navegador (sem captura) devolve null', async () => {
    window.louvorja = { ...originalBridge } as typeof window.louvorja
    expect(await capturePagePreview(element({ width: 100, height: 100 }))).toBeNull()
  })

  it('sem elemento ou com área vazia devolve null sem capturar', async () => {
    const capture = installBridge()
    expect(await capturePagePreview(null)).toBeNull()
    expect(await capturePagePreview(element({ width: 0, height: 300 }))).toBeNull()
    expect(capture).not.toHaveBeenCalled()
  })

  it('sem zoom informado usa 1', async () => {
    const capture = vi.fn(async () => null)
    window.louvorja = {
      ...originalBridge,
      isElectron: true,
      window: { capturePreview: capture },
    } as unknown as typeof window.louvorja
    expect(await capturePagePreview(element({ width: 200, height: 100 }))).toBeNull()
    expect(capture).toHaveBeenCalledWith({ x: 0, y: 0, width: 200, height: 100 })
  })

  it('erro na captura devolve null', async () => {
    installBridge({ capture: vi.fn(async () => Promise.reject(new Error('gpu'))) })
    expect(await capturePagePreview(element({ width: 200, height: 100 }))).toBeNull()
  })
})
