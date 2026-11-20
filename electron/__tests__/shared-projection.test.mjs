// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  createSharedProjectionLayout,
  displayForBounds,
  isSharedProjectionUrl,
  splitDisplayBounds,
} from '../shared-projection.mjs'

const PRIMARY = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
const SECOND = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }
const THIRD = { id: 3, bounds: { x: 3840, y: 0, width: 1281, height: 720 } }
const DISPLAYS = [PRIMARY, SECOND, THIRD]

function fakeWindow(bounds, { visible = true } = {}) {
  /** @type {Record<string, Array<() => void>>} */
  const handlers = {}
  const win = {
    bounds: { ...bounds },
    visible,
    destroyed: false,
    fullscreen: false,
    simple: false,
    isDestroyed: () => win.destroyed,
    isVisible: () => win.visible,
    getBounds: () => ({ ...win.bounds }),
    setBounds: vi.fn((rect) => {
      win.bounds = { ...rect }
    }),
    isFullScreen: () => win.fullscreen,
    setFullScreen: vi.fn((flag) => {
      win.fullscreen = flag
    }),
    isSimpleFullScreen: () => win.simple,
    setSimpleFullScreen: vi.fn((flag) => {
      win.simple = flag
    }),
    on: vi.fn((event, listener) => {
      ;(handlers[event] ??= []).push(listener)
    }),
    emit(event) {
      for (const listener of handlers[event] ?? []) listener()
    },
  }
  return win
}

function setup(projection = []) {
  const scheduled = []
  const layout = createSharedProjectionLayout({
    getProjectionWindows: () => projection,
    getDisplays: () => DISPLAYS,
    schedule: (fn) => scheduled.push(fn),
  })
  return { layout, scheduled, projection }
}

describe('isSharedProjectionUrl', () => {
  it('reconhece share=1 no hash e na query', () => {
    expect(isSharedProjectionUrl('file:///a/index.html#/popup?module=clock&independent=1&share=1')).toBe(true)
    expect(isSharedProjectionUrl('http://localhost:5173/popup?share=1')).toBe(true)
  })

  it('ignora popups sem share e entradas inválidas', () => {
    expect(isSharedProjectionUrl('file:///a/index.html#/popup?module=clock&independent=1')).toBe(false)
    expect(isSharedProjectionUrl('http://localhost/popup?share=0')).toBe(false)
    expect(isSharedProjectionUrl('nope')).toBe(false)
    expect(isSharedProjectionUrl('')).toBe(false)
    expect(isSharedProjectionUrl(null)).toBe(false)
  })
})

describe('splitDisplayBounds / displayForBounds', () => {
  it('divide ao meio; largura ímpar vai para a direita', () => {
    expect(splitDisplayBounds(THIRD.bounds)).toEqual({
      left: { x: 3840, y: 0, width: 640, height: 720 },
      right: { x: 4480, y: 0, width: 641, height: 720 },
    })
  })

  it('acha o monitor pelo centro da janela', () => {
    expect(displayForBounds({ x: 1920, y: 0, width: 960, height: 1080 }, DISPLAYS)).toBe(SECOND)
    expect(displayForBounds({ x: -5000, y: 0, width: 10, height: 10 }, DISPLAYS)).toBeNull()
  })
})

