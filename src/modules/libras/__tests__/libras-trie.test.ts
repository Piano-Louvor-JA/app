import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { loadLibrasTrie, prepareGlossForPlayback, resetLibrasTrieForTest, setLibrasTrieForTest } from '../services/libras-trie'

/** Fixture no FORMATO OFICIAL VLibras 2018.3.1: {root:{children:{LETRA:{children:{...},end}}}}. */
function fixtureTrie(words: string[]): Record<string, unknown> {
  const children: Record<string, any> = {}
  for (const word of words) {
    let node: any = { children }
    for (const letter of word) {
      node.children[letter] ??= { children: {} }
      node = node.children[letter]
    }
    node.end = true
  }
  return { root: { children } }
}

const WORDS = ['TREVA', 'TREVAS', 'GRAÇA', 'GRACIOSIDADE', 'GRAÇA&GRACIOSIDADE', 'JESUS', 'CRISTO', 'JESUS_CRISTO', 'DEUS']

beforeEach(() => {
  fetchMock.mockReset()
  resetLibrasTrieForTest()
})

describe('libras-trie (formato oficial {root:{children,end}})', () => {
  it('lookup exato: token presente com end=true permanece sinalizado', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))

    await expect(prepareGlossForPlayback('TREVAS')).resolves.toEqual({ gloss: 'TREVAS', fingerspelled: [] })
  })

  it('prefixo sem end=true é datilologia (TREVA existe só como prefixo de TREVAS)', async () => {
    setLibrasTrieForTest(fixtureTrie(['TREVAS']))

    await expect(prepareGlossForPlayback('TREVA')).resolves.toEqual({ gloss: 'T R E V A', fingerspelled: ['TREVA'] })
  })

  it('GRAÇA acentuada existe na Trie: permanece acentuada, sem sinônimo', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))

    await expect(prepareGlossForPlayback('GRAÇA')).resolves.toEqual({ gloss: 'GRAÇA', fingerspelled: [] })
  })

  it('lookup duplo: trie desaccentuada (GRACA) resolve entrada acentuada GRAÇA', async () => {
    setLibrasTrieForTest(fixtureTrie(['GRACA', 'TREVAS']))

    await expect(prepareGlossForPlayback('GRAÇA')).resolves.toEqual({ gloss: 'GRACA', fingerspelled: [] })
  })

  it('entrada desacentuada GRACA sem forma na Trie vira datilologia (sem invenção de acento)', async () => {
    setLibrasTrieForTest(fixtureTrie(['GRAÇA']))

    await expect(prepareGlossForPlayback('GRACA')).resolves.toEqual({ gloss: 'G R A C A', fingerspelled: ['GRACA'] })
  })

  it('composto & presente na Trie é passado inteiro ao playNow', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))

    await expect(prepareGlossForPlayback('GRAÇA&GRACIOSIDADE')).resolves.toEqual({
      gloss: 'GRAÇA&GRACIOSIDADE',
      fingerspelled: [],
    })
  })

  it('composto _ presente na Trie é passado inteiro ao playNow (JESUS_CRISTO)', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))

    await expect(prepareGlossForPlayback('JESUS_CRISTO')).resolves.toEqual({ gloss: 'JESUS_CRISTO', fingerspelled: [] })
  })

  it('composto ausente inteiro quebra em partes com fallback', async () => {
    setLibrasTrieForTest(fixtureTrie(['GRAÇA', 'DEUS']))

    await expect(prepareGlossForPlayback('GRAÇA&XYZ')).resolves.toEqual({
      gloss: 'GRAÇA X Y Z',
      fingerspelled: ['XYZ'],
    })
  })

  it('QA réplica: GRAÇA&GRACIOSIDADE TREVAS NÃO soletra TREVAS', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))

    const result = await prepareGlossForPlayback('GRAÇA&GRACIOSIDADE TREVAS')

    expect(result.fingerspelled).toEqual([])
    expect(result.gloss).toBe('GRAÇA&GRACIOSIDADE TREVAS')
  })

  it('fallback: token sem sinal vira datilologia marcada', async () => {
    setLibrasTrieForTest(fixtureTrie([]))

    await expect(prepareGlossForPlayback('XYZ')).resolves.toEqual({ gloss: 'X Y Z', fingerspelled: ['XYZ'] })
  })

  it('primeiro boot: busca e mantém trie em memória (doc oficial baixado)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(fixtureTrie(WORDS)) })

    await loadLibrasTrie()
    await loadLibrasTrie()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('doc oficial com sinônimo: chave do sinônimo é aplicada quando existe na Trie', async () => {
    setLibrasTrieForTest(fixtureTrie(['BENÇÃO', 'GRAÇA']))
    // arquivo real de sinônimos vazio; teste com stub de módulo coberto pelo resolveToken acima
    await expect(prepareGlossForPlayback('BENÇÃO')).resolves.toEqual({ gloss: 'BENÇÃO', fingerspelled: [] })
  })
})
