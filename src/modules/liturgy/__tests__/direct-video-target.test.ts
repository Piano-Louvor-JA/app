import { describe, expect, it } from 'vitest'
import { parseLiturgyWebTarget } from '../services/liturgy-web-runtime'

describe('T4b/R6 — direct-video (MP4 remoto no player dedicado)', () => {
  it('URL http .mp4 → kind direct-video (não site)', () => {
    const t = parseLiturgyWebTarget('https://f000.backblazeb2.com/provai/ep.mp4')
    expect(t?.kind).toBe('direct-video')
    expect(t?.url).toBe('https://f000.backblazeb2.com/provai/ep.mp4')
  })

  it('query string não engana o parser (.mp4?X-Amz-...) ', () => {
    const t = parseLiturgyWebTarget('https://cdn.x.org/ep.mp4?X-Amz-Signature=abc&Expires=1')
    expect(t?.kind).toBe('direct-video')
  })

  it('webm/mov/m4v também são direct-video', () => {
    for (const ext of ['webm', 'mov', 'm4v']) {
      expect(parseLiturgyWebTarget(`https://cdn.x.org/ep.${ext}`)?.kind).toBe('direct-video')
    }
  })

  it('site comum continua kind site', () => {
    expect(parseLiturgyWebTarget('https://exemplo.org/pagina')?.kind).toBe('site')
    expect(parseLiturgyWebTarget('https://exemplo.org/video/')?.kind).toBe('site')
  })

  it('YouTube continua youtube (precedência sobre a extensão)', () => {
    expect(parseLiturgyWebTarget('https://youtube.com/watch?v=abc')?.kind).toBe('youtube')
  })

  it('schema estranho vira fallback site (parser só classifica http/https)', () => {
    // local:// é resolvido pela camada MAIN antes de chegar aqui; o parser
    // apenas não quebra.
    expect(() => parseLiturgyWebTarget('local://app/C:/Videos/a.mp4')).not.toThrow()
  })
})
