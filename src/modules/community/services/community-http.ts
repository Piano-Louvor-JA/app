import { defaultApiOrigin } from '@shared/services/api-env'

export const COMMUNITY_TENANT_HEADERS = { 'X-Tenant': 'piano' }

export function communityBaseUrl(): string {
  const base = import.meta.env.VITE_PALCO_API_URL ?? defaultApiOrigin()
  return `${base.replace(/\/$/, '')}/v1/custom`
}

export function communityHeaders(headers?: HeadersInit): Record<string, string> {
  const source = new Headers(headers)
  const merged = Object.fromEntries(source)
  const authorization = source.get('Authorization')
  if (authorization) delete merged.authorization
  return {
    ...merged,
    ...(authorization ? { Authorization: authorization } : {}),
    'X-Tenant': 'piano',
  }
}

export function communityRequest(init: RequestInit = {}): RequestInit {
  return { ...init, headers: communityHeaders(init.headers) }
}
