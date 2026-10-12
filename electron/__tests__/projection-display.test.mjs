// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  resolveProjectionDisplay,
  buildProjectionWindowBounds,
} from '../projection-display.mjs'

const PRIMARY = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1044 },
}
const SECONDARY = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 1360, height: 768 },
  workArea: { x: 1920, y: 0, width: 1360, height: 728 },
}
const DISPLAYS = [PRIMARY, SECONDARY]

describe('resolveProjectionDisplay', () => {
  it('retorna o monitor pedido por id', () => {
    expect(resolveProjectionDisplay({ monitorId: 2, displays: DISPLAYS, primary: PRIMARY })).toBe(SECONDARY)
  })

  it('cai para o primário quando monitorId é null', () => {
    expect(resolveProjectionDisplay({ monitorId: null, displays: DISPLAYS, primary: PRIMARY })).toBe(PRIMARY)
  })

  it('cai para o primário quando monitorId não existe (monitor desconectado)', () => {
    expect(resolveProjectionDisplay({ monitorId: 99, displays: DISPLAYS, primary: PRIMARY })).toBe(PRIMARY)
  })

  it('ignora monitorId não finito', () => {
    expect(resolveProjectionDisplay({ monitorId: Number.NaN, displays: DISPLAYS, primary: PRIMARY })).toBe(PRIMARY)
  })
})

describe('buildProjectionWindowBounds (fullscreen)', () => {
  it('fullscreen usa bounds totais do monitor alvo', () => {
    const b = buildProjectionWindowBounds({
      fullscreen: true,
      monitorId: 2,
      displays: DISPLAYS,
      primary: PRIMARY,
    })
    expect(b).toEqual({ x: 1920, y: 0, width: 1360, height: 768 })
  })

  it('fullscreen sem monitor usa bounds do primário', () => {
    const b = buildProjectionWindowBounds({
      fullscreen: true,
      monitorId: null,
      displays: DISPLAYS,
      primary: PRIMARY,
    })
    expect(b).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })
})

describe('buildProjectionWindowBounds (janela)', () => {
  it('modo janela posiciona centrado no workArea do monitor alvo', () => {
    const b = buildProjectionWindowBounds({
      fullscreen: false,
      monitorId: 2,
      displays: DISPLAYS,
      primary: PRIMARY,
    })
    // 800x600 centrado em workArea 1920..3280 x 0..728
    expect(b).toEqual({ x: 2200, y: 64, width: 800, height: 600 })
  })

  it('modo janela sem monitor explícito não força posição (WM decide)', () => {
    const b = buildProjectionWindowBounds({
      fullscreen: false,
      monitorId: null,
      displays: DISPLAYS,
      primary: PRIMARY,
    })
    expect(b).toBeNull()
  })
})
