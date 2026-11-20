/**
 * powerSaveBlocker com contagem de referência — tela do operador NÃO pode
 * apagar durante projeção (culto ~90min). Ref-count porque múltiplas janelas
 * de projeção podem abrir/fechar em sequência e o stop prematuro de uma
 * fecharia o bloqueio da outra (Electron só tem 1 blocker global por tipo).
 */
import { powerSaveBlocker } from 'electron'

let handle = null
let count = 0

/** Bloqueia display-sleep; incrementa ref. Idempotente por chamada. */
export function projectionPowerSaveAcquire() {
  count += 1
  if (handle == null || !powerSaveBlocker.isStarted(handle)) {
    handle = powerSaveBlocker.start('prevent-display-sleep')
  }
  return handle
}

/** Libera 1 ref; stop real só quando a última libera. */
export function projectionPowerSaveRelease() {
  if (count > 0) count -= 1
  if (count === 0 && handle != null && powerSaveBlocker.isStarted(handle)) {
    powerSaveBlocker.stop(handle)
    handle = null
  }
}

/** Estado p/ diagnóstico/testes. */
export function projectionPowerSaveState() {
  return { count, handle, active: handle != null && powerSaveBlocker.isStarted(handle) }
}
