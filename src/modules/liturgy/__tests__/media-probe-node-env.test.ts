// Ambiente NODE (sem window) — mata mutantes do guard `typeof window === 'undefined'`
// (falsos-sobreviventes em jsdom: lá o `||` seguinte domina e o guard nunca difere)
import { describe, expect, it, vi } from 'vitest'

// window NÃO existe em environment node; garantir que não foi injetado pelo setup
describe('probeMediaDurationMs — ambiente node (sem window, guard SSR/renderer)', () => {
  it('retorna 0 quando window é undefined (renderer sem DOM)', async () => {
    expect(typeof window).toBe('undefined')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { probeMediaDurationMs } = await import('../services/media-probe')
    await expect(probeMediaDurationMs('/x.mp4')).resolves.toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(
      '[media-probe] electronAPI.media.probeDuration não disponível — duração 0',
    )
    warnSpy.mockRestore()
  })
})
