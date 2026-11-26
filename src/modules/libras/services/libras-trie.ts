import synonyms from './gloss-synonyms.json'

const TRIE_URL = 'https://dicionario2.vlibras.gov.br/static/TREES/2018.3.1.json'
const DB_NAME = 'louvorja-libras-trie'
const STORE_NAME = 'trie'
const CACHE_KEY = '2018.3.1'

type Trie = Record<string, unknown>
export type PlaybackGloss = { gloss: string; fingerspelled: string[] }

let memoryTrie: Trie | null = null

export function resetLibrasTrieForTest(): void {
  memoryTrie = null
}

export function setLibrasTrieForTest(trie: Trie | null): void {
  memoryTrie = trie
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCachedTrie(): Promise<Trie | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(CACHE_KEY)
    request.onsuccess = () => resolve((request.result as Trie | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

async function cacheTrie(trie: Trie): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(trie, CACHE_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/** Carrega uma vez, persiste no IndexedDB; chamadas posteriores não usam rede. */
export async function loadLibrasTrie(): Promise<Trie> {
  if (memoryTrie) return memoryTrie
  const cached = await readCachedTrie()
  if (cached) return memoryTrie = cached
  const response = await fetch(TRIE_URL)
  if (!response.ok) throw new Error(`LibrasTrie: HTTP ${response.status}`)
  const trie = await response.json() as Trie
  await cacheTrie(trie)
  return memoryTrie = trie
}

function normalize(token: string): string {
  return token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

function hasToken(trie: Trie, token: string): boolean {
  let node: unknown = trie
  for (const letter of token) {
    if (!node || typeof node !== 'object' || !(letter in node)) return false
    node = (node as Trie)[letter]
  }
  return true
}

/** Resolve cada token antes do playNow; ausentes são soletrados deliberadamente. */
export async function prepareGlossForPlayback(gloss: string): Promise<PlaybackGloss> {
  const trie = await loadLibrasTrie()
  const fingerspelled: string[] = []
  const tokens = gloss.split(/\s+/).filter(Boolean).map((raw) => {
    const token = normalize(raw)
    const replacement = synonyms[raw.toUpperCase() as keyof typeof synonyms] ?? synonyms[token as keyof typeof synonyms] ?? token
    if (hasToken(trie, replacement)) return replacement
    fingerspelled.push(raw)
    return token.split('').join(' ')
  })
  return { gloss: tokens.join(' '), fingerspelled }
}
