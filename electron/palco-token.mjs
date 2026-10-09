/**
 * Token de acesso do palco-server (OBS S1, kanban t_0502702e).
 *
 * Por quê: o palco-server expõe HTTP+WS em 0.0.0.0 (toda a LAN) SEM auth —
 * qualquer vizinho conecta e ouve a projeção/áudio. Antes de virar Browser
 * Source do OBS, precisa de porta com token (mesmo modelo do httpServer do
 * projeto original: 5 chars A-Z0-9, compat Delphi).
 *
 * Funções PURAS (sem import do electron) pra testar sem mock pesado.
 */

import { randomInt } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const TOKEN_LENGTH = 5

/** Gera token 5 chars A-Z0-9 (mesma faixa do geraToken do Delphi). */
export function generatePalcoToken() {
  let out = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_CHARS[randomInt(TOKEN_CHARS.length)]
  }
  return out
}

/** Formato válido = exatamente 5 chars A-Z0-9. */
export function isValidPalcoTokenFormat(token) {
  return typeof token === 'string' && /^[A-Z0-9]{5}$/.test(token)
}

/**
 * Carrega o token do arquivo de config ou cria (e persiste) um novo.
 * `configPath` vem do caller (electron app.getPath — injetável p/ testes).
 */
export function loadOrCreatePalcoToken(configPath) {
  try {
    const saved = readFileSync(configPath, 'utf8').trim()
    if (isValidPalcoTokenFormat(saved)) return saved
  } catch {
    // arquivo não existe ainda — cria abaixo
  }
  const token = generatePalcoToken()
  try {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, token, 'utf8')
  } catch {
    // sem escrita — token efêmero da sessão (comportamento do original)
  }
  return token
}

/**
 * Regra de acesso a um request do palco-server:
 * - feature desligada (expectedToken null) → libera (compat com receivers atuais)
 * - localhost (127.0.0.1/::1) → bypass (o próprio app/renderer)
 * - senão: query ?token= OU header x-palco-token válido
 */
export function requestHasPalcoAccess(opts) {
  const { remoteAddress, url, headers, expectedToken } = opts
  if (!isValidPalcoTokenFormat(expectedToken)) return true // feature off

  const ip = (remoteAddress ?? '').replace('::ffff:', '')
  if (ip === '127.0.0.1' || ip === '::1') return true // localhost bypass

  let provided = null
  try {
    provided = new URL(url ?? '/', 'http://x').searchParams.get('token')
  } catch {
    provided = null
  }
  const headerToken = headers?.['x-palco-token']
  if (typeof headerToken === 'string' && headerToken) provided = headerToken

  return provided === expectedToken
}
