// @vitest-environment node
// SPEC v1.3 — correção da sonda mediaReal (mediaFileProbe).
// RF1: URL de mídia real /file/musics/pt/90141.mp3
// RF2: 3xx → ok:false, classe HTTP_302_REDIRECT (não segue redirect)
// RF3: 400 → OTHER; RF4: shape { url, status, ok, bytes, ms, erro }
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mediaFileProbe } from '../diagnostics.mjs'

const HOST = 'api.pianolouvorja.com.br'

function mockFetchOnce(status, extra = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new ArrayBuffer(extra.bytes ?? 64),
    ...extra.response,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SPEC v1.3 mediaFileProbe', () => {
  it('RF1: monta URL de mídia real /file/musics/pt/90141.mp3', async () => {
    const fetchMock = mockFetchOnce(206)
    vi.stubGlobal('fetch', fetchMock)
    const result = await mediaFileProbe(HOST, null)
    expect(result.url).toBe(`https://${HOST}/file/musics/pt/90141.mp3`)
    expect(fetchMock.mock.calls[0][0]).toBe(`https://${HOST}/file/musics/pt/90141.mp3`)
    // sem seguir redirect — probe avalia a própria CDN
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual')
  })

  it('RF2/aceite 2: 206 → ok:true sem erro', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(206, { bytes: 65536 }))
    const result = await mediaFileProbe(HOST, null)
    expect(result.ok).toBe(true)
    expect(result.status).toBe(206)
    expect(result.bytes).toBe(65536)
    expect(result.erro).toBeNull()
    expect(result).toHaveProperty('ms')
  })

  it('RF2/aceite 3: 302 → ok:false, classe HTTP_302_REDIRECT', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(302))
    const result = await mediaFileProbe(HOST, null)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(302)
    expect(result.erro.classe).toBe('HTTP_302_REDIRECT')
    expect(result.erro.bruto).toBe('HTTP 302')
  })

  it('RF3/aceite 4: 400 → ok:false, classe OTHER', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(400))
    const result = await mediaFileProbe(HOST, null)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.erro.classe).toBe('OTHER')
    expect(result.erro.bruto).toBe('HTTP 400')
  })

  it('RF4: shape retrocompat { url, status, ok, bytes, ms, erro }', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(302))
    const result = await mediaFileProbe(HOST, null)
    expect(Object.keys(result).sort()).toEqual(['bytes', 'erro', 'ms', 'ok', 'status', 'url'])
  })
})
