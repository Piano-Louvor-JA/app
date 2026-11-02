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
      'https://*.firebaseapp.com/*',
      'https://*.google.com/*',
      'https://*.gstatic.com/*',
    ]))
    expect(filter.urls).not.toContain('*://*/*')
  })

  it('remove somente COOP e CORP de resposta allowlisted', async () => {
    const onHeadersReceived = await handler()
    const callback = vi.fn()
    onHeadersReceived({
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

  it('não registra bypass para host fora da allowlist', async () => {
    await handler()
    const filter = headersHandler.mock.calls[0][0]
    expect(filter.urls.some(url => url.includes('evil.example'))).toBe(false)
    expect(filter.urls.some(url => url === '*://*/*')).toBe(false)
  })
})
