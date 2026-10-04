// vitest.setup.ts — roda ANTES de qualquer teste/import
// Só define localStorage/sessionStorage se NÃO existirem (testes que usam
// vi.stubGlobal('localStorage') falham com "Cannot redefine" se definirmos sempre).
const makeStorageMock = () => {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
}

const g = globalThis as Record<string, unknown>
if (typeof g.localStorage === 'undefined') {
  Object.defineProperty(global, 'localStorage', { value: makeStorageMock(), writable: true, configurable: true })
}
if (typeof g.sessionStorage === 'undefined') {
  Object.defineProperty(global, 'sessionStorage', { value: makeStorageMock(), writable: true, configurable: true })
}

// Mock window.louvorja para simular browser (não Electron) — só em ambientes com window (jsdom)
if (typeof globalThis.window !== 'undefined') {
  Object.assign(globalThis.window, {
    louvorja: { isElectron: false, platform: 'linux', version: '0.0.0-test' }
  })
}

// JSDOM não implementa HTMLMediaElement.prototype.load/pause — mock global
if (typeof globalThis.HTMLMediaElement !== 'undefined') {
  if (!HTMLMediaElement.prototype.load) {
    HTMLMediaElement.prototype.load = () => {}
  }
  if (!HTMLMediaElement.prototype.pause) {
    HTMLMediaElement.prototype.pause = () => {}
  }
}
