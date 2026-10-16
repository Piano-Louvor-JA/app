/**
 * Testes de regressão do receiver do Palco (electron/palco/receiver.html).
 *
 * Motivação (28/08): dois bugs reais passaram ilesos pelo node --check:
 *  1. `ReferenceError: v is not defined` no guard do handle() — engolido
 *     pelo try/catch do ws.onmessage, matava TODA projection em runtime.
 *  2. Lock de mídia morta bloqueava projection para sempre (sem heartbeat).
 *
 * Estes testes carregam o HTML REAL num jsdom e injetam mensagens WS
 * simuladas — o mesmo caminho do sender. Se o receiver regredir, quebra
 * aqui antes de chegar na TV do culto.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECEIVER_PATH = resolve(__dirname, '../../../electron/palco/receiver.html')

declare global {
  interface Window {
    handle: (m: unknown) => void
    __mediaLastSeen?: number
    __videoAudioActive?: boolean
  }
}

let dom: JSDOM
let w: Window

function loadReceiver(): void {
  const html = readFileSync(RECEIVER_PATH, 'utf-8')
  dom = new JSDOM(html, {
    url: 'http://127.0.0.1:7080/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  w = dom.window as unknown as Window

  // stubs mínimos do ambiente webOS/browser que o jsdom não tem
  const stub = (name: string): void => {
    Object.defineProperty(w, name, { value: {} })
  }
  ;(w as unknown as { PalmSystem?: unknown }).PalmSystem = undefined
  stub('WebSocket')
  // Boot do receiver lê appinfo.json/config.xml via fetch — jsdom não tem fetch.
  Object.defineProperty(w, 'fetch', {
    configurable: true,
    value: () =>
      Promise.reject(new Error('fetch stubbed in receiver-regression test')),
  })
  w.localStorage.clear()

  // executa os <script> do receiver na ordem (fora do parsing automático)
  const scripts = dom.window.document.querySelectorAll('script')
  for (const script of scripts) {
    const code = script.getAttribute('src') === 'purify.min.js'
      ? readFileSync(resolve(__dirname, '../purify.min.js'), 'utf8')
      : script.textContent ?? ''
    try {
      dom.window.eval(code)
    } catch {
      // script de boot pode tocar APIs ausentes no jsdom (connect etc.) —
      // o que importa é o handle() definido e funcional.
    }
  }
}

function el(id: string): HTMLElement {
  return w.document.getElementById(id) as HTMLElement
}

const PROJECTION = {
  v: 2,
  type: 'projection',
  background: 'http://127.0.0.1:7080/bg/bg-09.png',
  text: 'TESTE REGRESSAO',
  fontSize: 54,
  fontWeight: 600,
  textShadow: true,
  shadowBlur: 2.2,
  shadowIntensity: 0.8,
  textBox: false,
  footerRef: '',
} as const

beforeAll(() => {
  loadReceiver()
})

describe('receiver do palco — regressão', () => {
  it('handle() está definido após o boot do receiver', () => {
    expect(typeof w.handle).toBe('function')
  })

  it('REGRESSÃO 28/08 (ReferenceError v/a): projection SEM mídia renderiza', () => {
    // mídia toda parada/limpa — guard não pode lançar nem bloquear
    w.__mediaLastSeen = 0
    w.__videoAudioActive = false
    expect(() => w.handle(PROJECTION)).not.toThrow()
    expect(el('text').innerHTML).toContain('TESTE REGRESSAO')
    expect(el('idle').classList.contains('hidden')).toBe(true)
  })

  it('REGRESSÃO 28/08 (lock morto): handshake idle/bgPalco zera mídia', () => {
    // simula vídeo morto travado + sender reiniciando
    w.__videoAudioActive = true
    w.__mediaLastSeen = Date.now() - 60_000 // expirado
    w.handle({ v: 2, type: 'idle' })
    expect(w.__videoAudioActive).toBeFalsy()
    expect(w.__mediaLastSeen).toBe(0)
    // e a projection volta a passar
    expect(() => w.handle(PROJECTION)).not.toThrow()
    expect(el('text').innerHTML).toContain('TESTE REGRESSAO')
  })

  it('hardening preservado: mídia viva E fresca bloqueia projection', () => {
    const audio = el('audio') as HTMLAudioElement
    // áudio tocando (simulado via flag + heartbeat fresco)
    Object.defineProperty(audio, 'paused', { value: false, configurable: true })
    w.__mediaLastSeen = Date.now()
    w.__videoAudioActive = false
    w.handle({ ...PROJECTION, text: 'NAO_DEVE_APLICAR' })
    // texto NÃO atualizou — foi bloqueado
    expect(el('text').innerHTML).not.toContain('NAO_DEVE_APLICAR')
    // restaura pra próximos testes
    Object.defineProperty(audio, 'paused', { value: true, configurable: true })
    w.__mediaLastSeen = 0
  })

  it('REGRESSÃO 13/10 (paridade total): lyricUpperCase/textAlign/margin/bg aplicados', () => {
    w.__mediaLastSeen = 0
    w.__videoAudioActive = false
    w.handle({
      ...PROJECTION,
      lyricUpperCase: false,
      textAlign: 'left',
      textVerticalAlign: 'top',
      margin: 216,
      backgroundColor: '#101014',
    })
    const t0 = el('text') as HTMLElement
    expect(t0.style.textTransform).toBe('none')
    expect(t0.style.textAlign).toBe('left')
    // vAlign=top usa o padding do IIFE (paridade popup): 120/10.8 ≈ 11.11vh
    expect(t0.style.top).toBe((120 / 10.8) + 'vh')
    // margin px@1920 → área útil (max-width), nunca margin CSS (14/10:
    // `20vh 0` matava o margin:0 auto e deslocava a caixa na TV).
    expect(t0.style.maxWidth).toBe('calc(77.5vw)') // 100−(216/9.6), normalizado
    expect(t0.style.margin).toBe('0px auto')
    // cor de fundo pinta o PALCO (body), paridade local
    expect(w.document.body.style.background).toBe('rgb(16, 16, 20)')
    // volta ao padrão
    w.handle(PROJECTION)
  })

  it('REGRESSÃO 13/10 (bible-box): caixa grande só na Bíblia', () => {
    w.__mediaLastSeen = 0
    w.__videoAudioActive = false
    w.handle({ ...PROJECTION, textBox: true, bibleBox: true })
    expect(el('text').classList.contains('bible-box')).toBe(true)
    w.handle({ ...PROJECTION, textBox: true, bibleBox: false })
    expect(el('text').classList.contains('bible-box')).toBe(false)
  })

  it('REGRESSÃO 13/10 (cover): uppercase da capa é escolha do usuário', () => {
    w.__mediaLastSeen = 0
    w.__videoAudioActive = false
    w.handle({ ...PROJECTION, isCover: true, titleUpperCase: false })
    expect((el('text') as HTMLElement).style.textTransform).toBe('none')
    w.handle({ ...PROJECTION, isCover: true, titleUpperCase: true })
    expect((el('text') as HTMLElement).style.textTransform).toBe('uppercase')
    w.handle(PROJECTION)
  })

  it('heartbeat: mensagens video/audio renovam __mediaLastSeen', () => {
    w.__mediaLastSeen = 0
    w.handle({ v: 2, type: 'audio', action: 'pause' })
    expect(w.__mediaLastSeen).toBeGreaterThan(0)
  })

  it('caixa de letra: defaults alinham projeção e operador', () => {
    const html = readFileSync(RECEIVER_PATH, 'utf-8')
    expect(html).toContain('#text.box-on{background:rgba(24,24,24,var(--box-bg,.55));')
    expect(html).toContain('backdrop-filter:blur(16px)')
    expect(html).toContain('rgba(255,255,255,.85)')
  })

  it('paridade: receiver embutido é idêntico ao webos do palco-receiver', () => {
    // fonte da verdade: ~/palco-receiver/webos/index.html (se existir na máquina)
    const webosPath = resolve(process.env.HOME ?? '', 'palco-receiver/webos/index.html')
    let webos: string | null = null
    try {
      webos = readFileSync(webosPath, 'utf-8')
    } catch {
      // máquina sem o clone — pula (CI valida via checksum no repo receiver)
    }
    if (webos) {
      const embedded = readFileSync(RECEIVER_PATH, 'utf-8')
      expect(embedded).toBe(webos)
    }
  })
})

it('preserves basic projection formatting while stripping executable HTML', () => {
  w.handle({ ...PROJECTION, text: '<b>Bold</b><br><span style="color: red; font-weight: 700" onclick="alert(1)">Color</span><script>alert(1)</script><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><a href="javascript:alert(1)">Text</a>' });
  expect(el('text').querySelector('b')?.textContent).toBe('Bold');
  expect(el('text').querySelector('br')).not.toBeNull();
  expect(el('text').querySelector('span')?.style.color).toBe('red');
  expect(el('text').querySelector('span')?.style.fontWeight).toBe('700');
  expect(el('text').querySelector('script,img,svg,a,[onclick],[onerror],[onload]')).toBeNull();
  expect(el('text').textContent).toBe('BoldColorText');
});
it('treats footer references and versions as text, preventing HTML injection', () => {
  w.handle({ ...PROJECTION, footerRef: '<img src=x onerror=alert(1)>', footerVersion: '<script>bad()</script>' });
  const footer = w.document.querySelector('.ref')!;
  expect(footer.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(footer.querySelector('img')).toBeNull();
});
it('treats timer labels as text', () => {
  w.handle({ v: 2, type: 'timer', duration: 1, label: '<img src=x onerror=alert(1)>' });
  expect(el('timer').querySelector('img')).toBeNull();
  expect(el('timer').querySelector('small')?.textContent).toBe('<img src=x onerror=alert(1)>');
});

it('rejects executable media URLs including encoded schemes', () => {
  const proxy = (w as unknown as { proxyUrl: (url: string) => string }).proxyUrl;
  expect(proxy('javascript:alert(1)')).toBe('');
  expect(proxy('java%0Ascript:alert(1)')).toBe('');
  expect(proxy('data:text/html;base64,PHNjcmlwdD4=')).toBe('');
  expect(proxy('file:///etc/passwd')).toBe('');
  expect(proxy('data:audio/mpeg;base64,AQID')).toBe('data:audio/mpeg;base64,AQID');
  expect(proxy('http://127.0.0.1:7080/bg.png')).toMatch(/^http:\/\//);
});

it('restricts the cloud API to production, staging and localhost', () => {
  const trusted = (w as unknown as { trustedCloudApi: (url: string) => string | null }).trustedCloudApi;
  expect(trusted('wss://api.louvorja.com.br/v1/palco')).toBe('wss://api.louvorja.com.br/v1/palco');
  expect(trusted('wss://api-stg.louvorja.com.br/v1/palco/')).toBe('wss://api-stg.louvorja.com.br/v1/palco');
  expect(trusted('ws://localhost:3100/v1/palco')).toBe('ws://localhost:3100/v1/palco');
  for(const url of ['wss://evil.example/v1/palco','wss://api.louvorja.com.br.evil.example/v1/palco','wss://api.louvorja.com.br@evil.example/v1/palco','ws://api.louvorja.com.br/v1/palco','wss://api-stg.louvorja.com.br:8443/v1/palco','wss://api.louvorja.com.br/other','wss://api.louvorja.com.br/v1/palco?redirect=evil','javascript:alert(1)'])expect(trusted(url)).toBeNull();
});

it('falls back to literal text when the projection sanitizer is unavailable', () => {
  const runtime = dom.window as unknown as { DOMPurify?: unknown };
  const sanitizer = runtime.DOMPurify;
  try {
    runtime.DOMPurify = undefined;
    const text = '<b>Safe fallback</b><img src=x onerror=alert(1)>';
    w.handle({ ...PROJECTION, text });
    expect(el('text').textContent).toBe(text);
    expect(el('text').children.length).toBe(0);
  } finally { runtime.DOMPurify = sanitizer; }
});

it('ships the same sanitizer as the locked production dependency', () => {
  expect(readFileSync(resolve(__dirname, '../purify.min.js'), 'utf8'))
    .toBe(readFileSync(resolve('node_modules/dompurify/dist/purify.min.js'), 'utf8'));
});
