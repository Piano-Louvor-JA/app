// Guard de URL de produção para testes E2E (G2 do guardrail pianolouvorja).
//
// Contexto: em 07/10/2026, execuções E2E/manuais criaram fixtures (usuários
// e2e_*, coletâneas "E2E <ms>") na API de PRODUÇÃO (api.pianolouvorja.com.br),
// poluindo "Minhas Coletâneas" e o ranking público. Este helper é a barreira
// client-side: qualquer URL de API apontando para produção aborta a suíte no
// globalSetup, ANTES de qualquer request.
//
// Regra (SPEC guardrail-e2e §2): E2E roda contra staging, localhost ou mock
// (page.route — nunca sai pela rede). Produção é proibida por padrão.
//
// Diferença vs web: o dev server do Playwright carrega .env/.env.local do repo
// (o .env.example deste repo defaulta PRODUÇÃO), então o guard também resolve
// e valida as URLs EFETIVAS desses arquivos (process.env > .env.local > .env,
// mesma precedência do Vite).
//
// Hosts não-listados passam: o upstream api.louvorja.com.br é fallback
// read-only do catálogo e não aceita writes.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

/** Extrai o hostname de uma URL, ou null se inválida/vazia. */
function hostnameOf(url: string | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Lana erro se alguma das URLs apontar para um host de PRODUÇÃO.
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
          `URL ofensora: ${url}`,
      )
    }
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
  } catch {
    return { source, vars: {} }
  }
}

/** Resolve a URL EFETIVA de uma env: process.env > última camada > primeira. */
function lookupEffective(
  key: string,
  processEnv: Record<string, string | undefined>,
  layers: EnvLayer[],
): { url: string; source: string } | null {
  const fromProcess = processEnv[key]
  if (fromProcess !== undefined && fromProcess !== '') {
    return { url: fromProcess, source: 'process.env' }
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    const value = layers[i].vars[key]
    if (value !== undefined && value !== '') {
      return { url: value, source: layers[i].source }
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
 * Camadas .env/.env.local do raiz do repo.
 *
 * Usa process.cwd(): o Playwright roda a suíte a partir do raiz do projeto
 * (mesma base que o Vite usa para carregar .env), independente de onde o
 * globalSetup foi transpilado para cache.
 */
export function repoRootEnvLayers(): EnvLayer[] {
  return [
    readDotenvLayer(join(process.cwd(), '.env'), '.env'),
    readDotenvLayer(join(process.cwd(), '.env.local'), '.env.local'),
  ]
}
