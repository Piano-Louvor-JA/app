// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  createIndependentProjectionRegistry,
  isIndependentProjectionUrl,
} from '../independent-projection.mjs'

function fakeWindow() {
  /** @type {Record<string, Array<() => void>>} */
  const handlers = {}
  return {
    destroyed: false,
    isDestroyed() {
      return this.destroyed
    },
    setAlwaysOnTop: vi.fn(),
    moveTop: vi.fn(),
    on: vi.fn((event, listener) => {
      ;(handlers[event] ??= []).push(listener)
    }),
    emit(event) {
      for (const listener of handlers[event] ?? []) listener()
    },
  }
}

describe('isIndependentProjectionUrl', () => {
  it('reconhece o parâmetro no hash (Electron) e na query (dev http)', () => {
    expect(isIndependentProjectionUrl('file:///app/index.html#/popup?module=clock&independent=1')).toBe(true)
    expect(isIndependentProjectionUrl('http://localhost:5173/popup?module=clock&independent=1')).toBe(true)
  })

  it('ignora popups normais e entradas inválidas', () => {
    expect(isIndependentProjectionUrl('file:///app/index.html#/popup?module=clock')).toBe(false)
    expect(isIndependentProjectionUrl('http://localhost:5173/popup?independent=0')).toBe(false)
    expect(isIndependentProjectionUrl('not a url')).toBe(false)
    expect(isIndependentProjectionUrl('')).toBe(false)
    expect(isIndependentProjectionUrl(undefined)).toBe(false)
  })
})

describe('createIndependentProjectionRegistry', () => {
  it('raise põe as independentes acima das demais screen-saver', () => {
    const registry = createIndependentProjectionRegistry()
    const win = fakeWindow()
    registry.add(win)
    registry.raise()
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 1)
    expect(win.moveTop).toHaveBeenCalled()
    expect(registry.has(win)).toBe(true)
  })

  it('janela destruída sai do registro; fechada também', () => {
    const registry = createIndependentProjectionRegistry()
    const a = fakeWindow()
    const b = fakeWindow()
    registry.add(a)
    registry.add(b)
    a.destroyed = true
    registry.raise()
    expect(a.moveTop).not.toHaveBeenCalled()
    expect(registry.has(a)).toBe(false)
    b.emit('closed')
    expect(registry.size()).toBe(0)
  })

  it('erro do Electron ao reerguer não propaga', () => {
    const registry = createIndependentProjectionRegistry()
    const win = fakeWindow()
    win.moveTop.mockImplementation(() => {
      throw new Error('closing')
    })
    registry.add(win)
    expect(() => registry.raise()).not.toThrow()
  })

  it('outra janela aparecendo ou mudando de nível reergue (agora e depois)', () => {
    const scheduled = []
    const registry = createIndependentProjectionRegistry({
      schedule: (fn) => scheduled.push(fn),
    })
    const independent = fakeWindow()
    const principal = fakeWindow()
    registry.add(independent)
    registry.watch(independent)
    registry.watch(principal)

    principal.emit('show')
    expect(independent.moveTop).toHaveBeenCalledTimes(1)
    scheduled.shift()()
    expect(independent.moveTop).toHaveBeenCalledTimes(2)

    principal.emit('always-on-top-changed')
    expect(independent.moveTop).toHaveBeenCalledTimes(3)

    // A própria independente não dispara loop
    independent.emit('show')
    independent.emit('always-on-top-changed')
    expect(independent.moveTop).toHaveBeenCalledTimes(3)
  })

  it('raiseSoon sem independentes não agenda nada', () => {
    const schedule = vi.fn()
    const registry = createIndependentProjectionRegistry({ schedule })
    registry.raiseSoon()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('agendamento padrão usa setTimeout', () => {
    vi.useFakeTimers()
    const registry = createIndependentProjectionRegistry()
    const win = fakeWindow()
    registry.add(win)
    registry.raiseSoon()
    vi.advanceTimersByTime(250)
    expect(win.moveTop).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('raiseOne isolado reergue só aquela janela', () => {
    const registry = createIndependentProjectionRegistry()
    const win = fakeWindow()
    registry.raiseOne(win)
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 1)
  })
})
