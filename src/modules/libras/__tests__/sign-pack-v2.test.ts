import { describe, it, expect } from 'vitest'
import { parseSignPackV2 } from '../sign-pack-v2'

// sinal com keyframes (avatar 3D) — sem vídeo
const kfPack = {
  manifest: { specVersion: 2, locale: 'lse', version: '1.0.0', license: 'CC-BY-4.0', attribution: 'Comunidade LSE' },
  glossary: {
    DIOS: {
      keyframes: [
        { t: 0, hands: { right: { x: 0, y: 1.2, z: 0.4 }, left: { x: 0, y: 0, z: 0 } }, expression: 'neutral' },
        { t: 0.8, hands: { right: { x: 0, y: 1.2, z: 0.4 }, left: { x: 0, y: 0, z: 0 } }, expression: 'neutral' },
      ],
    },
    AMOR: { keyframes: [] }, // inválido: sinal sem keyframes
  },
}

describe('F-A.2 — parseSignPackV2', () => {
  it('parse pack v2 keyframes (locale lse — qualquer idioma)', () => {
    const pack = parseSignPackV2({ ...kfPack, glossary: { DIOS: kfPack.glossary.DIOS } })
    expect(pack.manifest.locale).toBe('lse')
    const sinal = pack.glossary.get('DIOS')
    expect(sinal?.keyframes?.length).toBe(2)
    expect(sinal?.keyframes?.[0].hands.right.y).toBeCloseTo(1.2)
  })

  it('locale arbitrário aceito (não restringe a lista fixa)', () => {
    const pack = parseSignPackV2({ ...kfPack, glossary: {}, manifest: { ...kfPack.manifest, locale: 'zsl-foo' } })
    expect(pack.manifest.locale).toBe('zsl-foo')
  })

  it('sinal sem keyframes → erro com nome do sinal', () => {
    expect(() => parseSignPackV2(kfPack)).toThrow(/AMOR/)
  })

  it('specVersion 1 → erro (usar parseSignPack v1)', () => {
    expect(() =>
      parseSignPackV2({ manifest: { specVersion: 1, locale: 'lsb', version: '1', license: 'x' }, glossary: {} }),
    ).toThrow(/specVersion/)
  })

  it('datilologia: alfabeto manual opcional no pack', () => {
    const pack = parseSignPackV2({
      manifest: { specVersion: 2, locale: 'lsb', version: '1.0.0', license: 'CC-BY-4.0' },
      glossary: {},
      fingerspelling: { A: [{ t: 0, hands: { right: { x: 0, y: 1, z: 0 }, left: { x: 0, y: 0, z: 0 } }, expression: 'neutral' }] },
    })
    expect(pack.fingerspelling?.get('A')?.length).toBe(1)
  })
})
