export type DownloadFailure = {
  ts: string
  url: string
  status: number | null
  bytes: number | null
  erro: string
  tentativa: number
}

const MAX_EVENTS = 20
const MAX_TEXT_LENGTH = 2_048

function text(value: unknown): string {
  try {
    return String(value ?? '')
      .replace(/https?:\/\/[^\s/@]+@([^\s/?#]+)/gi, 'https://$1')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
      .replace(/([?&#](?:token|access_token|api[_-]?key|key|secret|password|authorization|cookie)=)[^&#\s]+/gi, '$1[redacted]')
      .replace(/\b(Bearer\s+)[^\s]+/gi, '$1[redacted]')
      .replace(/\b(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
      .slice(0, MAX_TEXT_LENGTH)
  } catch { return '[unserializable]' }
}

function url(value: unknown): string {
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

export class DownloadFailureBuffer {
  private events: DownloadFailure[] = []

  add(event: Omit<DownloadFailure, 'status' | 'bytes'> & Partial<Pick<DownloadFailure, 'status' | 'bytes'>>): void {
    this.events.push({
      ts: event.ts,
      url: url(event.url),
      status: typeof event.status === 'number' ? event.status : null,
      bytes: typeof event.bytes === 'number' ? event.bytes : null,
      erro: text(event.erro),
      tentativa: event.tentativa,
    })
    if (this.events.length > MAX_EVENTS) this.events.shift()
  }

  snapshot(): DownloadFailure[] {
    return this.events.map((event) => ({ ...event }))
  }

  clear(): void {
    this.events.length = 0
  }
}
