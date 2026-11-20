// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BIBLE_RUNTIME_CHANNEL,
  BIBLE_RUNTIME_STORAGE_KEY,
  DEFAULT_BIBLE_RUNTIME,
  normalizeBibleRuntime,
  publishBibleRuntime,
  publishBibleRuntimeOff,
  publishBibleSelection,
  readBibleRuntimeFromStorage,
  selectionToRuntime,
  writeBibleRuntimeToStorage,
} from '../services/bible-runtime'
import { emptySelection } from '../services/scripture-format'

function lastChannelMessage(): unknown {
  const channel = new BroadcastChannel(BIBLE_RUNTIME_CHANNEL)
  return new Promise((resolve) => {
    channel.onmessage = (event) => {
      channel.close()
      resolve(event.data)
    }
  })
}

beforeEach(() => {
  localStorage.clear()
})

describe('selectionToRuntime', () => {
  it('seleção com texto e versículos fica ativa e projetando', () => {
    const runtime = selectionToRuntime({
      ...emptySelection(),
      text: 'No princípio',
      scripturalReference: 'Gênesis 1:1',
      verses: [1],
    })
    expect(runtime).toEqual({
      active: true,
      text: 'No princípio',
      reference: 'Gênesis 1:1',
      projecting: true,
    })
  })

  it('texto em branco não ativa mesmo com versículos', () => {
    const runtime = selectionToRuntime({ ...emptySelection(), text: '   ', verses: [1] })
    expect(runtime.active).toBe(false)
    expect(runtime.projecting).toBe(true)
  })

  it('sem versículos não ativa', () => {
    const runtime = selectionToRuntime({ ...emptySelection(), text: 'algo' })
    expect(runtime.active).toBe(false)
  })
})

describe('normalizeBibleRuntime', () => {
  it('entrada inválida cai no default', () => {
    expect(normalizeBibleRuntime(null)).toEqual(DEFAULT_BIBLE_RUNTIME)
    expect(normalizeBibleRuntime('texto')).toEqual(DEFAULT_BIBLE_RUNTIME)
    expect(normalizeBibleRuntime(42)).toEqual(DEFAULT_BIBLE_RUNTIME)
  })

  it('campos não-string viram fallback vazio', () => {
    const runtime = normalizeBibleRuntime({ text: 5, reference: true })
    expect(runtime.text).toBe('')
    expect(runtime.reference).toBe('')
    expect(runtime.active).toBe(false)
    expect(runtime.projecting).toBe(false)
  })

  it('active exige texto não vazio', () => {
    expect(normalizeBibleRuntime({ active: true, text: '' }).active).toBe(false)
    expect(normalizeBibleRuntime({ active: true, text: 'x' }).active).toBe(true)
  })

  it('projecting sem a chave é falso (legado = não projetando)', () => {
    expect(normalizeBibleRuntime({ active: true, text: 'x' }).projecting).toBe(false)
    expect(normalizeBibleRuntime({ projecting: true, text: 'x' }).projecting).toBe(true)
  })
})

describe('storage roundtrip', () => {
  it('sem storage retorna default', () => {
    expect(readBibleRuntimeFromStorage()).toEqual(DEFAULT_BIBLE_RUNTIME)
  })

  it('escreve e lê de volta', () => {
    writeBibleRuntimeToStorage({ active: true, text: 'abc', reference: 'r', projecting: true })
    expect(readBibleRuntimeFromStorage()).toEqual({
      active: true,
      text: 'abc',
      reference: 'r',
      projecting: true,
    })
  })

  it('JSON quebrado no storage cai no default', () => {
    localStorage.setItem(BIBLE_RUNTIME_STORAGE_KEY, '{quebrado')
    expect(readBibleRuntimeFromStorage()).toEqual(DEFAULT_BIBLE_RUNTIME)
  })

  it('falha de escrita é engolida', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() =>
      writeBibleRuntimeToStorage({ ...DEFAULT_BIBLE_RUNTIME }),
    ).not.toThrow()
    spy.mockRestore()
  })

  it('getItem lançando cai no default', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(readBibleRuntimeFromStorage()).toEqual(DEFAULT_BIBLE_RUNTIME)
    spy.mockRestore()
  })
})

describe('publishBibleRuntime', () => {
  it('publica no BroadcastChannel e grava storage', async () => {
    const promise = lastChannelMessage()
    const state = { active: true, text: 't', reference: 'r', projecting: true }
    publishBibleRuntime(state)
    await expect(promise).resolves.toEqual(state)
    expect(readBibleRuntimeFromStorage()).toEqual(state)
  })

  it('BroadcastChannel indisponível não quebra (storage é gravado)', () => {
    const original = globalThis.BroadcastChannel
    // @ts-expect-error simula ambiente sem BroadcastChannel
    delete globalThis.BroadcastChannel
    const state = { active: false, text: '', reference: '', projecting: false }
    expect(() => publishBibleRuntime(state)).not.toThrow()
    expect(readBibleRuntimeFromStorage()).toEqual(state)
    globalThis.BroadcastChannel = original
  })
})

describe('publishBibleSelection', () => {
  it('seleção cheia publica runtime ativo', async () => {
    const promise = lastChannelMessage()
    publishBibleSelection({
      ...emptySelection(),
      text: 'texto',
      scripturalReference: 'Gênesis 1:1',
      verses: [1],
    })
    await expect(promise).resolves.toMatchObject({
      active: true,
      projecting: true,
      reference: 'Gênesis 1:1',
    })
  })

  it('seleção vazia (default) publica runtime desligado', async () => {
    const promise = lastChannelMessage()
    publishBibleSelection()
    await expect(promise).resolves.toEqual({
      active: false,
      text: '',
      reference: '',
      projecting: true,
    })
  })
})

describe('publishBibleRuntimeOff', () => {
  it('publica runtime desligado (projecting=false)', async () => {
    const promise = lastChannelMessage()
    publishBibleRuntimeOff()
    await expect(promise).resolves.toEqual({
      active: false,
      text: '',
      reference: '',
      projecting: false,
    })
    expect(readBibleRuntimeFromStorage()).toEqual({
      active: false,
      text: '',
      reference: '',
      projecting: false,
    })
  })
})
