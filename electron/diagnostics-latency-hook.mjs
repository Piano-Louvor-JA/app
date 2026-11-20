// diag-v4-umbrella: ponte opcional diagnostics-core → agregador de latência.
// core não pode importar diagnostics.mjs direto (diagnostics.mjs importa core = ciclo).
// hook é setado pelo diagnostics.mjs no boot; sem hook, é no-op.
let observer = null

export function setLatencyObserver(fn) {
  observer = typeof fn === 'function' ? fn : null
}

export function onLatencyObserved(host, ms) {
  try { observer?.(host, ms) } catch { /* best-effort */ }
}

// diag-v4b: header Date da resposta → offset do relógio local vs servidor
let serverDateObserver = null

export function setServerDateObserver(fn) {
  serverDateObserver = typeof fn === 'function' ? fn : null
}

export function onServerDate(serverDateMs) {
  try { serverDateObserver?.(serverDateMs) } catch { /* best-effort */ }
}
