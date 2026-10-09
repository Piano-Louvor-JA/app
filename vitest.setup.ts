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

function defineStorage(name: 'localStorage' | 'sessionStorage') {
  if (globalThis[name]) return
  const real = win?.[name]
  if (real) {
    // jsdom: getter dinâmico (a referência do window pode ser recriada)
    Object.defineProperty(globalThis, name, {
      get: () => ((globalThis as any).jsdom?.window ?? globalThis.window)?.[name] ?? real,
      configurable: true,
      enumerable: true,
    })
  } else {
    // ambiente sem jsdom: mock in-memory
    Object.defineProperty(globalThis, name, {
      value: makeStorageMock(),
      writable: true,
      configurable: true,
      enumerable: true,
    })
  }
}
defineStorage('localStorage')
defineStorage('sessionStorage')

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
