/** Route receiver acknowledgements to trusted operator controls in the main process. */
const listeners = new Set()
export function onReceiverEvent(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function publishReceiverEvent(message) {
  for (const listener of listeners) {
    try { listener(message) } catch { /* One closed control must not block other consumers. */ }
  }
}
