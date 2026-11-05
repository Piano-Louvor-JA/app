import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'

type ReceiverWindow = JSDOM['window'] & { handle: (message: unknown) => void }

const opened: JSDOM[] = []
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()))

function receiver(pathname: string, lang = 'pt-BR') {
  const dom = new JSDOM(readFileSync(resolve('electron/palco/receiver.html'), 'utf8'), {
    url: `http://192.168.1.20:47080${pathname}?token=91KCV&lang=${lang}`,
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  })
  opened.push(dom)
  const w = dom.window as ReceiverWindow
  Object.assign(w, {
    fetch: () => new Promise<Response>(() => {}), setTimeout: () => 0, setInterval: () => 0, requestAnimationFrame: () => 0,
    WebSocket: class { close() {} send() {} },
  })
  for (const script of w.document.querySelectorAll('script')) {
    const code = script.getAttribute('src') === 'purify.min.js'
      ? readFileSync(resolve('electron/palco/purify.min.js'), 'utf8') : script.getAttribute('src') === 'network-mirror.js'
        ? readFileSync(resolve('electron/palco/network-mirror.js'), 'utf8') : script.textContent
    if (code?.trim()) w.eval(code)
  }
  const $ = (selector: string) => w.document.querySelector<HTMLElement>(selector)
  return { w, $ }
}

const STYLE = {
  color: '#ffeeaa', fontSize: 96, nextFontSize: 55.68, fontWeight: 700, textAlign: 'center', upperCase: true,
  shadow: { blur: 4, intensity: 0.8 }, barColor: '#00ff00', backgroundColor: '#101014',
}
const VERSE = {
  v: 1, type: 'stageReturn', active: true, current: 'Santo, santo, santo\nDeus Todo-Poderoso', next: 'Cedo de manhã',
  isCover: false, nextIsCover: false, slideIndex: 2, progress: 0.4, background: 'http://192.168.1.20:47080/bg/bg-09.png', style: STYLE,
}

describe('retorno de palco no navegador', () => {
  it('com música, cobre o espelho com o trecho atual, o próximo e o progresso', () => {
    const { w, $ } = receiver('/retorno')
    expect($('#stageReturn')!.hidden).toBe(true)
    w.handle(VERSE)
    expect($('#stageReturn')!.hidden).toBe(false)
    expect($('.stage-return__lyric')!.textContent).toBe('Santo, santo, santo\nDeus Todo-Poderoso')
    expect($('.stage-return__next-label')!.textContent).toBe('Próximo')
    expect($('.stage-return__next-lyric')!.textContent).toBe('Cedo de manhã')
    expect($('.stage-return__bar-fill')!.style.transform).toBe('scaleX(0.4)')
    expect($('.stage-return__bg')!.style.backgroundImage).toContain('http://192.168.1.20:47080/bg/bg-09.png')
  })

  it('aplica a aparência de palco recebida', () => {
    const { w, $ } = receiver('/retorno')
    w.handle(VERSE)
    const lyric = $('.stage-return__lyric')!
    expect(lyric.style.color).toBe('rgb(255, 238, 170)')
    expect(lyric.style.fontSize).toBe('5vw')
    expect(lyric.style.fontWeight).toBe('700')
    expect(lyric.style.textTransform).toBe('uppercase')
    expect(lyric.style.textShadow).not.toBe('none')
    expect($('.stage-return__next-lyric')!.style.fontSize).toBe('2.9vw')
    expect($('.stage-return__bar-fill')!.style.backgroundColor).toBe('rgb(0, 255, 0)')
    expect($('#stageReturn')!.style.backgroundColor).toBe('rgb(16, 16, 20)')
  })

  it('na capa mostra o título em destaque, sem barra', () => {
    const { w, $ } = receiver('/retorno')
    w.handle({ ...VERSE, isCover: true, current: 'Santo, Santo, Santo', next: 'Santo, santo, santo', slideIndex: 0, progress: 0 })
    expect($('.stage-return__title')!.hidden).toBe(false)
    expect($('.stage-return__title')!.textContent).toBe('Santo, Santo, Santo')
    expect($('.stage-return__block')!.hidden).toBe(true)
  })

  it('sem próximo trecho, esconde o bloco do próximo', () => {
    const { w, $ } = receiver('/retorno')
    w.handle({ ...VERSE, next: '', nextIsCover: false })
    expect($('.stage-return__next')!.hidden).toBe(true)
  })

  it('o texto da letra nunca vira HTML', () => {
    const { w, $ } = receiver('/retorno')
    w.handle({ ...VERSE, current: '<img src=x onerror="alert(1)">', next: '<b>x</b>' })
    expect($('.stage-return__lyric')!.textContent).toBe('<img src=x onerror="alert(1)">')
    expect(w.document.querySelector('#stageReturn img, #stageReturn b')).toBeNull()
  })

  it('aceita só fundos http(s) ou do próprio app', () => {
    const { w, $ } = receiver('/retorno')
    w.handle({ ...VERSE, background: 'javascript:alert(1)' })
    expect($('.stage-return__bg')!.style.backgroundImage).toBe('')
  })

  it('sem música, volta a mostrar o mesmo que a TV', () => {
    const { w, $ } = receiver('/retorno')
    w.handle(VERSE)
    w.handle({ v: 1, type: 'stageReturn', active: false })
    expect($('#stageReturn')!.hidden).toBe(true)
  })

  it('não toca o áudio do culto nem pede para ativar o som', () => {
    const { w, $ } = receiver('/retorno')
    w.handle({ v: 1, type: 'audio', url: 'http://192.168.1.20:47080/media/hino.mp3?token=91KCV', action: 'play' })
    expect(($('#audio') as HTMLAudioElement | null)?.getAttribute('src') ?? '').toBe('')
    expect($('#muteBadge')).toBeNull()
  })

  it('traduz o rótulo do próximo trecho', () => {
    const { w, $ } = receiver('/retorno', 'en')
    w.handle(VERSE)
    expect($('.stage-return__next-label')!.textContent).toBe('Next')
  })

  it('o espelho comum ignora o retorno de palco', () => {
    const { w, $ } = receiver('/')
    w.handle(VERSE)
    expect($('#stageReturn')!.hidden).toBe(true)
  })
})
