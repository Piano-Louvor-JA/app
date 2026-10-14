export type RendererErrorKind = 'console.error' | 'onerror' | 'unhandledrejection'

export type RendererError = {
  ts: string
  kind: RendererErrorKind
  message: string
  stack: string | null
  url: string | null
}

const MAX_EVENTS = 50
const MAX_STACK_LENGTH = 2_048
const MAX_MESSAGE_LENGTH = 2_048

function stringify(value: unknown): string {
  try {
    return String(value ?? '')
  } catch {
    return '[unserializable]'
  }
}

export function sanitizeRendererText(value: unknown, maxLength = MAX_MESSAGE_LENGTH): string {
  return stringify(value)
    .replace(/([?&#](?:token|access_token|api[_-]?key|key|secret|password|authorization|cookie)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/\b(Bearer\s+)[^\s]+/gi, '$1[redacted]')
    .replace(/\b(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .slice(0, maxLength)
}

export function sanitizeRendererUrl(value: unknown): string | null {
  const raw = stringify(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export class RendererErrorBuffer {
  private events: RendererError[] = []

  add(event: Omit<RendererError, 'ts'> & { ts?: string }): void {
    this.events.push({
      ts: event.ts ?? new Date().toISOString(),
      kind: event.kind,
      message: sanitizeRendererText(event.message),
      stack: event.stack ? sanitizeRendererText(event.stack, MAX_STACK_LENGTH) : null,
      url: sanitizeRendererUrl(event.url),
    })
    if (this.events.length > MAX_EVENTS) this.events.shift()
  }

  snapshot(): RendererError[] {
    return this.events.map((event) => ({ ...event }))
  }
}

export function isRendererErrorSnapshot(value: unknown): value is RendererError[] {
  return Array.isArray(value) && value.length <= MAX_EVENTS && value.every((event) => (
    event && typeof event === 'object'
    && typeof event.ts === 'string'
    && ['console.error', 'onerror', 'unhandledrejection'].includes(event.kind)
    && typeof event.message === 'string'
    && (typeof event.stack === 'string' || event.stack === null)
    && (typeof event.url === 'string' || event.url === null)
  ))
}

export function sanitizeRendererErrorSnapshot(value: unknown): RendererError[] {
  if (!isRendererErrorSnapshot(value)) return []
  return value.map((event) => ({
    ts: event.ts,
    kind: event.kind,
    message: sanitizeRendererText(event.message),
    stack: event.stack ? sanitizeRendererText(event.stack, MAX_STACK_LENGTH) : null,
    url: sanitizeRendererUrl(event.url),
  }))
}
