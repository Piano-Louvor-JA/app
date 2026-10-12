/**
 * Parser SOMENTE LEITURA do hosts do Windows (também funciona p/ /etc/hosts
 * nos testes/dev Linux). Extrai overrides que citam os domínios da API —
 * AV/firewall costuma escrever entradas ali.
 */

export type HostsOverride = {
  ip: string
  hostname: string
}

/**
 * Domínios da cascata real (api-fallback.ts), sem esquema — derivados do
 * CONTRATO DE PERFIL (SPEC piano-api-env-guard): non-release acompanha STG,
 * nunca produção. Export como função para testes; constante preservada com o
 * valor efetivo do perfil do build.
 */
import { rendererApiHosts } from '@shared/services/api-env'

/** Diagnóstico de rede vigia TODOS os domínios da API (STG + produção +
 * legados), independente do perfil: o /etc/hosts é leitura pura e um
 * sequestro de `api.pianolouvorja.com.br` é sintoma relevante mesmo em
 * build STG (mesma máquina pode rodar o app de produção). */
const DIAGNOSTIC_DOMAINS = [
  'api-stg.pianolouvorja.com.br',
  'api.pianolouvorja.com.br',
  'api.louvorja.com.br',
  'api.louvorja.workers.dev',
] as const

export function apiDomains(): string[] {
  return [...new Set([...rendererApiHosts(), ...DIAGNOSTIC_DOMAINS])]
}

export const API_DOMAINS = apiDomains()

/**
 * Filtra linhas do hosts: entradas cujo hostname cita algum domínio da API
 * (match exato de label ou subdomínio — evita falso-positivo tipo
 * `notapilouvorja.com.br`).
 */
export function parseHostsOverrides(
  content: string,
  domains: readonly string[] = API_DOMAINS,
): HostsOverride[] {
  const out: HostsOverride[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) continue
    const [ip, ...hostnames] = parts
    for (const hostname of hostnames) {
      const host = hostname.toLowerCase()
      const hit = domains.some((domain) => {
        const d = domain.toLowerCase()
        return host === d || host.endsWith(`.${d}`)
      })
      if (hit) out.push({ ip, hostname: host })
    }
  }
  return out
}

/** Mascara token p/ relatório: 4 primeiros chars + tamanho. Nunca o valor. */
export function maskToken(token: string | undefined): string | null {
  if (!token) return null
  const head = token.slice(0, 4)
  return `${head}…(${token.length} chars)`
}
