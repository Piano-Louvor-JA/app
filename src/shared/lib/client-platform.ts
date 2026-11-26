/**
 * Identidade de plataforma do cliente — padrão da org (X-Client-Platform).
 * O app desktop é Electron: desktop-windows / desktop-mac / desktop-linux.
 * Patch do fetch UMA vez no boot do renderer — cobre todos os requests.
 *
 * Também injeta X-Partner-Key nas requests à API Piano (STG/prod/local),
 * quando a env do perfil estiver configurada (ver partner-key.ts).
 */

import { PARTNER_KEY_HEADER, partnerKeyForUrl } from './partner-key'

function detectDesktopPlatform(): string {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'desktop-windows'
  if (/Mac/i.test(ua)) return 'desktop-mac'
  return 'desktop-linux'
}

export const CLIENT_PLATFORM = detectDesktopPlatform()

/**
 * Versão do app: package.json via define do Vite (`__APP_VERSION__`, o mesmo
 * "v1.37.2" do topo), sem o "v". Antes lia `VITE_APP_VERSION`, que não existe
 * no projeto — o X-Client-Version nunca era enviado.
 */
export function clientVersion(
  defined: unknown = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
): string {
  return typeof defined === 'string' ? defined.trim() : ''
}

const CLIENT_VERSION = clientVersion()

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
      // Domínios de terceiros (Google/Firebase Auth etc.): header custom torna a request
      // non-simple → preflight OPTIONS → Google responde 403 → auth/network-request-failed.
      // X-Client-* é padrão da org para NOSSA API — nunca injetar em hosts de terceiros.
      if (/(^|\.)googleapis\.com$|(^|\.)firebaseapp\.com$|(^|\.)firebaseio\.com$|(^|\.)google\.com$/i.test(
        new URL(url).hostname,
      )) {
        return originalFetch(input as RequestInfo, init)
      }
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
      if (!headers.has('X-Client-Platform')) headers.set('X-Client-Platform', CLIENT_PLATFORM)
      if (CLIENT_VERSION && !headers.has('X-Client-Version')) headers.set('X-Client-Version', CLIENT_VERSION)
      const partnerKey = partnerKeyForUrl(url)
      if (partnerKey && !headers.has(PARTNER_KEY_HEADER)) headers.set(PARTNER_KEY_HEADER, partnerKey)
      return originalFetch(input as RequestInfo, { ...init, headers })
    } catch {
      return originalFetch(input as RequestInfo, init)
    }
  }
}
