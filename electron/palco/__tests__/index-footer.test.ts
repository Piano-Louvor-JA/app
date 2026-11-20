import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const opened: JSDOM[] = []
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()))

function loadIndex() {
  const dom = new JSDOM(readFileSync(resolve('electron/palco/index.html'), 'utf8'), {
    url: 'http://192.168.1.20:7080/?host=192.168.1.20&port=7081&token=91KCV',
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  })
  opened.push(dom)
  const w = dom.window
  Object.assign(w, {
    fetch: vi.fn(() => new Promise<Response>(() => {})),
    setTimeout: () => 0, setInterval: () => 0, requestAnimationFrame: () => 0,
    WebSocket: class { close() {} send() {} },
  })
  for (const script of w.document.querySelectorAll('script')) {
    const code = script.getAttribute('src') === 'purify.min.js'
      ? readFileSync(resolve('electron/palco/purify.min.js'), 'utf8') : script.getAttribute('src') === 'network-mirror.js'
        ? readFileSync(resolve('electron/palco/network-mirror.js'), 'utf8') : script.textContent
    if (code?.trim()) w.eval(code)
  }
  const handle = (w as unknown as { handle: (m: unknown) => void }).handle
  const project = (extra: Record<string, unknown>) => {
    handle({ v: 2, type: 'projection', scope: 'bible', text: 'Porque Deus amou o mundo', ...extra })
    return w.document.getElementById('footer') as HTMLElement
  }
  return { project }
}

describe('index.html — referência do rodapé', () => {
  it('trata referência, versão e cor como texto, sem injetar HTML', () => {
    const { project } = loadIndex()
    const footer = project({
      footerRef: '<img src=x onerror=alert(1)>',
      footerVersion: '<script>bad()</script>',
      footerColor: '#fff"><img src=x onerror=alert(2)>',
    })
    expect(footer.querySelector('.ref')?.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(footer.querySelector('.ver')?.textContent).toBe('<script>bad()</script>')
    expect(footer.querySelector('img,script')).toBeNull()
  })

  it('aplica cor, peso, tamanho e transformação da referência', () => {
    const { project } = loadIndex()
    const ref = project({
      footerRef: 'João 3:16 (ARC)', footerColor: '#FCCE02', footerWeight: 700, footerSize: 40.5, footerTransform: 'uppercase',
    }).querySelector('.ref') as HTMLElement
    expect(ref.style.getPropertyValue('--ref-color')).toBe('#FCCE02')
    expect(ref.style.getPropertyValue('--ref-weight')).toBe('700')
    expect(ref.style.fontSize).toBe('3.75vw')
    expect(ref.style.textTransform).toBe('uppercase')
  })

  it('ignora transformação desconhecida e tamanho inválido', () => {
    const { project } = loadIndex()
    const ref = project({ footerRef: 'Salmos 23:1', footerSize: 'x', footerTransform: 'lowercase' })
      .querySelector('.ref') as HTMLElement
    expect(ref.style.fontSize).toBe('')
    expect(ref.style.textTransform).toBe('none')
  })
})
