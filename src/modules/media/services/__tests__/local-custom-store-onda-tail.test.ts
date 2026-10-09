// Cauda B263: deleteLocalLyric — branch `lyrics.length < before` FALSO quando a
// música iterada não tem a lyric (loop continua até achar em outra música).
import { beforeEach, describe, expect, it } from 'vitest'

let store: Record<string, string>

beforeEach(() => {
  store = {}
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
    clear: () => void (store = {}),
  } as Storage
})

import { createLocalCollection, createLocalMusic, deleteLocalLyric, createLocalLyric } from '../local-custom-store'

describe('local-custom-store — deleteLocalLyric loop entre músicas', () => {
  it('lyric na 2ª música: 1ª iteração tem branch falso, acha na 2ª', () => {
    const col = createLocalCollection('Teste')
    const m1 = createLocalMusic(col.id, { name: 'A' })
    const m2 = createLocalMusic(col.id, { name: 'B' })
    const lyric = createLocalLyric(m2.id, 'estrofe')
    expect(lyric).toBeTruthy()
    // id da lyric NÃO está em m1 (branch falso) → acha em m2 (branch verdadeiro)
    expect(deleteLocalLyric(lyric!.id)).toBe(true)
    expect(deleteLocalLyric(99999)).toBe(false)
  })
})
