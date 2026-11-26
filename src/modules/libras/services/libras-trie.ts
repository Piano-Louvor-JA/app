import synonyms from './gloss-synonyms.json'

const TRIE_URL = 'https://dicionario2.vlibras.gov.br/static/TREES/2018.3.1.json'
/** Trie oficial empacotada no app (cópia exata, SHA 24a4f5c7…) — offline-first (SPEC AC-3). */
const PACKAGED_TRIE_URL = '/libras/trie-2018.3.1.json'
const DB_NAME = 'louvorja-libras-trie'
const STORE_NAME = 'trie'
const CACHE_KEY = '2018.3.1'

/** Nó do formato oficial VLibras 2018.3.1: { children, end }. */
type TrieNode = { children?: Record<string, TrieNode>; end?: boolean }
/** Documento raiz oficial: { root: { children: {...} } }. */
type TrieDoc = { root?: { children?: Record<string, TrieNode> } }
export type PlaybackGloss = { gloss: string; fingerspelled: string[] }

let memoryTrie: TrieNode | null = null

export function resetLibrasTrieForTest(): void {
  memoryTrie = null
}

/** Injeta a raiz pronta para lookup (teste). Aceita doc oficial {root:{children}} ou children diretos. */
export function setLibrasTrieForTest(trie: TrieDoc | Record<string, TrieNode> | null): void {
  if (!trie) {
    memoryTrie = null
    return
  }
  const children = (trie as TrieDoc).root?.children ?? (trie as Record<string, TrieNode>)
  memoryTrie = { children }
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

async function withDb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  if (!db) return null
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

async function readCachedTrie(): Promise<TrieDoc | null> {
  return await withDb<TrieDoc>('readonly', (store) => store.get(CACHE_KEY) as IDBRequest<TrieDoc>)
}

async function cacheTrie(doc: TrieDoc): Promise<void> {
  await withDb('readwrite', (store) => store.put(doc, CACHE_KEY) as IDBRequest<unknown>)
}

/** Valida doc oficial e devolve a raiz de children. */
function extractRoot(doc: unknown): TrieNode {
  const children = (doc as TrieDoc)?.root?.children
  if (!children) throw new Error('LibrasTrie: formato inesperado (sem root.children)')
  return { children }
}

/**
 * Offline-first (SPEC AC-3): memória → IndexedDB → asset local empacotado.
 * A API gov é apenas atualização de oportunidade em background — NUNCA bloqueia o prepare.
 */
async function refreshTrieFromGov(): Promise<void> {
  const response = await fetch(TRIE_URL)
  if (!response.ok) throw new Error(`LibrasTrie: HTTP ${response.status}`)
  const doc = await response.json()
  extractRoot(doc) // valida antes de cachear
  await cacheTrie(doc as TrieDoc)
}

/**
 * Offline-first (SPEC AC-3): memória → IndexedDB → asset local empacotado.
 * A API gov é apenas atualização de oportunidade em background (fire-and-forget) —
 * NUNCA bloqueia o prepare e NUNCA o rejeita. Se tudo local falhar, retorna Trie
 * vazia (todos os tokens resolvem para datilologia — fallback oficial F1.3) e
 * dispara o refresh gov para popular o IDB do PRÓXIMO prepare.
 */
export async function loadLibrasTrie(): Promise<TrieNode> {
  // Trie vazia em memória = último load falhou; permite retry (asset/rede/IDB podem voltar).
  if (memoryTrie && Object.keys(memoryTrie.children ?? {}).length > 0) return memoryTrie
  const cached = await readCachedTrie()
  if (cached?.root?.children) {
    memoryTrie = { children: cached.root.children }
    return memoryTrie
  }
  // Asset local empacotado: cópia exata da Trie oficial no build (nunca depende de rede).
  // Race com timeout: asset pendente (servidor travado) não pode hang o prepare (AC-3).
  try {
    const ASSET_TIMEOUT_MS = 3_000
    const response = (await Promise.race([
      fetch(PACKAGED_TRIE_URL),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LibrasTrie asset: timeout')), ASSET_TIMEOUT_MS)),
    ])) as Response
    if (!response.ok) throw new Error(`LibrasTrie asset: HTTP ${response.status}`)
    const doc = await response.json()
    const root = extractRoot(doc)
    void cacheTrie(doc as TrieDoc).catch(() => {})
    memoryTrie = root
    return memoryTrie
  } catch {
    // Gov FORA do caminho do prepare (SPEC AC-3): fire-and-forget, popula IDB para o
    // próximo prepare; falha/rejeição da gov nunca derruba nem trava este prepare.
    void refreshTrieFromGov().catch(() => {})
    // Trie vazia = todos os tokens resolvem para datilologia (fallback F1.3)
    memoryTrie = { children: {} }
    return memoryTrie
  }
}

/** Uppercase preservando acentos (a Trie oficial guarda GRAÇA, CANÇÃO... acentuadas). */
function upper(token: string): string {
  return token.toUpperCase()
}

/** Desacentua (fallback: alguns glossos chegam sem acento). */
function deaccent(token: string): string {
  return token.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Walker do formato oficial: desce children e exige end=true no nó final. */
function hasToken(root: TrieNode, token: string): boolean {
  let node: TrieNode | undefined = root.children?.[token[0]]
  for (const letter of token.slice(1)) {
    if (!node) return false
    node = node.children?.[letter]
  }
  return node?.end === true
}

/** Resolve um token cru: sinônimos → composto na Trie → desacentuado → datilologia. */
function resolveToken(raw: string, root: TrieNode, fingerspelled: string[]): string {
  const upperRaw = upper(raw)
  const deaccented = upper(deaccent(raw))

  // 1) sinônimo explícito (mantém acentuação da chave)
  const replacement = synonyms[upperRaw as keyof typeof synonyms] as string | undefined
  if (replacement && hasToken(root, replacement)) return replacement

  // 2) token acentuado, como emitido pela API e guardado na Trie (GRAÇA, CANÇÃO, compostos &_)
  if (hasToken(root, upperRaw)) return upperRaw

  // 3) variante desacentuada (GRAÇA vs GRACA, conforme a entrada)
  if (deaccented !== upperRaw && hasToken(root, deaccented)) return deaccented

  // 4) composto com & / _ não presente inteiro: quebra em partes com fallback
  if (/[&_]/.test(raw)) {
    const parts = raw.split(/[&_]/).filter(Boolean)
    if (parts.length > 1) {
      return parts.map((part) => resolveToken(part, root, fingerspelled)).join(' ')
    }
  }

  // 5) sem sinal: datilologia (letras do token acentuado, sem espaços internos)
  fingerspelled.push(raw)
  return upperRaw.split('').join(' ')
}

/** Resolve cada token antes do playNow; ausentes são soletrados deliberadamente. Glosa vazia → null. */
export async function prepareGlossForPlayback(gloss: string): Promise<PlaybackGloss | null> {
  if (!gloss.trim()) return null
  const root = await loadLibrasTrie()
  const fingerspelled: string[] = []
  const tokens = gloss.split(/\s+/).filter(Boolean).map((raw) => resolveToken(raw, root, fingerspelled))
  return { gloss: tokens.join(' '), fingerspelled }
}
