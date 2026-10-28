import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Feedback Ezequias #2 (DM 02/10 13:37): "logar com o google com erro" —
 * o popup OAuth do Firebase caía no shell.openExternal e o handshake
 * quebrava ("The requested action is invalid"). Fix: isAuthPopupUrl
 * reconhece os hosts de auth e abre BrowserWindow filha in-app.
 *
 * A função vive no main.mjs (não exportada) — o teste extrai o fonte e
 * avalia a função isolada, garantindo que o handler reconhece os hosts
 * do fluxo real do signInWithPopup.
 */
function extractMainFunction(name) {
  const source = readFileSync(
    join(process.cwd(), 'electron', 'main.mjs'),
    'utf-8',
  )
  const start = source.indexOf(`function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  // pega do início da função até o fechamento balanceado de chaves
  let depth = 0
  let end = start
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(`return (${source.slice(start, end)})`)
  return fn()
}

function extractIsAuthPopupUrl() {
  return extractMainFunction('isAuthPopupUrl')
}

describe('isAuthPopupUrl — login Google in-app (feedback Ezequias)', () => {
  const isAuthPopupUrl = extractIsAuthPopupUrl()

  it('reconhece o handler do Firebase Auth (a URL exata do print do bug)', () => {
    expect(
      isAuthPopupUrl(
        'https://pianolouvorja.firebaseapp.com/__/auth/handler?apiKey=AIzaSyDAZNH',
      ),
    ).toBe(true)
  })

  it('reconhece os hosts do fluxo OAuth do Google', () => {
    expect(isAuthPopupUrl('https://accounts.google.com/o/oauth2/auth')).toBe(true)
    expect(isAuthPopupUrl('https://accounts.youtube.com/o/oauth2/nobridge')).toBe(true)
    expect(isAuthPopupUrl('https://www.google.com/accounts')).toBe(true)
    expect(isAuthPopupUrl('https://apis.google.com/_/blurframe/frame')).toBe(true)
  })

  it('NÃO captura URLs comuns (continuam indo pro browser externo)', () => {
    expect(isAuthPopupUrl('https://api-stg.pianolouvorja.com.br/v1/health')).toBe(false)
    expect(isAuthPopupUrl('https://evil-google.com.br/phishing')).toBe(false)
    expect(isAuthPopupUrl('https://notgoogle.com')).toBe(false)
    expect(isAuthPopupUrl('not a url at all')).toBe(false)
  })

  it('suffix de domínio não vira prefix: "notgoogle.com" não casa com google.com', () => {
    // host.endsWith('.google.com') exige o ponto — notgoogle.com não passa
    expect(isAuthPopupUrl('https://notgoogle.com/o/oauth2')).toBe(false)
    expect(isAuthPopupUrl('https://google.com.evil.io')).toBe(false)
  })
})

describe('buildAuthPopupWindowOptions — popup OAuth mantém o opener (Electron 45+)', () => {
  const buildAuthPopupWindowOptions = extractMainFunction('buildAuthPopupWindowOptions')

  it('sandbox igual ao da janela principal: signInWithPopup precisa do retorno de window.open', () => {
    const options = buildAuthPopupWindowOptions()
    expect(options.webPreferences.sandbox).toBe(false)
  })

  it('mantém isolamento: contextIsolation ligado, sem nodeIntegration e sem preload', () => {
    const { webPreferences } = buildAuthPopupWindowOptions()
    expect(webPreferences.contextIsolation).toBe(true)
    expect(webPreferences.nodeIntegration).toBe(false)
    expect(webPreferences).not.toHaveProperty('preload')
  })

  it('preserva o tamanho do popup', () => {
    const options = buildAuthPopupWindowOptions()
    expect(options).toMatchObject({ width: 500, height: 640, autoHideMenuBar: true })
  })
})
