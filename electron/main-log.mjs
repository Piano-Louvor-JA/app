import { closeSync, fstatSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs'
import path from 'node:path'

export const MAX_MAIN_LOG_BYTES = 1024 * 1024

export function sanitizeMainLog(value) {
  try {
    let text = String(value ?? '')
    text = text
      .replace(/\b(Api-Token\s+(?![:=])|Api-Token\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
      .replace(/\b(Bearer\s+)[^\s,;]+/gi, '$1[redacted]')
      .replace(/\b(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
      .replace(/\b(dsn\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
      .replace(/([?&#](?:token|access_token|api[_-]?key|key|secret|password|authorization|cookie)=)[^&#\s]+/gi, '$1[redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
      .replace(/[A-Za-z0-9+/_-]{41,}/g, '[redacted-blob]')
    return text.replace(/\bhttps?:\/\/([^\s/@]+(?::[^\s/@]*)?@)?([^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, 'https://$2')
  } catch {
    return '[unserializable]'
  }
}

export function createMainLogger(getUserData) {
  let writing = false
  const pending = []

  function writeNow(level, message) {
    let fd
    try {
      const logs = path.join(getUserData(), 'logs')
      const current = path.join(logs, 'main.log')
      const previous = `${current}.1`
      const line = `${new Date().toISOString()} ${level} ${sanitizeMainLog(message)}\n`
      mkdirSync(logs, { recursive: true })
      // Tamanho lido no descritor aberto, sem exists/stat no caminho (TOCTOU).
      fd = openSync(current, 'a')
      if (fstatSync(fd).size + Buffer.byteLength(line) > MAX_MAIN_LOG_BYTES) {
        closeSync(fd)
        fd = undefined
        rmSync(previous, { force: true })
        renameSync(current, previous)
        fd = openSync(current, 'a')
      }
      writeSync(fd, line)
    } catch { /* diagnostics logging nunca derruba o main */ }
    finally {
      if (fd !== undefined) {
        try { closeSync(fd) } catch { /* fd já fechado na rotação */ }
      }
    }
  }

  function write(level, message) {
    pending.push([level, message])
    if (writing) return
    writing = true
    try {
      while (pending.length) writeNow(...pending.shift())
    } finally {
      writing = false
    }
  }

  return {
    debug: (message) => write('DEBUG', message),
    info: (message) => write('INFO', message),
    warn: (message) => write('WARN', message),
    error: (message) => write('ERROR', message),
  }
}
