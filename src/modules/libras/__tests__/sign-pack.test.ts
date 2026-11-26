import { describe, it, expect } from 'vitest'
import { parseSignPack, validateSignPack } from '../sign-pack'

describe('F1.1 — parse .spack', () => {
  it('parse válido: manifest completo com glossary e 2 sinais', () => {
    const pack = parseSignPack(validPack)
    expect(pack.locale).toBe('lsb')
    expect(pack.version).toBe('1.0.0')
    expect(pack.license).toBe('CC-BY-4.0')
    expect(pack.attribution).toBe('Comunidade PIANO')
    expect(pack.glossary.size).toBe(2)
    expect(pack.glossary.get('DEUS')).toEqual({ signs: ['DEUS'], fingerspelling: false, video: { url: 'deus.webm', size: 120_000 } })
  })

  it('parse inválido: manifest sem locale → erro com campo', () => {
    expect(() => parseSignPack({ ...validPack, locale: '' })).toThrow(/locale/)
  })

  it('parse inválido: sem glossary → erro', () => {
    expect(() => parseSignPack({ ...validPack, glossary: {} })).toThrow(/glossary/i)
  })
})

describe('F1.1 — validação de Sign Pack', () => {
  it('válida: sinal com vídeo <5MB e url', () => {
    expect(validateSignPack(validPack)).toEqual([])
  })

  it('inválida: vídeo 6MB → erro de tamanho', () => {
    const bad = clone(validPack)
    bad.glossary.AMOR.video.size = 6 * 1024 * 1024
    const errors = validateSignPack(bad)
    expect(errors.some((e) => /5MB|tamanho/i.test(e))).toBe(true)
  })

  it('inválida: sinal sem url nem fingerspelling → erro', () => {
    const bad = clone(validPack)
    delete (bad.glossary.AMOR as { video?: unknown }).video
    const errors = validateSignPack(bad)
    expect(errors.length).toBeGreaterThan(0)
  })
})

// helpers
// Simula um pack válido com dados mínimos necessários para parsear sem depender de mocks externos.
const validPack = {
  locale: 'lsb',
  version: '1.0.0',
  license: 'CC-BY-4.0',
  attribution: 'Comunidade PIANO',
  grammar: { wordOrder: 'SOV' },
  glossary: {
    DEUS: { signs: ['DEUS'], fingerspelling: false, video: { url: 'deus.webm', size: 120_000 } },
    AMOR: { signs: ['AMOR'], fingerspelling: false, video: { url: 'amor.webm', size: 90_000 } },
  },
} as unknown as Parameters<typeof parseSignPack>[0]

const clone = (o: unknown) => JSON.parse(JSON.stringify(o)) as typeof validPack
