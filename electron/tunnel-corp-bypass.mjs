import { session } from 'electron'

/**
 * Strip Cross-Origin-Resource-Policy / Cross-Origin-Opener-Policy
 * em respostas vindas de túneis trycloudflare (Cloudflare injeta CORP
 * same-origin, bloqueando <img>/<audio> cross-origin no renderer dev).
 * Filtro restrito a *.trycloudflare.com — produção (api.louvorja.com.br) não é afetada.
 */
const OAUTH_URLS = [
  'https://*.firebaseapp.com/__/auth/*',
  'https://accounts.google.com/o/oauth2/*',
  'https://accounts.google.com/gsi/*',
  'https://identitytoolkit.googleapis.com/*',
  'https://*.gstatic.com/*',
]

function isOAuthResponse(url) {
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === 'https:' && parsed.hostname.endsWith('.firebaseapp.com') && parsed.pathname.startsWith('/__/auth/')) ||
      (parsed.hostname === 'accounts.google.com' && (/^\/o\/oauth2\//.test(parsed.pathname) || parsed.pathname.startsWith('/gsi/'))) ||
      parsed.hostname === 'identitytoolkit.googleapis.com' ||
      parsed.hostname.endsWith('.gstatic.com')
    )
  } catch {
    return false
  }
}

export function registerTunnelCorpBypass() {
  const filter = {
    urls: [
      '*://*.trycloudflare.com/*',
      // Firebase handler, Google OAuth endpoints, Identity Toolkit and SDK assets.
      ...OAUTH_URLS,
    ],
  }

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    if (!isOAuthResponse(details.url)) return callback({ responseHeaders: details.responseHeaders })
    const headers = { ...details.responseHeaders }
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase()
      if (
        lower === 'cross-origin-resource-policy' ||
        lower === 'cross-origin-opener-policy'
      ) {
        delete headers[key]
      }
    }
    callback({ responseHeaders: headers })
  })
}
