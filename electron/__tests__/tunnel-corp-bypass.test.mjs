import { beforeEach, describe, expect, it, vi } from 'vitest'

const { headersHandler, webRequest } = vi.hoisted(() => ({ headersHandler: vi.fn(), webRequest: { onHeadersReceived: vi.fn() } }))
vi.mock('electron', () => ({
  session: { defaultSession: { webRequest } },
}))

beforeEach(() => {
  headersHandler.mockReset()
  webRequest.onHeadersReceived.mockImplementation((filter, callback) => headersHandler(filter, callback))
})

async function handler() {
  vi.resetModules()
  const { registerTunnelCorpBypass } = await import('../tunnel-corp-bypass.mjs')
  registerTunnelCorpBypass()
  return headersHandler.mock.calls[0][1]
}

describe('registerTunnelCorpBypass', () => {
  it('limita COOP/CORP aos hosts OAuth necessários', async () => {
    await handler()
    const filter = headersHandler.mock.calls[0][0]
    expect(filter.urls).toEqual(expect.arrayContaining([
      'https://*.firebaseapp.com/__/auth/*',
      'https://accounts.google.com/o/oauth2/*',
      'https://accounts.google.com/gsi/*',
      'https://identitytoolkit.googleapis.com/*',
      'https://*.gstatic.com/*',
    ]))
    expect(filter.urls).not.toContain('https://*.google.com/*')
    expect(filter.urls).not.toContain('*://*/*')
  })

  it('remove somente COOP e CORP de resposta allowlisted', async () => {
    const onHeadersReceived = await handler()
    const callback = vi.fn()
    onHeadersReceived({
      url: 'https://pianolouvorja.firebaseapp.com/__/auth/handler',
      responseHeaders: {
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Resource-Policy': ['same-origin'],
        'Content-Security-Policy': ["default-src 'self'"],
        'X-Test': ['preserved'],
      },
    }, callback)
    expect(callback).toHaveBeenCalledWith({
      responseHeaders: {
        'Content-Security-Policy': ["default-src 'self'"],
        'X-Test': ['preserved'],
      },
    })
  })

  it('mantém COOP/CORP em Google fora do OAuth', async () => {
    const onHeadersReceived = await handler()
    const callback = vi.fn()
    onHeadersReceived({
      url: 'https://www.google.com/search?q=x',
      responseHeaders: {
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Resource-Policy': ['same-origin'],
      },
    }, callback)
    expect(callback).toHaveBeenCalledWith({
      responseHeaders: {
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Resource-Policy': ['same-origin'],
      },
    })
  })

  it('não registra bypass para host fora da allowlist', async () => {
    await handler()
    const filter = headersHandler.mock.calls[0][0]
    expect(filter.urls.some(url => url.includes('evil.example'))).toBe(false)
    expect(filter.urls.some(url => url === '*://*/*')).toBe(false)
  })
})
