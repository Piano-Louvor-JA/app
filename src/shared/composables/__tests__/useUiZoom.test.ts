// @vitest-environment jsdom
// Cobertura useUiZoom (gaps shared): snap/clamp, bridge nativo vs fallback CSS,
// limites zoomIn/zoomOut, reset, initUiZoom popup, syncFromNative, onChanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Bridge = {
  zoom?: {
    getFactor?: () => number
    setFactor?: (v: number) => number
    zoomIn?: () => number
    zoomOut?: () => number
    onChanged?: (cb: (p: { factor: number }) => void) => () => void
  }
}

const bridgeImpl: Bridge = {}

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => bridgeImpl,
}))

const isPopupRef = { value: false }

vi.mock('@shared/services/projection-window-location', () => ({
  isProjectionPopupLocation: () => isPopupRef.value,
}))

const getUserPreference = vi.fn(() => undefined)
const setUserPreference = vi.fn()

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: (...a: unknown[]) => getUserPreference(...(a as [])),
  setUserPreference: (...a: unknown[]) => setUserPreference(...(a as [never, never])),
}))

async function loadFresh() {
  vi.resetModules()
  return await import('../useUiZoom')
}

async function withComponent(fn: () => unknown) {
  const { defineComponent, h } = await import('vue')
  const { mount } = await import('@vue/test-utils')
  let result: unknown
  const Host = defineComponent({
    setup() {
      result = fn()
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  return { wrapper, result }
}

describe('useUiZoom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPopupRef.value = false
    delete bridgeImpl.zoom
    document.documentElement.style.removeProperty('zoom')
    document.documentElement.style.removeProperty('--ui-zoom')
  })
  afterEach(() => {
    document.documentElement.style.removeProperty('zoom')
    document.documentElement.style.removeProperty('--ui-zoom')
  })

  it('clamp 70–150% e snap 99–101 → 100; NaN → default', async () => {
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.setZoom(2)
    expect(api.zoom.value).toBe(1.5)
    api.setZoom(0.1)
    expect(api.zoom.value).toBe(0.7)
    api.setZoom(1.01)
    expect(api.zoom.value).toBe(1)
    api.setZoom(Number.NaN)
    expect(api.zoom.value).toBe(1)
    expect(api.zoomPercent.value).toBe(100)
  })

  it('zoomIn/zoomOut com bridge nativo', async () => {
    const zoomInApi = vi.fn(() => 1.1)
    const zoomOutApi = vi.fn(() => 0.9)
    bridgeImpl.zoom = { zoomIn: zoomInApi, zoomOut: zoomOutApi, setFactor: (v) => v }
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.zoomIn()
    expect(api.zoom.value).toBe(1.1)
    api.zoomOut()
    expect(api.zoom.value).toBe(0.9)
    // raw fora do snap → reaplica via applyZoom
    zoomInApi.mockReturnValue(1.014)
    api.zoomIn()
    expect(api.zoom.value).toBe(1) // 101.4% snapeia pra 100%
  })

  it('zoomIn/zoomOut sem setFactor nativo: fallback CSS ±0.1', async () => {
    bridgeImpl.zoom = {}
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.zoomIn()
    expect(api.zoom.value).toBe(1.1)
    // jsdom ignora a propriedade CSS `zoom`; var custom é aplicada
    expect(document.documentElement.style.getPropertyValue('--ui-zoom')).toBe('1.1')
    api.zoomOut()
    expect(api.zoom.value).toBe(1)
  })

  it('limites: zoomIn no máximo / zoomOut no mínimo são no-op', async () => {
    bridgeImpl.zoom = { setFactor: (v) => v }
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.setZoom(1.5)
    expect(api.canZoomIn.value).toBe(false)
    api.zoomIn()
    expect(api.zoom.value).toBe(1.5)
    api.setZoom(0.7)
    expect(api.canZoomOut.value).toBe(false)
    api.zoomOut()
    expect(api.zoom.value).toBe(0.7)
  })

  it('resetZoom volta a 100%', async () => {
    bridgeImpl.zoom = { setFactor: (v) => v }
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.setZoom(1.3)
    api.resetZoom()
    expect(api.zoom.value).toBe(1)
    expect(api.zoomPercent.value).toBe(100)
    expect(api.min).toBe(0.7)
    expect(api.max).toBe(1.5)
  })

  it('setZoom persiste preferência (com localStorage disponível)', async () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(() => null) })
    bridgeImpl.zoom = { setFactor: (v) => v }
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.setZoom(1.2)
    expect(setUserPreference).toHaveBeenCalledWith('ui.zoom', 1.2)
    vi.unstubAllGlobals()
  })

  it('initUiZoom na janela de projeção limpa CSS e não aplica', async () => {
    isPopupRef.value = true
    document.documentElement.style.zoom = '1.3'
    const mod = await loadFresh()
    mod.initUiZoom()
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('')
  })

  it('initUiZoom aplica zoom persistido (string no storage)', async () => {
    const setFactor = vi.fn((v: number) => v)
    bridgeImpl.zoom = { setFactor }
    getUserPreference.mockReturnValue('1.2' as unknown as undefined)
    const mod = await loadFresh()
    mod.initUiZoom()
    expect(setFactor).toHaveBeenCalledWith(1.2)
  })

  it('zoom persistido inválido cai no default (100%)', async () => {
    getUserPreference.mockReturnValue('abc' as unknown as undefined)
    const setFactor = vi.fn((v: number) => v)
    bridgeImpl.zoom = { setFactor }
    const mod = await loadFresh()
    mod.initUiZoom()
    expect(setFactor).toHaveBeenCalledWith(1)
  })

  it('bridge setFactor que lança → fallback CSS', async () => {
    bridgeImpl.zoom = {
      setFactor: () => {
        throw new Error('boom')
      },
    }
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.setZoom(1.3)
    expect(api.zoom.value).toBe(1.3)
    expect(document.documentElement.style.getPropertyValue('--ui-zoom')).toBe('1.3')
  })

  it('onChanged: syncFromNative reaplica quando snapeia e trata NaN', async () => {
    const setFactor = vi.fn((v: number) => v)
    let changeCb: ((p: { factor: number }) => void) | undefined
    bridgeImpl.zoom = {
      getFactor: () => 1,
      setFactor,
      onChanged: (cb) => {
        changeCb = cb
        return () => {}
      },
    }
    const mod = await loadFresh()
    const { wrapper } = await withComponent(() => mod.useUiZoom())
    expect(changeCb).toBeTruthy()
    changeCb!({ factor: 1.01 }) // snap → reaplica 1
    expect(setFactor).toHaveBeenLastCalledWith(1)
    changeCb!({ factor: 1.25 }) // direto, só persiste
    changeCb!({ factor: Number.NaN }) // readNativeFactor → 1 (getFactor)
    wrapper.unmount()
  })

  it('onChanged com payload sem factor usa readNativeFactor', async () => {
    const setFactor = vi.fn((v: number) => v)
    let changeCb: ((p: { factor?: number }) => void) | undefined
    bridgeImpl.zoom = {
      getFactor: () => 2, // fora do clamp → syncFromNative reaplica 1.5
      setFactor,
      onChanged: (cb: (p: { factor?: number }) => void) => {
        changeCb = cb
        return () => {}
      },
    }
    const mod = await loadFresh()
    const { wrapper } = await withComponent(() => mod.useUiZoom())
    changeCb!({})
    // payload sem factor → readNativeFactor=2 → clamp 1.5, guardado no ref
    expect(setFactor).toHaveBeenLastCalledWith(1)
    expect(mod.useUiZoom().zoom.value).toBe(1.5)
    wrapper.unmount()
  })

  it('readNativeFactor: bridge sem getFactor → null (syncFromNative ignorado)', async () => {
    const setFactor = vi.fn((v: number) => v)
    let changeCb: ((p: { factor?: number }) => void) | undefined
    bridgeImpl.zoom = {
      setFactor,
      onChanged: (cb: (p: { factor?: number }) => void) => {
        changeCb = cb
        return () => {}
      },
    }
    const mod = await loadFresh()
    const { wrapper } = await withComponent(() => mod.useUiZoom())
    setFactor.mockClear()
    changeCb!({})
    // factor null → return sem tocar nada
    expect(setFactor).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('zoomOut nativo com raw fora do snap reaplica via applyZoom', async () => {
    const setFactor = vi.fn((v: number) => v)
    const zoomOutApi = vi.fn(() => 1.005)
    bridgeImpl.zoom = { setFactor, zoomOut: zoomOutApi }
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.setZoom(1.1)
    api.zoomOut()
    // 100.5% snapeia pra 100
    expect(api.zoom.value).toBe(1)
  })

  it('bridge zoomIn ausente → fallback setZoom', async () => {
    bridgeImpl.zoom = { setFactor: (v) => v }
    const mod = await loadFresh()
    const api = mod.useUiZoom()
    api.zoomIn()
    expect(api.zoom.value).toBe(1.1)
  })
})
