/**
 * Posição da referência bíblica no receiver (footerPosition do Personalizar
 * Palco). Sem o campo (APK, desktop antigo) o rodapé mantém o comportamento
 * anterior: abaixo da caixa, acompanhando o alinhamento do texto.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECEIVER_PATH = resolve(__dirname, '../receiver.html')

type ReceiverWindow = Window & { handle: (m: unknown) => void }
let w: ReceiverWindow

beforeAll(() => {
  const dom = new JSDOM(readFileSync(RECEIVER_PATH, 'utf-8'), {
    url: 'http://127.0.0.1:47080/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  w = dom.window as unknown as ReceiverWindow
  Object.defineProperty(w, 'WebSocket', { value: {} })
  Object.defineProperty(w, 'fetch', { configurable: true, value: () => Promise.reject(new Error('sem rede')) })
  w.localStorage.clear()
  for (const script of dom.window.document.querySelectorAll('script')) {
    const src = script.getAttribute('src')
    const code = src ? readFileSync(resolve(__dirname, '..', src), 'utf8') : script.textContent ?? ''
    try {
      dom.window.eval(code)
    } catch {
      /* boot pode tocar APIs ausentes no jsdom */
    }
  }
})

const BIBLE = {
  v: 2,
  type: 'projection',
  scope: 'bible',
  text: 'Porque Deus amou o mundo de tal maneira',
  fontSize: 47,
  textBox: true,
  bibleBox: true,
  textAlign: 'center',
  textVerticalAlign: 'middle',
  footerRef: 'João 3:16 (ARC)',
}

async function project(extra: Record<string, unknown> = {}): Promise<HTMLElement> {
  w.handle({ ...BIBLE, ...extra })
  await new Promise((done) => w.requestAnimationFrame(() => done(null)))
  return w.document.getElementById('footer') as HTMLElement
}

describe('receiver — posição da referência bíblica', () => {
  it('abaixo do texto: ancorado na caixa, com o alinhamento escolhido', async () => {
    for (const [position, align] of [
      ['below-left', 'left'],
      ['below-center', 'center'],
      ['below-right', 'right'],
    ]) {
      const footer = await project({ footerPosition: position })
      expect(footer.style.textAlign).toBe(align)
      expect(footer.style.bottom).toBe('auto')
      expect(footer.style.top).not.toBe('auto')
    }
  })

  it('canto: rodapé da tela à direita, sem ancorar na caixa', async () => {
    const footer = await project({ footerPosition: 'corner' })
    expect(footer.style.textAlign).toBe('right')
    expect(footer.style.top).toBe('auto')
    expect(footer.style.bottom).toBe('4vh')
    expect(footer.style.left).toBe('0px')
    expect(footer.style.right).toBe('0px')
  })

  it('sem footerPosition (APK) ou valor desconhecido: segue o alinhamento do texto', async () => {
    let footer = await project({ textAlign: 'left' })
    expect(footer.style.textAlign).toBe('left')
    expect(footer.style.bottom).toBe('auto')
    footer = await project({ footerPosition: 'top', textAlign: 'center' })
    expect(footer.style.textAlign).toBe('center')
    expect(footer.style.bottom).toBe('auto')
  })

  it('a referência continua como texto', async () => {
    const footer = await project({ footerPosition: 'corner' })
    expect(footer.querySelector('.ref')?.textContent).toBe('João 3:16 (ARC)')
  })
})
