import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { loadLibrasTrie, prepareGlossForPlayback, resetLibrasTrieForTest, setLibrasTrieForTest } from '../services/libras-trie'

beforeEach(() => {
  fetchMock.mockReset()
  resetLibrasTrieForTest()
})

describe('libras-trie', () => {
  it('lookup exato: token presente permanece sinalizado', async () => {
    setLibrasTrieForTest({ T: { R: { E: { V: { A: { S: {} } } } } } })

    await expect(prepareGlossForPlayback('TREVAS')).resolves.toEqual({ gloss: 'TREVAS', fingerspelled: [] })
  })

  it('lookup por sinônimo: GRAÇA usa sinal primário GRACA', async () => {
    setLibrasTrieForTest({ G: { R: { A: { C: { A: {} } } } } })

    await expect(prepareGlossForPlayback('GRAÇA')).resolves.toEqual({ gloss: 'GRACA', fingerspelled: [] })
  })

  it('fallback: token sem sinal vira datilologia marcada', async () => {
    setLibrasTrieForTest({})

    await expect(prepareGlossForPlayback('XYZ')).resolves.toEqual({ gloss: 'X Y Z', fingerspelled: ['XYZ'] })
  })

  it('primeiro boot: busca e mantém trie em memória', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ T: { R: { E: { V: { A: { S: {} } } } } } }) })

    await loadLibrasTrie()
    await loadLibrasTrie()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
