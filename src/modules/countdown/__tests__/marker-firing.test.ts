import { describe, it, expect } from 'vitest'

/**
 * B2/RF-2 — contrato de disparo com marcos DINÂMICOS (v2).
 * Sessão pura que espelha a semântica do watch(remainingRawMs):
 * - marker offsetMs === 0 ("start") dispara na transição pra running;
 * - demais disparam por cruzamento decrescente (prevRaw >= offset > raw);
 * - prevRaw inicial = ponto de partida real → nada dispara retroativo;
 * - reset rearma todos.
 */

interface Marker {
  id: string
  offsetMs: number
}

function createFiringSession(markers: Marker[]) {
  const sorted = [...markers].sort((a, b) => b.offsetMs - a.offsetMs)
  const fired = new Set<string>()
  const firedLog: string[] = []
  let prevRaw: number | null = null

  return {
    /** Transição pra running: dispara "start" (offset 0) e ancora prevRaw. */
    startRunning(raw: number): string[] {
      prevRaw = raw
      const hits: string[] = []
      for (const m of sorted) {
        if (m.offsetMs !== 0 || fired.has(m.id)) continue
        fired.add(m.id)
        hits.push(m.id)
        firedLog.push(m.id)
      }
      return hits
    },
    /** Observação de tempo restante (ms) durante a execução. */
    tick(raw: number): string[] {
      if (prevRaw == null) return []
      const hits: string[] = []
      for (const m of sorted) {
        if (m.offsetMs === 0 || fired.has(m.id)) continue
        if (prevRaw >= m.offsetMs && raw < m.offsetMs) {
          fired.add(m.id)
          hits.push(m.id)
          firedLog.push(m.id)
        }
      }
      prevRaw = raw
      return hits
    },
    reset() {
      fired.clear()
      prevRaw = null
    },
    firedLog,
  }
}

describe('disparo com marcos dinâmicos (v2)', () => {
  it('marco custom de 7min dispara exatamente 1x ao cruzar (B2)', () => {
    const session = createFiringSession([
      { id: 'start', offsetMs: 0 },
      { id: 'm7', offsetMs: 420_000 },
    ])
    expect(session.startRunning(480_000)).toEqual(['start'])
    expect(session.tick(430_000)).toEqual([])
    expect(session.tick(419_999)).toEqual(['m7'])
    session.tick(300_000)
    session.tick(10_000)
    session.tick(0)
    expect(session.firedLog).toEqual(['start', 'm7'])
  })

  it('start dispara na transição pra running, exatamente 1x', () => {
    const session = createFiringSession([{ id: 'start', offsetMs: 0 }])
    expect(session.startRunning(600_000)).toEqual(['start'])
    expect(session.startRunning(600_000)).toEqual([])
  })

  it('marco acima do tempo inicial NUNCA dispara retroativamente (RF-2)', () => {
    const session = createFiringSession([{ id: 'm30', offsetMs: 1_800_000 }])
    session.startRunning(480_000)
    session.tick(60_000)
    session.tick(0)
    expect(session.firedLog).toEqual([])
  })

  it('reset rearma: mesmos marcos disparam de novo na próxima execução', () => {
    const session = createFiringSession([{ id: 'm1', offsetMs: 60_000 }])
    session.startRunning(90_000)
    session.tick(59_000)
    expect(session.firedLog).toEqual(['m1'])
    session.reset()
    session.startRunning(90_000)
    session.tick(59_000)
    expect(session.firedLog).toEqual(['m1', 'm1'])
  })

  it('N marcos cruzados no mesmo tick disparam todos (ordem decrescente de offset)', () => {
    const session = createFiringSession([
      { id: 'a', offsetMs: 120_000 },
      { id: 'b', offsetMs: 100_000 },
    ])
    session.startRunning(150_000)
    expect(session.tick(90_000)).toEqual(['a', 'b'])
  })
})
