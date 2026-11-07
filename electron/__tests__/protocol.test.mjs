// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/userData') },
  net: { fetch: vi.fn() },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
    registerFileProtocol: vi.fn(),
  },
}))

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { handleOnlineVideoRequest, resolveLocalProtocolPath, setOnlineVideoSource, sniffImageMime } from '../protocol.mjs'

describe('local://yt-stream e local://yt-cache', () => {
  const ID = 'aaaaaaaaaaa'
  const request = (url, headers = {}) => new Request(url, { headers })

  function fakeSource(dir) {
    return {
      serve: vi.fn(() => new Response('trilha', { status: 206 })),
      cacheFile: vi.fn((name) => path.join(dir, name)),
    }
  }

  it('yt-stream repassa ID, trilha, Range e o sinal de cancelamento', () => {
    const source = fakeSource('/x')
    const req = request(`local://yt-stream/${ID}/audio`, { Range: 'bytes=10-' })
    const response = handleOnlineVideoRequest(req, source)
    expect(response.status).toBe(206)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(source.serve).toHaveBeenCalledWith(ID, 'audio', 'bytes=10-', req.signal)
  })

  it('caminho inválido ou recurso não iniciado: 404', () => {
    const source = fakeSource('/x')
    expect(handleOnlineVideoRequest(request('local://yt-stream/curto/video'), source).status).toBe(404)
    expect(handleOnlineVideoRequest(request(`local://yt-stream/${ID}/legenda`), source).status).toBe(404)
    expect(handleOnlineVideoRequest(request(`local://yt-stream/${ID}/video`), null).status).toBe(404)
    expect(handleOnlineVideoRequest(request('local://yt-cache/../../etc/passwd'), source).status).toBe(404)
    expect(handleOnlineVideoRequest(request(`local://yt-cache/${ID}.mp4`), null).status).toBe(404)
    expect(source.serve).not.toHaveBeenCalled()
  })

  it('yt-cache serve o arquivo pronto com Range e CORS', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'piano-protocol-'))
    try {
      writeFileSync(path.join(dir, `${ID}.mp4`), '0123456789')
      writeFileSync(path.join(dir, `${ID}.vtt`), 'WEBVTT')
      const source = fakeSource(dir)

      const video = handleOnlineVideoRequest(request(`local://yt-cache/${ID}.mp4`, { Range: 'bytes=2-4' }), source)
      expect(video.status).toBe(206)
      expect(video.headers.get('Content-Type')).toBe('video/mp4')
      expect(video.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await video.text()).toBe('234')

      const vtt = handleOnlineVideoRequest(request(`local://yt-cache/${ID}.vtt`), source)
      expect(vtt.headers.get('Content-Type')).toBe('text/vtt; charset=utf-8')
      expect(vtt.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await vtt.text()).toBe('WEBVTT')

      const missing = handleOnlineVideoRequest(request('local://yt-cache/bbbbbbbbbbb.mp4'), source)
      expect(missing.status).toBe(404)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('outros hosts seguem o fluxo normal; a fonte registrada é a padrão', () => {
    expect(handleOnlineVideoRequest(request('local://media/covers/a.png'))).toBeNull()
    const source = fakeSource('/x')
    setOnlineVideoSource(source)
    handleOnlineVideoRequest(request(`local://yt-stream/${ID}/video`))
    expect(source.serve).toHaveBeenCalled()
    setOnlineVideoSource(null)
  })
})

describe('protocol local://', () => {
  it('sniffImageMime reconhece JPEG mesmo com extensão bmp', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
    expect(sniffImageMime(jpeg)).toBe('image/jpeg')
  })

  it('sniffImageMime reconhece BMP real', () => {
    const bmp = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(sniffImageMime(bmp)).toBe('image/bmp')
  })

  it('sniffImageMime reconhece PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00])
    expect(sniffImageMime(png)).toBe('image/png')
  })

  it('resolveLocalProtocolPath junta media + covers sem barra inicial', () => {
    const resolved = resolveLocalProtocolPath(
      'local://media/covers/2026.bmp',
      '/tmp/userData',
    )
    expect(resolved.kind).toBe('media')
    expect(resolved.mediaRelative).toBe('covers/2026.bmp')
    expect(resolved.filePath.replace(/\\/g, '/')).toMatch(/Media\/covers\/2026\.bmp$/)
  })
})

describe('local offline fonts', () => {
  it('does not attempt API fallback for a missing local font', async () => {
    const { net, protocol } = await import('electron')
    const { registerLocalFileProtocol } = await import('../protocol.mjs')
    net.fetch.mockClear()
    registerLocalFileProtocol()
    const handler = protocol.handle.mock.calls.at(-1)[1]
    const response = await handler(new Request('local://media/fontes/inter/missing.woff2'))
    expect(response.status).toBe(404)
    expect(net.fetch).not.toHaveBeenCalled()
  })
  it('serves WOFF2 with the CORS header required by FontFace in the HTTP renderer', async () => {
    const { app, protocol } = await import('electron')
    const { registerLocalFileProtocol } = await import('../protocol.mjs')
    const dir = mkdtempSync(path.join(tmpdir(), 'font-protocol-'))
    app.getPath.mockReturnValueOnce(dir)
    const file = resolveLocalProtocolPath('local://media/fontes/inter/face-0.woff2', dir).filePath
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'wOF2test')
    try {
      registerLocalFileProtocol()
      const response = await protocol.handle.mock.calls.at(-1)[1](new Request('local://media/fontes/inter/face-0.woff2'))
      expect(response.headers.get('Content-Type')).toBe('font/woff2')
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await response.text()).toBe('wOF2test')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

})
