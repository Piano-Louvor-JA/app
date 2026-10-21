import { clampFloatingPosition } from './floating-position'

export type FloatingPanelRect = { id: string; x: number; y: number; width: number; height: number }

/** Busca a posição livre mais próxima, considerando o painel inteiro e suas ações. */
export function arrangeFloatingPanels(
  panels: FloatingPanelRect[],
  viewport: { width: number; height: number },
  gap = 12,
): FloatingPanelRect[] {
  const placed: FloatingPanelRect[] = []
  for (const panel of panels) {
    const preferred = clampFloatingPosition(panel, panel, viewport)
    const xs = [preferred.x, 8, viewport.width - panel.width - 8]
    const ys = [preferred.y, 8, viewport.height - panel.height - 8]
    for (const other of placed) {
      xs.push(other.x - panel.width - gap, other.x + other.width + gap)
      ys.push(other.y - panel.height - gap, other.y + other.height + gap)
    }
    const candidates = xs.flatMap((x) => ys.map((y) => clampFloatingPosition({ x, y }, panel, viewport)))
      .sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y))
    const free = candidates.find((candidate) => placed.every((other) =>
      candidate.x + panel.width + gap <= other.x || other.x + other.width + gap <= candidate.x ||
      candidate.y + panel.height + gap <= other.y || other.y + other.height + gap <= candidate.y,
    ))
    placed.push({ ...panel, ...(free ?? preferred) })
  }
  return placed
}
