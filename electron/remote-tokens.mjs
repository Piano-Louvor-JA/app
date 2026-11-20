import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const valid = (value) => typeof value === 'string' && /^[A-F0-9]{8}$/.test(value)

export function createRemoteToken(excluded = []) {
  let token
  do { token = randomBytes(4).toString('hex').toUpperCase() } while (excluded.includes(token))
  return token
}

/** Grava antes de ativar o novo token. Falha mantém o estado anterior. */
export function saveRemoteTokens(configPath, tokens) {
  if (!valid(tokens?.token) || !valid(tokens?.speakerToken) || tokens.token === tokens.speakerToken) {
    throw new Error('Tokens de controle remoto inválidos')
  }
  mkdirSync(dirname(configPath), { recursive: true })
  const temporary = `${configPath}.tmp-${process.pid}`
  try {
    writeFileSync(temporary, JSON.stringify({ token: tokens.token, speakerToken: tokens.speakerToken }), { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, configPath)
  } catch (error) {
    try { rmSync(temporary, { force: true }) } catch { /* preserva o erro original */ }
    throw error
  }
}

/** Mesmo modelo da Transmissão: tokens locais no userData, estáveis no boot. */
export function loadOrCreateRemoteTokens(configPath) {
  let saved
  try { saved = JSON.parse(readFileSync(configPath, 'utf8')) } catch { /* primeira abertura ou arquivo corrompido */ }
  const token = valid(saved?.token) ? saved.token : createRemoteToken(valid(saved?.speakerToken) ? [saved.speakerToken] : [])
  const speakerToken = valid(saved?.speakerToken) && saved.speakerToken !== token
    ? saved.speakerToken : createRemoteToken([token])
  const tokens = { token, speakerToken }
  if (token !== saved?.token || speakerToken !== saved?.speakerToken) saveRemoteTokens(configPath, tokens)
  return tokens
}
