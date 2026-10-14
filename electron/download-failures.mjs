const MAX_EVENTS = 20
const MAX_TEXT_LENGTH = 2_048

function text(value) {
  try {
    return String(value ?? '')
      .replace(/([?&#](?:token|access_token|api[_-]?key|key|secret|password|authorization|cookie)=)[^&#\s]+/gi, '$1[redacted]')
      .replace(/\b(Bearer\s+)[^\s]+/gi, '$1[redacted]')
      .replace(/\b(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
      .slice(0, MAX_TEXT_LENGTH)
  } catch { return '[unserializable]' }
}

function url(value) {
  const raw = String(value ?? '')
  try {
    const parsed = new URL(raw)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return raw.replace(/\/\/[^/@\s]+@/, '//').replace(/[?#].*$/, '')
  }
}

export function sanitizeDownloadFailures(value) {
  if (!Array.isArray(value) || value.length > MAX_EVENTS) return []
  return value.flatMap((event) => {
    if (!event || typeof event !== 'object' || typeof event.ts !== 'string' || typeof event.url !== 'string' || typeof event.erro !== 'string' || !Number.isInteger(event.tentativa) || event.tentativa < 1) return []
    return [{
      ts: event.ts,
      url: url(event.url),
      status: typeof event.status === 'number' ? event.status : null,
      bytes: typeof event.bytes === 'number' ? event.bytes : null,
      erro: text(event.erro),
      tentativa: event.tentativa,
    }]
  })
}
