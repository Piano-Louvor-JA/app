/**
 * Identidade de plataforma do cliente — padrão da org (X-Client-Platform).
 * O app desktop é Electron: desktop-windows / desktop-mac / desktop-linux.
 * Patch do fetch UMA vez no boot do renderer — cobra todos os requests.
 */

function detectDesktopPlatform(): string {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'desktop-windows'
  if (/Mac/i.test(ua)) return 'desktop-mac'
  return 'desktop-linux'
}

export const CLIENT_PLATFORM = detectDesktopPlatform()

const CLIENT_VERSION: string =
  (typeof import.meta !== 'undefined' && (import.meta.env as Record<string, string>).VITE_APP_VERSION) || ''

let patched = false

export function installClientPlatformHeader(): void {
  if (patched || typeof globalThis.fetch !== 'function') return
  patched = true
  const originalFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (!/^https?:\/\//i.test(url)) {
        return originalFetch(input as RequestInfo, init)
      }
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
      if (!headers.has('X-Client-Platform')) headers.set('X-Client-Platform', CLIENT_PLATFORM)
      if (CLIENT_VERSION && !headers.has('X-Client-Version')) headers.set('X-Client-Version', CLIENT_VERSION)
      return originalFetch(input as RequestInfo, { ...init, headers })
    } catch {
      return originalFetch(input as RequestInfo, init)
    }
  }
}
