const MAX_EVENTS = 50
const MAX_TEXT_LENGTH = 2_048
const KINDS = new Set(['console.error', 'onerror', 'unhandledrejection'])

function text(value, maxLength = MAX_TEXT_LENGTH) {
  try {
    return String(value ?? '')
      .replace(/https?:\/\/[^\s/@]+@([^\s/?#]+)/gi, 'https://$1')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
      .replace(/([?&#](?:token|access_token|api[_-]?key|key|secret|password|authorization|cookie)=)[^&#\s]+/gi, '$1[redacted]')
      .replace(/\b(Bearer\s+)[^\s]+/gi, '$1[redacted]')
      .replace(/\b(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
      .replace(/[A-Za-z0-9+/_-]{41,}/g, '[redacted-blob]')
      .slice(0, maxLength)
  } catch { return '[unserializable]' }
}

function url(value) {
  try {
    const parsed = new URL(String(value ?? ''))
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch { return null }
}

export function sanitizeRendererErrors(value) {
  if (!Array.isArray(value) || value.length > MAX_EVENTS) return []
  return value.flatMap((event) => {
    if (!event || typeof event !== 'object' || !KINDS.has(event.kind) || typeof event.ts !== 'string' || typeof event.message !== 'string') return []
    return [{
      ts: event.ts,
      kind: event.kind,
      message: text(event.message),
      stack: typeof event.stack === 'string' ? text(event.stack) : null,
      url: url(event.url),
    }]
  })
}
