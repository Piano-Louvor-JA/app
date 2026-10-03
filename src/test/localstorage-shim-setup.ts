#!/usr/bin/env node
/**
 * Lazy localStorage shim global para testes jsdom sob Node 26 + vitest 4.
 *
 * Node >= 26 define window.localStorage via getter interno que retorna
 * undefined quando --localstorage-file não é passado. O vitest não propaga
 * essa flag pros workers, então TODO teste que toca localStorage quebra com
 * "Cannot read properties of undefined (reading 'clear')".
 *
 * Este setup roda antes de cada arquivo de teste e, se o getter existir e
 * resolver undefined, instala um Map-based shim configurável (defineProperty
 * vence o getter do prototype). Só age quando o valor nativo é inutilizável —
 * em Node < 26 ou com a flag certa, não faz nada.
 *
 * Registrar em vitest.config.ts → test.setupFiles.
 */
const memoryStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(String(k)),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
};

const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let nativeValue;
try { nativeValue = globalThis.localStorage; } catch { nativeValue = undefined; }

if ((nativeValue === undefined || nativeValue === null) || (desc && desc.get)) {
  // getter Node presente mas inutilizável — sobrescrever com shim
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStore(),
    writable: true,
    configurable: true,
  });
}
if (typeof globalThis.window === "object" && globalThis.window) {
  const wd = Object.getOwnPropertyDescriptor(globalThis.window, "localStorage");
  let wv;
  try { wv = globalThis.window.localStorage; } catch { wv = undefined; }
  if (wv === undefined || wv === null) {
    Object.defineProperty(globalThis.window, "localStorage", {
      get: () => globalThis.localStorage,
      configurable: true,
    });
  }
}
