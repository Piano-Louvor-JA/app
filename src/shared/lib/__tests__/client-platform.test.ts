import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function client(ua = 'Linux', version = '1.31.0') {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  vi.stubEnv('VITE_APP_VERSION', version)
  return import('../client-platform')
}

describe('identidade de plataforma nas requests', () => {
  it.each([
    ['Windows NT 10.0', 'desktop-windows'],
    ['Macintosh', 'desktop-mac'],
    ['Linux', 'desktop-linux'],
  ])('identifica %s e envia versão em HTTP', async (ua, platform) => {
    const response = new Response('ok')
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const module = await client(ua)
    expect(module.CLIENT_PLATFORM).toBe(platform)
    module.installClientPlatformHeader()
    expect(await globalThis.fetch('https://localhost/catalog')).toBe(response)
    const headers = new Headers(fetch.mock.calls[0]![1].headers)
    expect(headers.get('X-Client-Platform')).toBe(platform)
    expect(headers.get('X-Client-Version')).toBe('1.31.0')
  })

  it('instala uma única vez e tolera ausência inicial de fetch', async () => {
    vi.stubGlobal('fetch', undefined)
    const { installClientPlatformHeader } = await client()
    installClientPlatformHeader()
    const original = vi.fn()
    vi.stubGlobal('fetch', original)
    installClientPlatformHeader()
    const installed = globalThis.fetch
    installClientPlatformHeader()
    expect(globalThis.fetch).toBe(installed)
    expect(installed).not.toBe(original)
  })

  it('preserva headers do Request, opções e identidades explícitas', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response())
    vi.stubGlobal('fetch', fetch)
    const { installClientPlatformHeader } = await client()
    installClientPlatformHeader()
    const request = new Request('https://localhost/catalog', { headers: { Authorization: 'Bearer test-only' } })
    await globalThis.fetch(request)
    expect(new Headers(fetch.mock.calls[0]![1].headers).get('Authorization')).toBe('Bearer test-only')
    const headers = { 'X-Client-Platform': 'custom', 'X-Client-Version': '2.0.0' }
    await globalThis.fetch(new URL('https://localhost/catalog'), { headers, credentials: 'include' })
    expect(fetch.mock.calls[1]![1].credentials).toBe('include')
    expect(Object.fromEntries(new Headers(fetch.mock.calls[1]![1].headers)))
      .toEqual({ 'x-client-platform': 'custom', 'x-client-version': '2.0.0' })
  })

  it('não inventa versão ausente nem adiciona headers a protocolos locais', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response())
    vi.stubGlobal('fetch', fetch)
    const { installClientPlatformHeader } = await client('Linux', '')
    installClientPlatformHeader()
    await globalThis.fetch('http://localhost/catalog')
    expect(new Headers(fetch.mock.calls[0]![1].headers).has('X-Client-Version')).toBe(false)
    for (const url of ['/catalog', 'file:///music.mp3', 'data:text/plain,hino']) {
      const options = { cache: 'no-store' as const }
      await globalThis.fetch(url, options)
      expect(fetch).toHaveBeenLastCalledWith(url, options)
    }
  })

  it('não injeta headers em hosts de terceiros (Google/Firebase) — preflight 403', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response())
    vi.stubGlobal('fetch', fetch)
    const { installClientPlatformHeader } = await client()
    installClientPlatformHeader()
    const urls = [
      'https://identitytoolkit.googleapis.com/v1/projects?key=test-only',
      'https://securetoken.googleapis.com/v1/token',
      'https://pianolouvorja.firebaseapp.com/__/auth/handler',
      'https://accounts.google.com/o/oauth2/v2/auth',
    ]
    for (const url of urls) {
      await globalThis.fetch(url)
      expect(fetch).toHaveBeenLastCalledWith(url, undefined)
    }
  })

  it('mantém o fetch original utilizável se não conseguir ler a URL', async () => {
    const response = new Response('fallback')
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const { installClientPlatformHeader } = await client()
    installClientPlatformHeader()
    const request = { get url() { throw new Error('URL indisponível') } } as Request
    expect(await globalThis.fetch(request)).toBe(response)
    expect(fetch.mock.calls[0]![0]).toBe(request)
    expect(fetch.mock.calls[0]![1]).toBeUndefined()
  })
})
