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
