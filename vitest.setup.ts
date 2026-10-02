/**
 * Storage em memória para testes:
 * - Node >= 26 injeta um global localStorage experimental quebrado (sem
 *   --localstorage-file) que sombreia qualquer ambiente;
 * - o jsdom do vitest 4 não instala Storage no window (área ausente).
 * Um Map compartilhado cobre localStorage/sessionStorage de forma idempotente
 * — os testes que stubam o próprio global continuam funcionando (stub sobrepõe).
 */
type Store = Record<string, string>
const make = (): Storage => {
  const store: Store = {}
  return {
    get length() { return Object.keys(store).length },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    getItem: (k) => (k in store ? store[k]! : null),
    key: (i) => Object.keys(store)[i] ?? null,
    removeItem: (k) => { delete store[k] },
    setItem: (k, v) => { store[k] = String(v) },
  }
}
const g = globalThis as unknown as Record<string, unknown>
if (typeof g.localStorage === 'undefined' || g.localStorage === null) g.localStorage = make()
if (typeof g.sessionStorage === 'undefined' || g.sessionStorage === null) g.sessionStorage = make()

export {}
