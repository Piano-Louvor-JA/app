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

  describe('animação igual à tela de retorno dos monitores', () => {
    function animated(reducedMotion = false) {
      const page = receiver('/retorno')
      const frames: Array<(now: number) => void> = []
      let now = 1000
      const animations: Array<{ keyframes: unknown; options: unknown }> = []
      let finish!: () => void
      Object.assign(page.w, {
        requestAnimationFrame: (cb: (now: number) => void) => { frames.push(cb); return frames.length },
        cancelAnimationFrame: () => {},
        matchMedia: () => ({ matches: reducedMotion }),
      })
      page.w.performance.now = () => now
      page.w.HTMLElement.prototype.getBoundingClientRect = function () {
        const next = this.classList.contains('stage-return__next-lyric')
        return { left: next ? 300 : 100, top: next ? 800 : 300, width: next ? 600 : 1200, height: next ? 60 : 140, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect
      }
      page.w.HTMLElement.prototype.animate = function (keyframes: unknown, options: unknown) {
        animations.push({ keyframes, options })
        return { finished: new Promise<void>((resolve) => { finish = resolve }), cancel() {} } as unknown as Animation
      }
      const flush = (rounds = 4) => { for (let i = 0; i < rounds; i++) frames.splice(0).forEach(cb => cb(now)) }
      return { ...page, animations, flush, finish: () => finish(), advance: (ms: number) => { now += ms } }
    }
    const tick = () => new Promise(resolve => setTimeout(resolve, 0))

    it('o próximo trecho voa até o lugar do atual, o anterior sobe e some, e o novo próximo entra', async () => {
      const { w, $, animations, flush, finish } = animated()
      w.handle(VERSE)
      w.handle({ ...VERSE, slideIndex: 3, current: 'Cedo de manhã', next: 'Louvado seja', progress: 0 })
      const ghost = $('.stage-return__lyric--ghost')!
      const flyer = $('.stage-return__flyer')!
      expect(ghost.hidden).toBe(false)
      expect(ghost.textContent).toBe('Santo, santo, santo\nDeus Todo-Poderoso')
      expect(ghost.classList.contains('out')).toBe(true)
      expect($('.stage-return__card .stage-return__lyric:not(.stage-return__lyric--ghost)')!.textContent).toBe('Cedo de manhã')
      expect($('.stage-return__card .stage-return__lyric:not(.stage-return__lyric--ghost)')!.classList.contains('wait')).toBe(true)
      expect(flyer.hidden).toBe(false)
      expect(flyer.textContent).toBe('Cedo de manhã')
      expect($('.stage-return__next-lyric')!.classList.contains('out')).toBe(true)
      expect(animations).toHaveLength(1)
      expect(animations[0]!.keyframes).toEqual([
        { transform: 'translate(-100px, 500px) scale(0.5)' },
        { transform: 'translate(0px, 0px) scale(1)' },
      ])
      expect(animations[0]!.options).toMatchObject({ duration: 780, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
      finish()
      await tick()
      flush()
      await tick()
      expect($('.stage-return__next-lyric')!.textContent).toBe('Louvado seja')
      expect($('.stage-return__next-lyric')!.classList.contains('enter')).toBe(true)
      expect($('.stage-return__next-lyric')!.classList.contains('out')).toBe(false)
      expect($('.stage-return__lyric.wait')).toBeNull()
      expect(ghost.hidden).toBe(true)
      expect(flyer.hidden).toBe(true)
    })

    it('saltos, capa e quem prefere menos movimento trocam direto', () => {
      const jump = animated()
      jump.w.handle(VERSE)
      jump.w.handle({ ...VERSE, slideIndex: 7, current: 'Outro trecho', next: '' })
      expect(jump.animations).toHaveLength(0)
      expect(jump.$('.stage-return__card .stage-return__lyric:not(.stage-return__lyric--ghost)')!.textContent).toBe('Outro trecho')
      const calm = animated(true)
      calm.w.handle(VERSE)
      calm.w.handle({ ...VERSE, slideIndex: 3, current: 'Cedo de manhã', next: 'Louvado seja' })
      expect(calm.animations).toHaveLength(0)
      expect(calm.$('.stage-return__next-lyric')!.textContent).toBe('Louvado seja')
      expect(calm.$('.stage-return__flyer')!.hidden).toBe(true)
    })

    it('a barra avança suave entre as atualizações, sem saltos', () => {
      const { w, $, flush, advance } = animated()
      w.handle({ ...VERSE, progress: 0.2 })
      const fill = $('.stage-return__bar-fill')!
      expect(fill.style.transform).toBe('scaleX(0.2)')
      advance(1000)
      w.handle({ ...VERSE, progress: 0.3 })
      expect(fill.style.transform).toBe('scaleX(0.2)')
      advance(200)
      flush(1)
      const shown = Number(fill.style.transform.match(/scaleX\(([\d.]+)\)/)![1])
      expect(shown).toBeGreaterThan(0.2)
      expect(shown).toBeLessThan(0.33)
      w.handle({ ...VERSE, slideIndex: 3, current: 'Cedo de manhã', progress: 0 })
      expect(fill.style.transform).toBe('scaleX(0)')
    })
  })

  it('o espelho comum ignora o retorno de palco', () => {
    const { w, $ } = receiver('/')
    w.handle(VERSE)
    expect($('#stageReturn')!.hidden).toBe(true)
  })
})
