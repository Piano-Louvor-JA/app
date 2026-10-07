// populateGlobal do vitest não copia localStorage/sessionStorage para o globalThis
// (não estão na lista KEYS do jsdom env). Com jsdom 27+, a referência do DOM vive em
// globalThis.jsdom.window; este setup roda após o environment setup e injeta
// as propriedades de storage no global.
const dom = (globalThis as any).jsdom
const win: any = dom?.window ?? globalThis.window

if (win?.localStorage && !globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => ((globalThis as any).jsdom?.window ?? globalThis.window).localStorage,
    configurable: true,
    enumerable: true,
  })
}
if (win?.sessionStorage && !globalThis.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    get: () => ((globalThis as any).jsdom?.window ?? globalThis.window).sessionStorage,
    configurable: true,
    enumerable: true,
  })
}