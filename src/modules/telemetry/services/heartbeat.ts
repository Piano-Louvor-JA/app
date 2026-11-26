import { resolveReportedHomeLocation } from '@modules/home/services/home-preferences'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { CLIENT_PLATFORM } from '@shared/lib/client-platform'
import { isPianoApiHost } from '@shared/lib/partner-key'
import { apiCandidateBases } from '@shared/services/api-fallback'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { getUserPreference } from '@shared/services/user-preferences'

import { getOrCreateInstallId } from './telemetry-preferences'

/**
 * Sinal de "online" para a API (POST /v1/telemetry/heartbeat — contrato em
 * api/src/v1/telemetry/telemetry.routes.ts). Os headers X-Client-Platform,
 * X-Client-Version e X-Partner-Key entram pelo patch global de fetch
 * (client-platform.ts). Falha é silenciosa: tenta de novo no próximo ciclo.
 */

export interface HeartbeatBody {
  install_id: string
  platform: string
  app_version: string | null
  os: { name: string; release: string; arch: string } | null
  locale: string | null
  timezone: string | null
  district: string | null
  church: string | null
}

const HEARTBEAT_PATH = '/v1/telemetry/heartbeat'
const TIMEOUT_MS = 8_000

const APP_VERSION: string =
  (import.meta.env as Record<string, string | undefined>).VITE_APP_VERSION ?? ''

/** Só hosts da API Piano (a API PHP legada de fallback não tem o endpoint). */
export function heartbeatUrls(): string[] {
  const urls: string[] = []
  for (const base of apiCandidateBases('database')) {
    try {
      const { origin, hostname } = new URL(base)
      const url = `${origin}${HEARTBEAT_PATH}`
      if (isPianoApiHost(hostname) && !urls.includes(url)) urls.push(url)
    } catch {
      // base inválida: ignora
    }
  }
  return urls
}

async function readOs(): Promise<HeartbeatBody['os']> {
  try {
    const info = await getDesktopBridge()?.systemInfo?.()
    return info ? { name: info.name, release: info.release, arch: info.arch } : null
  } catch {
    return null
  }
}

function timezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    /* v8 ignore next 2 -- Intl sempre existe no Chromium */
    return null
  }
}

export async function buildHeartbeatBody(): Promise<HeartbeatBody> {
  const location = resolveReportedHomeLocation()
  const language = getUserPreference<string>(USER_PREFERENCE_KEYS.language, null)
  return {
    install_id: getOrCreateInstallId(),
    platform: CLIENT_PLATFORM,
    app_version: APP_VERSION || null,
    os: await readOs(),
    locale: language || (typeof navigator !== 'undefined' ? navigator.language : null) || null,
    timezone: timezone(),
    district: location.district || null,
    church: location.church || null,
  }
}

/**
 * Envia para o primeiro host que responder. Erro de rede ou 5xx passa ao
 * próximo; 4xx não insiste. Sempre ligado (recurso padrão, sem opção de
 * desativar).
 */
export async function sendHeartbeat(fetchImpl: typeof fetch = globalThis.fetch): Promise<boolean> {
  const body = JSON.stringify(await buildHeartbeatBody())
  for (const url of heartbeatUrls()) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
        cache: 'no-store',
        signal: controller.signal,
      })
      if (res.ok) return true
      if (res.status < 500) return false
    } catch {
      // rede/timeout: tenta o próximo host
    } finally {
      clearTimeout(timer)
    }
  }
  return false
}
