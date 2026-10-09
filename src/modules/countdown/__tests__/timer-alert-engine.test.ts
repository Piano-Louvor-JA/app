import { describe, it, expect } from 'vitest'
import { createAlertEngine } from '../services/timer-alert-engine'
import type { AlertMark } from '../services/timer-alert-engine'

describe('timer-alert-engine', () => {
  const marks: AlertMark[] = [
    { id: 'open', atMs: 0 },
    { id: '5min', atMs: 5 * 60_000 },
    { id: '1min', atMs: 60_000 },
    { id: 'end', atMs: 10 * 60_000 },
  ]

  it('dispara o marco de abertura (atMs=0) já no primeiro tick', () => {
    const engine = createAlertEngine(marks)
    const fired = engine.tick(0)
    expect(fired.map((m) => m.id)).toEqual(['open'])
  })

  it('não repete marco já disparado', () => {
    const engine = createAlertEngine(marks)
    engine.tick(0)
    expect(engine.tick(1000)).toEqual([])
  })

  it('dispara marcos conforme elapsed cresce, cada um 1x, na ordem da lista', () => {
    const engine = createAlertEngine(marks)
    engine.tick(0) // abertura
    expect(engine.tick(30_000)).toEqual([])
    const fired = engine.tick(60_000)
    expect(fired.map((m) => m.id)).toEqual(['1min'])
    expect(engine.tick(61_000).map((m) => m.id)).toEqual([])
    expect(engine.tick(5 * 60_000).map((m) => m.id)).toEqual(['5min'])
    expect(engine.tick(10 * 60_000 + 500).map((m) => m.id)).toEqual(['end'])
  })

  it('dispara marcos perdidos (salto de tempo) num único tick', () => {
    const engine = createAlertEngine(marks)
    engine.tick(0)
    const fired = engine.tick(10 * 60_000)
    expect(fired.map((m) => m.id)).toEqual(['1min', '5min', 'end'])
  })

  it('elapsed regressivo (reset) rearma marcos ainda não atingidos', () => {
    const engine = createAlertEngine(marks)
    engine.tick(0)
    engine.tick(60_000)
    engine.reset()
    // após reset, abertura volta a disparar? Não: reset limpa histórico
    const fired = engine.tick(0)
    expect(fired.map((m) => m.id)).toEqual(['open'])
  })

  it('engine sem marcos nunca dispara', () => {
    const engine = createAlertEngine([])
    expect(engine.tick(999_999)).toEqual([])
  })

  it('marcos fora de ordem disparam por tempo, não por índice', () => {
    const engine = createAlertEngine([
      { id: 'end', atMs: 60_000 },
      { id: 'open', atMs: 0 },
    ])
    expect(engine.tick(0).map((m) => m.id)).toEqual(['open'])
    expect(engine.tick(60_000).map((m) => m.id)).toEqual(['end'])
  })
})
