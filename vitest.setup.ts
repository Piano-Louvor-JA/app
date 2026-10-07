// vitest.setup.ts — roda após o environment setup.
//
// 1) jsdom 27+: populateGlobal do vitest não copia localStorage/sessionStorage
//    para o globalThis (não estão em KEYS). Injeta getters do jsdom.window —
//    só se ainda não existirem (testes com vi.stubGlobal não são sobrescritos).
// 2) Se NEM jsdom nem global têm storage (ambiente node puro), instala mock.
// 3) window.louvorja: simula browser (não Electron) no jsdom.
// 4) HTMLMediaElement.load/pause: não existem no jsdom — no-op.
const dom = (globalThis as any).jsdom
const win: any = dom?.window ?? globalThis.window

const makeStorageMock = () => {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
}

if (!globalThis.localStorage) {
  const real = win?.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => ((globalThis as any).jsdom?.window ?? globalThis.window)?.localStorage ?? real,
    ...(real ? {} : { value: makeStorageMock(), writable: true }),
    configurable: true,
    enumerable: true,
  })
}
if (!globalThis.sessionStorage) {
  const real = win?.sessionStorage
  Object.defineProperty(globalThis, 'sessionStorage', {
    get: () => ((globalThis as any).jsdom?.window ?? globalThis.window)?.sessionStorage ?? real,
    ...(real ? {} : { value: makeStorageMock(), writable: true }),
    configurable: true,
    enumerable: true,
  })
}

if (typeof globalThis.window !== 'undefined') {
  Object.assign(globalThis.window, {
    louvorja: { isElectron: false, platform: 'linux', version: '0.0.0-test' },
  })
}

if (typeof globalThis.HTMLMediaElement !== 'undefined') {
  if (!HTMLMediaElement.prototype.load) {
    HTMLMediaElement.prototype.load = () => {}
  }
  if (!HTMLMediaElement.prototype.pause) {
    HTMLMediaElement.prototype.pause = () => {}
  }
}
