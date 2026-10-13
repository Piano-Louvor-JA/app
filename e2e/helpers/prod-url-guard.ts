// Proteção E2E contra a API de produção. O carregador real do Vite
// resolve arquivos do modo development, expansão e ambiente do processo.
// O upstream read-only do catálogo continua permitido; as specs deste
// repositório usam APIs locais interceptadas pelo Playwright.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from 'vite'

/** Hosts cujo acesso por E2E é PROIBIDO (API de produção). */
export const PROD_HOSTS = ['api.pianolouvorja.com.br'] as const

/** Envs de API validadas pelo guard (D8: VITE_* + PIANO_API_BASE_URL). */
export const APP_API_ENV_KEYS = [
  'VITE_URL_DATABASE',
  'VITE_URL_FILES',
  'VITE_PALCO_API_URL',
  'PIANO_API_BASE_URL',
] as const

/** Uma camada de variáveis (process.env, .env ou .env.local). */
export interface EnvLayer {
  source: string
  vars: Record<string, string>
}

/**
 * Extrai o hostname de uma URL; null se vazia.
 *
 * FAIL-CLOSED: se a string não parseia como URL mas CONTÉ um host de
 * produção (ex.: "api.pianolouvorja.com.br" sem protocolo, ou com aspas
 * envolventes de CSV malformado), retorna o host de produção para o guard
 * bloquear — nunca deixar passar por falha de parsing.
 */
function hostnameOf(url: string | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    const lowered = trimmed.toLowerCase()
    for (const host of PROD_HOSTS) {
      if (lowered.includes(host)) return host
    }
    return null
  }
}

/**
 * Lança erro se alguma das URLs apontar para um host de PRODUÇÃO.
 *
 * @param urls   URLs candidatas (env vazias/ausentes são puladas)
 * @param source origem das URLs para a mensagem de erro (ex.: "process.env",
 *               ".env", ".env.local")
 * @throws Error com host ofensor e origem, sugerindo staging/local/mock
 */
export function assertNoProdApiUrl(urls: Array<string | undefined>, source: string): void {
  for (const url of urls) {
    const host = hostnameOf(url)
    if (host === null) continue
    if ((PROD_HOSTS as readonly string[]).includes(host)) {
      throw new Error(
        `E2E apontando para PRODUÇÃO (${host} em ${source}) — use staging ` +
          `(api-stg.pianolouvorja.com.br), localhost ou mock (page.route). ` +
          `URL ofensora: ${safeUrlForMessage(url ?? '')}`,
      )
    }
  }
}

/** Erros não devem imprimir userinfo, query ou fragmentos com credenciais. */
function safeUrlForMessage(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '[URL inválida contendo host de produção]'
  }
}

/** Quebra um CSV de URLs ("https://a,https://b") em entradas não-vazias. */
export function splitCsvUrls(csv: string | undefined): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/**
 * Parser mínimo de .env (KEY=VALUE, uma por linha): pula comentários (#) e
 * linhas inválidas, remove aspas envolventes do valor. Sem dependência nova.
 */
export function parseDotenv(content: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    vars[key] = value
  }
  return vars
}

/** Lê um arquivo .env do repo; arquivo ausente vira camada vazia. */
export function readDotenvLayer(path: string, source: string): EnvLayer {
  try {
    return { source, vars: parseDotenv(readFileSync(path, 'utf8')) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { source, vars: {} }
    throw error
  }
}

/** Resolve a URL EFETIVA de uma env: process.env > última camada > primeira. */
function lookupEffective(
  key: string,
  processEnv: Record<string, string | undefined>,
  layers: EnvLayer[],
): { url: string; source: string } | null {
  const fromProcess = processEnv[key]
  if (fromProcess !== undefined) {
    return fromProcess ? { url: fromProcess, source: 'process.env' } : null
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    const value = layers[i].vars[key]
    if (value !== undefined) {
      return value ? { url: value, source: layers[i].source } : null
    }
  }
  return null
}

/**
 * Resolve todas as URLs de API efetivas (4 envs + entradas do CSV de
 * fallback) com a origem de cada valor, para o guard validar.
 *
 * @param processEnv ambiente do processo Playwright
 * @param layers     camadas de arquivos em precedência CRESCENTE
 *                   ([.env, .env.local] — local sobrepõe, como no Vite)
 */
export function resolveEffectiveApiUrls(
  processEnv: Record<string, string | undefined>,
  layers: EnvLayer[],
): Array<{ key: string; url: string; source: string }> {
  const resolved: Array<{ key: string; url: string; source: string }> = []
  for (const key of APP_API_ENV_KEYS) {
    const hit = lookupEffective(key, processEnv, layers)
    if (hit) resolved.push({ key, ...hit })
  }
  const fallback = lookupEffective('VITE_API_FALLBACK_URLS', processEnv, layers)
  if (fallback) {
    for (const url of splitCsvUrls(fallback.url)) {
      resolved.push({ key: 'VITE_API_FALLBACK_URLS', url, source: fallback.source })
    }
  }
  return resolved
}

/**
 * Arquivos de ambiente do modo development, em ordem de precedência.
 *
 * Usa process.cwd(): o Playwright roda a suíte a partir do raiz do projeto
 * (mesma base que o Vite usa para carregar .env), independente de onde o
 * globalSetup foi transpilado para cache.
 */
export function repoRootEnvLayers(): EnvLayer[] {
  return [
    readDotenvLayer(join(process.cwd(), '.env'), '.env'),
    readDotenvLayer(join(process.cwd(), '.env.local'), '.env.local'),
    readDotenvLayer(join(process.cwd(), '.env.development'), '.env.development'),
    readDotenvLayer(join(process.cwd(), '.env.development.local'), '.env.development.local'),
  ]
}

/** Usa o próprio carregador do Vite: modo, precedência e expansão reais. */
export function resolveViteApiUrls(): Array<{ key: string; url: string; source: string }> {
  const layers = repoRootEnvLayers()
  const raw = resolveEffectiveApiUrls(process.env, layers)
  const expanded = loadEnv('development', process.cwd(), ['VITE_', 'PIANO_'])
  return resolveEffectiveApiUrls({}, [{ source: 'Vite (development)', vars: expanded }]).map(item => ({
    ...item, source: raw.find(candidate => candidate.key === item.key)?.source ?? item.source,
  }))
}
