import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseLiturgyWebTarget, getPalcoRoute } from '../liturgy-web-runtime'

describe('getPalcoRoute — RF2 rota de projeção', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('YouTube → mirror (cabeada fullscreen popup)', () => {
    const target = parseLiturgyWebTarget('https://youtube.com/watch?v=dQw4w9WgXcQ')
    expect(target?.kind).toBe('youtube')
    expect(getPalcoRoute(target!)).toBe('mirror')
  })

  it('Vimeo → mirror', () => {
    const target = parseLiturgyWebTarget('https://vimeo.com/123456789')
    expect(target?.kind).toBe('vimeo')
    expect(getPalcoRoute(target!)).toBe('mirror')
  })

  it('site genérico → mirror (cabeada)', () => {
    const target = parseLiturgyWebTarget('https://example.com')
    expect(target?.kind).toBe('site')
    expect(getPalcoRoute(target!)).toBe('mirror')
  })

  it('local-video → slot (TV/receivers via 7080/7081)', () => {
    expect(getPalcoRoute({ kind: 'local-video', url: 'file:///x.mp4', videoId: '' })).toBe('slot')
  })
})
