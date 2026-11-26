import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signPackStore, LIBRAS_PACK_KEY } from '../sign-pack-store'
import { parseSignPack } from '../sign-pack'

vi.mock('@shared/services/user-preferences', () => {
  const store: Record<string, unknown> = {}
  return {
    getUserPreference: <T>(key: string, fallback: T | null = null): T | null =>
      key in store ? (store[key] as T) : fallback,
    setUserPreference: (key: string, value: unknown) => {
      store[key] = value
    },
  }
})

const rawPack = {
  locale: 'lsb',
  version: '1.0.0',
  license: 'CC-BY-4.0',
  attribution: 'Comunidade PIANO',
  glossary: {
    DEUS: { signs: ['DEUS'], fingerspelling: false, video: { url: 'deus.webm', size: 1000 } },
    AMOR: { signs: ['AMOR'], fingerspelling: false, video: { url: 'amor.webm', size: 1000 } },
  },
}

describe('F1.2 — signPackStore', () => {
  beforeEach(() => {
    signPackStore.clear()
    localStorage.clear()
  })

  it('import: pack parseado e ativo', () => {
    const pack = signPackStore.import(rawPack)
    expect(pack.locale).toBe('lsb')
    expect(signPackStore.getActive()).toBe(pack)
    expect(signPackStore.size()).toBe(1)
  })

  it('persistência: pack ativo sobrevive a reload (localStorage)', () => {
    const pack = signPackStore.import(rawPack)
    signPackStore.persistActive()
    const saved = JSON.parse(localStorage.getItem(LIBRAS_PACK_KEY) ?? 'null')
    expect(saved.locale).toBe('lsb')
    expect(signPackStore.restoreActive()).toEqual(parseSignPack(rawPack))
    void pack
  })

  it('troca de pack: dois locales, ativo muda', () => {
    signPackStore.import(rawPack)
    signPackStore.import({ ...rawPack, locale: 'asl' })
    expect(signPackStore.getActive()?.locale).toBe('asl')
    expect(signPackStore.size()).toBe(2)
  })

  it('resolve: sinal existente → vídeo; termo ausente → fingerspelling', () => {
    signPackStore.import(rawPack)
    expect(signPackStore.resolve('DEUS')?.video?.url).toBe('deus.webm')
    expect(signPackStore.resolve('CASA')?.fingerspelling).toBe(true)
  })

  it('sem pack ativo → resolve retorna null', () => {
    expect(signPackStore.resolve('DEUS')).toBeNull()
  })
})
