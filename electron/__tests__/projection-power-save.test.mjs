// projection-power-save — ref-count do powerSaveBlocker (tela acesa em culto)
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { start, stop, isStarted } = vi.hoisted(() => {
  const start = vi.fn(() => 101)
  const stop = vi.fn()
  const isStarted = vi.fn((h) => h === 101)
  return { start, stop, isStarted }
})

vi.mock('electron', () => ({
  powerSaveBlocker: { start, stop, isStarted },
}))

import {
  projectionPowerSaveAcquire,
  projectionPowerSaveRelease,
  projectionPowerSaveState,
} from '../projection-power-save.mjs'

beforeEach(() => {
  // 1) drena refs do teste anterior (pode chamar stop), 2) zera mocks
  while (projectionPowerSaveState().count > 0 || projectionPowerSaveState().handle != null) {
    const before = projectionPowerSaveState().count + (projectionPowerSaveState().handle != null ? 1 : 0)
    projectionPowerSaveRelease()
    const after = projectionPowerSaveState().count + (projectionPowerSaveState().handle != null ? 1 : 0)
    if (after >= before) break // estado travado — evita loop infinito
  }
  start.mockClear(); stop.mockClear(); isStarted.mockClear()
})

describe('projection power-save ref-count', () => {
  it('primeira acquire inicia blocker', () => {
    projectionPowerSaveAcquire()
    expect(start).toHaveBeenCalledTimes(1)
    expect(projectionPowerSaveState().active).toBe(true)
  })

  it('segunda acquire NÃO reinicia (1 blocker global)', () => {
    projectionPowerSaveAcquire()
    projectionPowerSaveAcquire()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('release de 1 de 2 não para; a última para', () => {
    projectionPowerSaveAcquire()
    projectionPowerSaveAcquire()
    projectionPowerSaveRelease()
    expect(stop).not.toHaveBeenCalled()
    projectionPowerSaveRelease()
    expect(stop).toHaveBeenCalledWith(101)
    expect(projectionPowerSaveState().active).toBe(false)
  })

  it('release sem acquire é no-op (não lança)', () => {
    expect(() => projectionPowerSaveRelease()).not.toThrow()
    expect(stop).not.toHaveBeenCalled()
  })
})