describe('createSharedProjectionLayout', () => {
  it('compartilhada divide com a projeção que já está no monitor', () => {
    const bible = fakeWindow(SECOND.bounds)
    const bibleOther = fakeWindow(THIRD.bounds)
    const clock = fakeWindow(SECOND.bounds)
    const { layout } = setup([bible, bibleOther, clock])

    layout.addShared(clock, 2)
    layout.relayout()

    expect(bible.bounds).toEqual({ x: 1920, y: 0, width: 960, height: 1080 })
    expect(clock.bounds).toEqual({ x: 2880, y: 0, width: 960, height: 1080 })
    // Outro monitor não muda
    expect(bibleOther.setBounds).not.toHaveBeenCalled()
    expect(layout.isShared(clock)).toBe(true)
  })

  it('sozinha no monitor ocupa a tela inteira', () => {
    const clock = fakeWindow({ x: 2880, y: 0, width: 960, height: 1080 })
    const { layout } = setup([clock])
    layout.addShared(clock, 2)
    layout.relayout()
    expect(clock.bounds).toEqual(SECOND.bounds)
  })

  it('quando a compartilhada fecha, a outra volta para a tela inteira', () => {
    const bible = fakeWindow(SECOND.bounds)
    const clock = fakeWindow(SECOND.bounds)
    const projection = [bible, clock]
    const { layout, scheduled } = setup(projection)
    layout.addShared(clock, 2)
    layout.relayout()

    clock.destroyed = true
    projection.pop()
    clock.emit('closed')
    expect(bible.bounds).toEqual(SECOND.bounds)
    expect(layout.sharedCount()).toBe(0)
    expect(scheduled).toHaveLength(1)
  })

  it('quando a principal sai, a compartilhada ocupa a tela inteira', () => {
    const bible = fakeWindow(SECOND.bounds)
    const clock = fakeWindow(SECOND.bounds)
    const projection = [bible, clock]
    const { layout } = setup(projection)
    layout.addShared(clock, 2)
    layout.watch(bible)
    layout.relayout()

    bible.destroyed = true
    projection.shift()
    bible.emit('closed')
    expect(clock.bounds).toEqual(SECOND.bounds)
  })

  it('janela nova que aparece no monitor entra na divisão', () => {
    const clock = fakeWindow(SECOND.bounds)
    const projection = [clock]
    const { layout } = setup(projection)
    layout.addShared(clock, 2)
    layout.relayout()

    const timer = fakeWindow(SECOND.bounds)
    projection.push(timer)
    layout.watch(timer)
    timer.emit('show')
    expect(timer.bounds).toEqual({ x: 1920, y: 0, width: 960, height: 1080 })
    expect(clock.bounds).toEqual({ x: 2880, y: 0, width: 960, height: 1080 })
  })

  it('janela escondida não conta e volta a dividir ao reaparecer', () => {
    const bible = fakeWindow(SECOND.bounds)
    const clock = fakeWindow(SECOND.bounds)
    const { layout } = setup([bible, clock])
    layout.addShared(clock, 2)
    layout.watch(bible)
    layout.relayout()

    bible.visible = false
    bible.emit('hide')
    expect(clock.bounds).toEqual(SECOND.bounds)

    bible.visible = true
    bible.emit('show')
    expect(bible.bounds.width).toBe(960)
    expect(clock.bounds.x).toBe(2880)
  })

  it('sem compartilhada nem janela encolhida, eventos não mexem em nada', () => {
    const bible = fakeWindow(SECOND.bounds)
    const { layout, scheduled } = setup([bible])
    layout.watch(bible)
    bible.emit('show')
    expect(bible.setBounds).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(0)
  })

  it('compartilhada escondida ou em monitor removido não divide', () => {
    const bible = fakeWindow(SECOND.bounds)
    const clock = fakeWindow(SECOND.bounds, { visible: false })
    const ghost = fakeWindow(SECOND.bounds)
    const { layout } = setup([bible, clock, ghost])
    layout.addShared(clock, 2)
    layout.addShared(ghost, 99)
    layout.relayout()
    expect(bible.setBounds).not.toHaveBeenCalled()
  })

  it('sai do fullscreen nativo (macOS) antes de redimensionar', () => {
    const bible = fakeWindow(SECOND.bounds)
    bible.fullscreen = true
    bible.simple = true
    const clock = fakeWindow(SECOND.bounds)
    const { layout } = setup([bible, clock])
    layout.addShared(clock, 2)
    layout.relayout()
    expect(bible.setSimpleFullScreen).toHaveBeenCalledWith(false)
    expect(bible.setFullScreen).toHaveBeenCalledWith(false)
    expect(bible.bounds.width).toBe(960)
  })

  it('ignora janelas destruídas, fora de qualquer monitor e erros do Electron', () => {
    const offscreen = fakeWindow({ x: -9000, y: 0, width: 10, height: 10 })
    const dead = fakeWindow(SECOND.bounds)
    dead.destroyed = true
    const broken = fakeWindow(SECOND.bounds)
    broken.setBounds.mockImplementation(() => {
      throw new Error('closing')
    })
    const clock = fakeWindow(SECOND.bounds)
    const deadShared = fakeWindow(SECOND.bounds)
    const { layout } = setup([offscreen, dead, broken, clock])
    layout.addShared(clock, 2)
    layout.addShared(deadShared, 2)
    deadShared.destroyed = true
    expect(() => layout.relayout()).not.toThrow()
    expect(offscreen.setBounds).not.toHaveBeenCalled()
    expect(layout.sharedCount()).toBe(1)
  })

  it('janela encolhida destruída ou fora do monitor é só esquecida', () => {
    const bible = fakeWindow(SECOND.bounds)
    const clock = fakeWindow(SECOND.bounds)
    const projection = [bible, clock]
    const { layout } = setup(projection)
    layout.addShared(clock, 2)
    layout.relayout()

    projection.shift()
    bible.destroyed = true
    clock.emit('closed')
    expect(bible.setBounds).toHaveBeenCalledTimes(1)

    const lost = fakeWindow(SECOND.bounds)
    const clock2 = fakeWindow(SECOND.bounds)
    const p2 = [lost, clock2]
    const second = setup(p2)
    second.layout.addShared(clock2, 2)
    second.layout.relayout()
    p2.shift()
    lost.bounds = { x: -9000, y: 0, width: 10, height: 10 }
    second.layout.relayout()
    expect(lost.bounds.x).toBe(-9000)
  })

  it('agendamento padrão usa setTimeout', () => {
    vi.useFakeTimers()
    const clock = fakeWindow({ x: 2880, y: 0, width: 960, height: 1080 })
    const layout = createSharedProjectionLayout({
      getProjectionWindows: () => [clock],
      getDisplays: () => DISPLAYS,
    })
    layout.addShared(clock, 2)
    layout.relayoutSoon()
    vi.advanceTimersByTime(300)
    expect(clock.bounds).toEqual(SECOND.bounds)
    vi.useRealTimers()
  })
})
