/**
 * Fallback em cascata de APIs do ecossistema LouvorJA.
 *
 * Ordem (RF: app sempre com onde fazer requisicao):
 *   1. Primária: VITE_URL_DATABASE / VITE_URL_FILES
 *      (default: api.pianolouvorja.com.br — nossa API)
 *   2. Fallbacks: VITE_API_FALLBACK_URLS (lista separada por vírgula;
 *      default: api.louvorja.com.br, api.louvorja.workers.dev)
 *
 * DEFAULTS RESTAURADOS (app#177, hotfix 14/09): o refactor 'zero default'
 * (7c66a46) quebrou TODA build de release — .env é gitignored e o CI não
 * injeta VITE_*, então a lista saía vazia e o catálogo não baixava
 * (Ezequias 13/09: 'api não respondeu nada, mídias baixaram'). As defaults
 * são URLs públicas, não segredo; env sobrepõe quando presente.
 *
 * Mesma semantica do ApiConfig do APK (Flutter) — paridade entre clientes.
 */

/** Fallbacks default, em ordem de prioridade. A primária NÃO está aqui. */
const DEFAULT_FALLBACK_HOSTS = [
  'https://api.louvorja.com.br',
  'https://api.louvorja.workers.dev',
]

/** Fallbacks: env sobrepõe; sem env = lista default. */
function fallbackHosts(): string[] {
  const env = import.meta.env.VITE_API_FALLBACK_URLS
  if (typeof env !== 'string' || !env.trim()) return [...DEFAULT_FALLBACK_HOSTS]
  return env
    .split(',')
    .map((h) => h.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

type ApiKind = 'database' | 'files'

const ENV_KEYS: Record<ApiKind, string> = {
  database: 'VITE_URL_DATABASE',
  files: 'VITE_URL_FILES',
}

// Primária: env sobrepõe; sem env = default da nossa API (URL pública).
const DEFAULT_PRIMARY_BASES: Record<ApiKind, string> = {
  database: 'https://api.pianolouvorja.com.br/json_db',
  files: 'https://api.pianolouvorja.com.br/file',
}

/** Extrai o host (origem) de uma base tipo https://host/json_db */
function baseToHost(base: string): string {
  try {
    return new URL(base).origin
  } catch {
    return base
  }
}

function kindToPath(kind: ApiKind): string {
  return kind === 'database' ? '/json_db' : '/file'
}

/**
 * Lista de bases candidatas em ordem: primária + fallbacks (sem duplicar).
 */
export function apiCandidateBases(kind: ApiKind): string[] {
  const env = import.meta.env[ENV_KEYS[kind]]
  const primary =
    typeof env === 'string' && env.trim() ? env.trim() : DEFAULT_PRIMARY_BASES[kind]
  const primaryHost = baseToHost(primary)
  const path = kindToPath(kind)
  const candidates: string[] = []
  /* v8 ignore next 1 -- primary deriva de env ou default, sempre truthy */
  if (primary) candidates.push(primary)
  for (const host of fallbackHosts()) {
    if (host !== primaryHost) candidates.push(`${host}${path}`)
  }
  return candidates
}

/**
 * Fetch com cascata de APIs: tenta a primária; em erro de rede/5xx, tenta os
 * fallbacks na ordem. 429 respeita retry com backoff na MESMA base antes de
 * migrar (rate limit é por host — trocar de host não ajuda).
 */
export async function fetchWithApiFallback<T = unknown>(
  kind: ApiKind,
  file: string,
  options: { retries?: number; delayMs?: number } = {},
): Promise<{ data: T; base: string }> {
  const { retries = 5, delayMs = 1000 } = options
  const bases = apiCandidateBases(kind)
  const path = file.startsWith('/') ? file : `/${file}`
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const token = import.meta.env.VITE_API_TOKEN
  const headers = token ? { 'Api-Token': token } : undefined

  let lastError: unknown = null
  for (const base of bases) {
    try {
      const data: T = await fetchWithRetry(base, path, date, headers, retries, delayMs)
      return { data, base }
    } catch (error) {
      lastError = error
      continue
    }
  }
  /* v8 ignore next 1 -- sempre há ao menos o candidato primário */
  throw lastError ?? new Error('api-fallback-exhausted')
}

async function fetchWithRetry<T>(
  base: string,
  path: string,
  date: string,
  headers: Record<string, string> | undefined,
  retries: number,
  delayMs: number,
): Promise<T> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${base}${path}?${date}`, { headers })
      if (response.status === 429 && attempt < retries) {
        await delay(delayMs * Math.pow(1.5, attempt))
        continue
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await delay(delayMs * Math.pow(1.5, attempt))
          continue
        }
        throw new Error(`api-exhausted: ${response.status}`)
      }
      return (await response.json()) as T
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt < retries && (message.includes('Failed to fetch') || message.includes('NetworkError'))) {
        await delay(delayMs * Math.pow(1.5, attempt))
        continue
      }
      throw error
    }
  }
}
