// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isPositionReliable, placeMainWindow } from '../window-placement.mjs'

// Layout real do caso: DP-1 começa em y=753, então (0,0) é área morta.
const LEFT = { id: 3, workArea: { x: 0, y: 753, width: 2560, height: 1080 } }
const PRIMARY = { id: 2, workArea: { x: 2560, y: 785, width: 2560, height: 1048 } }
const PORTRAIT = { id: 39, workArea: { x: 5120, y: 0, width: 1080, height: 2560 } }
const DISPLAYS = [LEFT, PRIMARY, PORTRAIT]
const DEFAULTS = { width: 1440, height: 900 }

function place(saved, trustPosition = true) {
  return placeMainWindow({ saved, displays: DISPLAYS, primary: PRIMARY, trustPosition, defaults: DEFAULTS })
}

function isInside(bounds, area) {
  return (
    bounds.x >= area.x &&
    bounds.y >= area.y &&
    bounds.x + bounds.width <= area.x + area.width &&
    bounds.y + bounds.height <= area.y + area.height
  )
}

describe('placeMainWindow', () => {
  it('sem estado salvo: centra no monitor principal', () => {
    const r = place(null)
    expect(r).toEqual({ x: 3120, y: 859, width: 1440, height: 900, isMaximized: false })
    expect(isInside(r, PRIMARY.workArea)).toBe(true)
  })

  it('posição gravada no Wayland (não confiável): abre no principal e mantém tamanho e maximizado', () => {
    const r = place({ x: 0, y: 0, width: 1632, height: 942, isMaximized: true }, false)
    expect(r).toEqual({ x: 3024, y: 838, width: 1632, height: 942, isMaximized: true })
  })

  it('caso real: (0,0) só encosta no DP-1 e não pode abrir cortada', () => {
    const r = place({ x: 0, y: 0, width: 1632, height: 942 })
    expect(isInside(r, LEFT.workArea)).toBe(true)
    expect(r).toMatchObject({ x: 0, y: 753, width: 1632, height: 942 })
  })

  it('posição válida e inteira num monitor: restaura igual', () => {
    const saved = { x: 100, y: 800, width: 1200, height: 800, isMaximized: false }
    expect(place(saved)).toEqual(saved)
  })

  it('janela passando da borda: puxa para dentro do monitor com maior área', () => {
    const r = place({ x: 4000, y: 900, width: 1400, height: 800 })
    expect(isInside(r, PRIMARY.workArea)).toBe(true)
    expect(r).toMatchObject({ x: 3720, y: 900 })
  })

  it('janela maior que o monitor: reduz ao workArea', () => {
    const r = place({ x: 5120, y: 0, width: 2560, height: 1440 })
    expect(r).toMatchObject({ x: 5120, y: 0, width: 1080, height: 1440 })
  })

  it('monitor desconectado (sem interseção): volta para o principal', () => {
    const r = place({ x: 9000, y: 3000, width: 1200, height: 800, isMaximized: true })
    expect(isInside(r, PRIMARY.workArea)).toBe(true)
    expect(r.isMaximized).toBe(true)
  })

  it('aplica tamanho mínimo do app ao estado salvo', () => {
    const r = place({ x: 2600, y: 800, width: 300, height: 200 })
    expect(r).toMatchObject({ width: 1024, height: 640 })
  })

  it('sem monitores: usa os defaults sem posição', () => {
    expect(placeMainWindow({ saved: null, displays: [], primary: null, trustPosition: true, defaults: DEFAULTS }))
      .toEqual({ width: 1440, height: 900, isMaximized: false })
  })
})

describe('isPositionReliable', () => {
  it('Windows e macOS: sempre confiável', () => {
    expect(isPositionReliable({ platform: 'win32', ozonePlatform: '', env: {} })).toBe(true)
    expect(isPositionReliable({ platform: 'darwin', ozonePlatform: '', env: {} })).toBe(true)
  })

  it('Linux via XWayland (--ozone-platform=x11): confiável', () => {
    const env = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' }
    expect(isPositionReliable({ platform: 'linux', ozonePlatform: 'x11', env })).toBe(true)
  })

  it('Linux em sessão X11 pura: confiável', () => {
    expect(isPositionReliable({ platform: 'linux', ozonePlatform: '', env: { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' } })).toBe(true)
  })

  it('Linux em Wayland nativo: não confiável (getBounds não reflete a posição real)', () => {
    expect(isPositionReliable({ platform: 'linux', ozonePlatform: '', env: { XDG_SESSION_TYPE: 'wayland' } })).toBe(false)
    expect(isPositionReliable({ platform: 'linux', ozonePlatform: 'wayland', env: { WAYLAND_DISPLAY: 'wayland-0' } })).toBe(false)
  })
})
