import { session } from 'electron'

/**
 * Strip Cross-Origin-Resource-Policy / Cross-Origin-Opener-Policy
 * em respostas vindas de túneis trycloudflare (Cloudflare injeta CORP
 * same-origin, bloqueando <img>/<audio> cross-origin no renderer dev).
 * Filtro restrito a *.trycloudflare.com — produção (api.louvorja.com.br) não é afetada.
 */
export function registerTunnelCorpBypass() {
  const filter = {
    urls: [
      '*://*.trycloudflare.com/*',
      // Fluxo OAuth do Firebase/Google (feedback Ezequias: popup "abre e
      // fecha"). accounts.google.com responde COOP: same-origin — com COOP
      // ativa o Chromium isola o par pai/popup e o SDK do Firebase perde o
      // handshake (window.closed bloqueado → "popup-closed-by-user").
      // Sem COOP o postMessage do signInWithPopup volta normal.
      'https://*.firebaseapp.com/*',
      'https://*.google.com/*',
      'https://*.gstatic.com/*',
    ],
  }

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
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
