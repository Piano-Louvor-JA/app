import { describe, expect, it } from 'vitest'
import { arrangeFloatingPanels } from '../floating-layout'

describe('organização dos painéis flutuantes', () => {
  it('separa posições salvas sobrepostas, incluindo a área dos botões', () => {
    const result = arrangeFloatingPanels([
      { id: 'bible', x: 1000, y: 600, width: 420, height: 170 },
      { id: 'timer', x: 1000, y: 550, width: 420, height: 170 },
      { id: 'random', x: 900, y: 600, width: 420, height: 170 },
    ], { width: 1600, height: 900 })
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]!, b = result[j]!
        expect(a.x + a.width + 12 <= b.x || b.x + b.width + 12 <= a.x ||
          a.y + a.height + 12 <= b.y || b.y + b.height + 12 <= a.y).toBe(true)
      }
    }
  })

  it('distribui seis painéis em colunas quando não cabem em uma pilha', () => {
    const panels = Array.from({ length: 6 }, (_, i) => ({ id: String(i), x: 1100, y: 700 - i * 180, width: 420, height: 170 }))
    const result = arrangeFloatingPanels(panels, { width: 1600, height: 900 })
    expect(new Set(result.map((p) => p.x)).size).toBeGreaterThan(1)
    for (const panel of result) {
      expect(panel.x).toBeGreaterThanOrEqual(8)
      expect(panel.y).toBeGreaterThanOrEqual(8)
      expect(panel.x + panel.width).toBeLessThanOrEqual(1592)
      expect(panel.y + panel.height).toBeLessThanOrEqual(892)
    }
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      const a = result[i]!, b = result[j]!
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
    }
  })

  it('preserva posições livres', () => {
    const panels = [{ id: 'a', x: 50, y: 60, width: 200, height: 100 }, { id: 'b', x: 500, y: 300, width: 200, height: 100 }]
    expect(arrangeFloatingPanels(panels, { width: 1200, height: 800 })).toEqual(panels)
  })
})
