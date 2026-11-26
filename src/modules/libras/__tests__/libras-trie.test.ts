import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

beforeEach(async () => {
  fetchMock.mockReset()
  resetLibrasTrieForTest()
  // IDB é global no arquivo (fake-indexeddb): zera para provar offline real por teste
  await new Promise<void>((done) => {
    const req = indexedDB.deleteDatabase('louvorja-libras-trie')
    req.onsuccess = () => done()
    req.onerror = () => done()
    req.onblocked = () => done()
  })
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

  it('token sem sinônimo e sem forma na Trie vira datilologia (sem invenção de acento)', async () => {
    setLibrasTrieForTest(fixtureTrie(['GRAÇA']))

    await expect(prepareGlossForPlayback('GRAXA')).resolves.toEqual({ gloss: 'G R A X A', fingerspelled: ['GRAXA'] })
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

  // ===== REWORK 2 (AC-3): Trie empacotada — offline-first =====

  const PACKAGED_TRIE = resolve(process.cwd(), 'public/libras/trie-2018.3.1.json')

  function readPackagedTrie(): Record<string, unknown> {
    return JSON.parse(readFileSync(PACKAGED_TRIE, 'utf8'))
  }

  /** Walker igual ao do serviço: desce children e exige end=true. */
  function hasTokenRef(root: { children?: Record<string, any> }, token: string): boolean {
    let node: any = root.children?.[token[0]]
    for (const letter of token.slice(1)) {
      if (!node) return false
      node = node.children?.[letter]
    }
    return node?.end === true
  }

  it('AC-3: Trie empacotada existe, tem root.children e ≥22.000 end:true', () => {
    const doc = readPackagedTrie() as { root: any }
    expect(doc.root?.children).toBeTruthy()
    let count = 0
    function walk(node: { children?: Record<string, any>; end?: boolean }): void {
      if (node.end === true) count++
      for (const key of Object.keys(node.children ?? {})) walk(node.children![key])
    }
    walk(doc.root)
    expect(count).toBeGreaterThanOrEqual(22000)
  })

  it('AC-3: todos os destinos do gloss-synonyms.json existem na Trie empacotada (end:true)', () => {
    const synonyms = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/modules/libras/services/gloss-synonyms.json'), 'utf8'),
    ) as Record<string, string>
    expect(Object.keys(synonyms).length).toBeGreaterThanOrEqual(5)
    const doc = readPackagedTrie() as { root: any }
    const root = { children: doc.root.children }
    for (const [key, target] of Object.entries(synonyms)) {
      expect(key, `sinônimo ${key} deve mudar o token (não-idêntico)`).not.toBe(target)
      expect(hasTokenRef(root, target), `destino ${target} do sinônimo ${key} deve existir na Trie`).toBe(true)
    }
  })

  it('AC-3: fetch REJEITADO (gov) + IDB vazio → prepare resolve via asset local (offline-first, gov nunca bloqueia)', async () => {
    // asset local é servido pelo próprio app; só o gov cai
    const packaged = readPackagedTrie()
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('/libras/trie-2018.3.1.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(packaged) })
      }
      return Promise.reject(new Error('network down'))
    })
    await expect(prepareGlossForPlayback('TREVAS')).resolves.toEqual({ gloss: 'TREVAS', fingerspelled: [] })
  })

  it('AC-3: asset local popula o IndexedDB (cache) após carregamento offline', async () => {
    const packaged = readPackagedTrie()
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('/libras/trie-2018.3.1.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(packaged) })
      }
      return Promise.reject(new Error('network down'))
    })
    await loadLibrasTrie()
    // IDB foi populado pelo load do asset: leitura do cache não usa rede
    resetLibrasTrieForTest()
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')))
    await expect(prepareGlossForPlayback('TREVAS')).resolves.toEqual({ gloss: 'TREVAS', fingerspelled: [] })
  })

  it('doc oficial com sinônimo: chave do sinônimo é aplicada quando existe na Trie', async () => {
    setLibrasTrieForTest(fixtureTrie(['BENÇÃO', 'GRAÇA']))
    await expect(prepareGlossForPlayback('BENÇÃO')).resolves.toEqual({ gloss: 'BENÇÃO', fingerspelled: [] })
  })

  // ===== REWORK 2 (AC-2): sinônimos reais, transformação NÃO-idêntica =====

  it('AC-2: GRACA (sem acento) resolve via sinônimo para GRAÇA acentuada — não-idêntico e sem datilologia', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))
    await expect(prepareGlossForPlayback('GRACA')).resolves.toEqual({ gloss: 'GRAÇA', fingerspelled: [] })
  })

  it('AC-2: sinônimos do mapa são transformações não-idênticas cujo destino existe na Trie (BENCAO→BENÇÃO)', async () => {
    setLibrasTrieForTest(fixtureTrie(['BENÇÃO']))
    await expect(prepareGlossForPlayback('BENCAO')).resolves.toEqual({ gloss: 'BENÇÃO', fingerspelled: [] })
  })

  it('AC-2: sinônimo tem prioridade sobre datilologia — réplica "GRACA TREVAS" com Trie real', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))
    await expect(prepareGlossForPlayback('GRACA TREVAS')).resolves.toEqual({ gloss: 'GRAÇA TREVAS', fingerspelled: [] })
  })

  it('AC-2: glosa vazia → null (nenhum payload vazio ao playNow)', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))
    await expect(prepareGlossForPlayback('')).resolves.toBeNull()
  })

  it('AC-2: glosa só com espaços → null', async () => {
    setLibrasTrieForTest(fixtureTrie(WORDS))
    await expect(prepareGlossForPlayback('   ')).resolves.toBeNull()
  })
})
