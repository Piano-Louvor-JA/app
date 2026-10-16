import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const opened: JSDOM[] = []
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()))

function receiver(file: string, host: string, port = '7081', extra = '') {
  const dom = new JSDOM(readFileSync(resolve('electron/palco', file), 'utf8'), {
    url: `http://192.168.1.20:7080/?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&token=91KCV${extra}`,
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  })
  opened.push(dom)
  const w = dom.window
  const sockets: string[] = []
  // Sondagem inicial pendente: nenhum recurso de rede é acessado no teste.
  const fetch = vi.fn(() => new Promise<Response>(() => {}))
  Object.assign(w, {
    fetch, setTimeout: () => 0, setInterval: () => 0, requestAnimationFrame: () => 0,
    WebSocket: class {
      constructor(url: string) { sockets.push(url) }
      close() {}
      send() {}
    },
  })
  for (const script of w.document.querySelectorAll('script')) {
    const code = script.getAttribute('src') === 'purify.min.js'
      ? readFileSync(resolve('electron/palco/purify.min.js'), 'utf8') : script.textContent
    if (code?.trim()) w.eval(code)
  }
  fetch.mockClear()
  sockets.length = 0
  return { w, fetch, sockets }
}

describe.each(['receiver.html', 'index.html'])('%s — política LAN', file => {
  it.each(['10.0.0.2', '172.16.0.2', '172.31.255.254', '192.168.1.25', '169.254.1.2', '127.0.0.1', 'localhost'])(
    'mantém conexão local e porta de slot para %s', host => {
      const { w, sockets } = receiver(file, host, '7083')
      w.doConnect()
      expect(sockets).toHaveLength(1)
      const url = new URL(sockets[0]!)
      expect(url.protocol).toBe('ws:')
      expect(url.hostname).toBe(host)
      expect(url.port).toBe('7083')
      expect(url.pathname).toBe('/palco')
      expect(url.searchParams.get('token')).toBe('91KCV')
    },
  )

  it.each([
    '8.8.8.8', '172.15.0.1', '172.32.0.1', '169.253.1.2', '192.169.1.1',
    'evil.example', 'localhost.evil.example', '127.0.0.1@evil.example',
    '127.1', '2130706433', '0x7f000001', '0127.0.0.1', '192.168.999.1',
    '192.168.1.2/other', '192.168.1.2?token=evil', '192.168.1.2#fragment',
  ])('não conecta nem usa fallback para host não autorizado: %s', host => {
    const { w, sockets } = receiver(file, host)
    w.doConnect()
    w.directTry()
    expect(sockets).toEqual([])
  })

  it.each(['0', '65536', '-1', '7081/path', '7081?x=1', 'NaN'])(
    'não conecta por porta inválida %s', port => {
      const { w, sockets } = receiver(file, '192.168.1.25', port)
      w.doConnect()
      w.directTry()
      expect(sockets).toEqual([])
    },
  )

  it('sonda somente LAN e não segue redirects', async () => {
    const { w, fetch } = receiver(file, '192.168.1.25')
    await expect(w.probeHttp('8.8.8.8', 7080)).resolves.toBeNull()
    await expect(w.probeHttp('192.168.1.25', 65536)).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockImplementationOnce(() => Promise.resolve({ json: async () => ({ unlocked: true }) } as Response))
    await expect(w.probeHttp('192.168.1.25', 7080)).resolves.toMatchObject({ unlocked: true })
    expect(fetch).toHaveBeenCalledWith('http://192.168.1.25:7080/status', { redirect: 'error' })
  })

  it('não permite destinos públicos ou esquemas executáveis nas mídias', () => {
    const { w } = receiver(file, '192.168.1.25')
    for (const url of ['https://evil.example/a.mp3', 'http://8.8.8.8/a.png', 'javascript:alert(1)', 'data:text/html;base64,WA==', 'file:///etc/passwd']) {
      expect(w.proxyUrl(url)).toBe('')
    }
    expect(w.proxyUrl('http://192.168.1.25:7082/a.mp3')).toBe('http://192.168.1.25:7082/a.mp3')
    expect(w.proxyUrl('https://api.pianolouvorja.com.br/file/a.mp3')).toBe('https://api.pianolouvorja.com.br/file/a.mp3')
    expect(w.proxyUrl('data:image/png;base64,WA==')).toBe('data:image/png;base64,WA==')
  })
})

describe('nuvem oficial do Palco', () => {
  it('restringe a exceção de desenvolvimento à API local conhecida', () => {
    const { w } = receiver('receiver.html', '192.168.1.25')
    expect(w.trustedCloudApi('ws://localhost:3100/v1/palco')).toBe('ws://localhost:3100/v1/palco')
    for (const url of ['ws://localhost:5555/v1/palco', 'wss://localhost:3100/v1/palco', 'ws://localhost/v1/palco']) {
      expect(w.trustedCloudApi(url)).toBeNull()
    }
  })

  it('mantém o relay oficial, valida o código e codifica o token', () => {
    const { w, sockets, fetch } = receiver('receiver.html', '192.168.1.25')
    w.cloudOpen('../other', 'token')
    expect(sockets).toEqual([])
    w.cloudConnect('../other')
    expect(fetch).not.toHaveBeenCalled()
    w.cloudOpen('ABC123', 'test token&role=sender')
    const url = new URL(sockets[0]!)
    expect(url.origin).toBe('wss://api.louvorja.com.br')
    expect(url.pathname).toBe('/v1/palco/relay/ABC123')
    expect(url.searchParams.get('token')).toBe('test token&role=sender')
    expect(url.searchParams.get('role')).toBe('receiver')
  })

  it('não aceita endpoint customizado por querystring', () => {
    const { w, sockets } = receiver('receiver.html', '192.168.1.25', '7081', '&api=wss%3A%2F%2Fevil.example%2Fv1%2Fpalco')
    w.cloudOpen('ABC123', 'test-only')
    expect(new URL(sockets[0]!).origin).toBe('wss://api.louvorja.com.br')
  })
})
