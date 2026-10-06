import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_API_BASE_URL = 'https://api.pianolouvorja.com.br'

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/** Lê KEY=VALUE sem sobrescrever variáveis já definidas no processo. */
export function applyEnvFile(envPath, env = process.env) {
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!key || (env[key] != null && env[key] !== '')) continue
    env[key] = unquote(line.slice(eq + 1).trim())
  }
}

/**
 * No dev, o Vite só injeta VITE_* na tela. O processo principal lê o mesmo
 * `.env` para o fallback `local://` usar o host do catálogo.
 * Testes não carregam o arquivo local.
 */
export function loadProjectEnv(env = process.env, moduleUrl = import.meta.url) {
  if (env.VITEST) return
  const dir = path.dirname(fileURLToPath(moduleUrl))
  applyEnvFile(path.join(dir, '..', '.env'), env)
}

function originOf(value) {
  if (!value?.trim()) return ''
  try {
    return new URL(value.trim()).origin
  } catch {
    return ''
  }
}

/**
 * Host da API de mídia no processo principal.
 * PIANO_API_BASE_URL vence; senão a origem de VITE_URL_FILES / VITE_PALCO_API_URL.
 */
export function resolveApiBaseUrl(env = process.env) {
  const explicit = env.PIANO_API_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  return (
    originOf(env.VITE_URL_FILES) ||
    originOf(env.VITE_PALCO_API_URL) ||
    DEFAULT_API_BASE_URL
  )
}

/**
 * Usa a URL da tela só quando ela já aponta para o host configurado.
 * Qualquer outro host é reescrito para API_BASE_URL, o mesmo do catálogo.
 */
export function resolveMediaFetchUrl(requestedUrl, builtUrl, apiBaseUrl) {
  if (typeof requestedUrl !== 'string') return builtUrl
  try {
    const requested = new URL(requestedUrl)
    const base = new URL(apiBaseUrl)
    if (requested.protocol === 'https:' && requested.hostname === base.hostname) {
      return requestedUrl
    }
  } catch {
    // URL inválida: cai no host configurado.
  }
  return builtUrl
}
