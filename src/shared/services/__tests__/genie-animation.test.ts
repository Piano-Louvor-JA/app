// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GENIE_DURATION_MS,
  findMinimizedItemRect,
  genieKeyframes,
  genieOrigin,
  playGenie,
  playGenieGhost,
  predictMinimizedTarget,
} from '../genie-animation'

describe('duração', () => {
  it('efeito curto (300 ms) para não parecer lento', () => {
    expect(GENIE_DURATION_MS).toBe(300)
  })
})

const page = { left: 0, top: 100, width: 1000, height: 600 }
const item = { left: 450, top: 780, width: 100, height: 30 }

describe('genieOrigin', () => {
  it('ponto de fuga = centro do item, relativo ao canto da página', () => {
    expect(genieOrigin(page, item)).toEqual({ x: 500, y: 695 })
  })
})

describe('genieKeyframes (minimizar)', () => {
  const frames = genieKeyframes(page, item)

  it('só transform e opacity (rodam na placa de vídeo, sem redesenhar a página)', () => {
    for (const frame of frames) {
      expect(Object.keys(frame).sort()).toEqual(['offset', 'opacity', 'transform'])
    }
  })

  it('começa a página inteira', () => {
    expect(frames[0]).toEqual({ offset: 0, transform: 'none', opacity: 1 })
  })

  it('no meio inclina (base mais estreita que o topo: o funil do gênio) e já encolhe', () => {
    expect(frames[1]).toEqual({
      offset: 0.45,
      transform: 'perspective(1200px) rotateX(-28deg) scale(0.595, 0.335)',
      opacity: 0.95,
    })
  })

  it('termina do tamanho do item e some dentro dele', () => {
    expect(frames[2]).toEqual({
      offset: 1,
      transform: 'perspective(1200px) rotateX(-55deg) scale(0.1, 0.05)',
      opacity: 0,
    })
  })
})

describe('predictMinimizedTarget', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.style.removeProperty('--ds-dock-height')
    document.documentElement.style.removeProperty('--ds-minimized-bar-height')
  })

  it('barra vazia: centro da barra, logo acima do dock', () => {
    document.documentElement.style.setProperty('--ds-dock-height', '72px')
    document.documentElement.style.setProperty('--ds-minimized-bar-height', '40px')
    expect(predictMinimizedTarget()).toEqual({
      left: window.innerWidth / 2 - 70,
      top: window.innerHeight - 72 - 20 - 15,
      width: 140,
      height: 30,
    })
  })

  it('sem os tokens de layout usa os tamanhos padrão', () => {
    expect(predictMinimizedTarget().top).toBe(window.innerHeight - 72 - 20 - 15)
  })

  it('barra com itens: logo depois do último', () => {
    for (const left of [100, 260]) {
      const el = document.createElement('button')
      el.dataset.minimizedKey = `/p/${left}`
      el.getBoundingClientRect = () => ({ left, top: 790, right: left + 150, width: 150, height: 30 }) as DOMRect
      document.body.appendChild(el)
    }
    expect(predictMinimizedTarget()).toEqual({ left: 418, top: 790, width: 150, height: 30 })
  })
})

describe('findMinimizedItemRect', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('acha o item da barra pela chave (fullPath), mesmo com caracteres especiais', () => {
    const el = document.createElement('button')
    el.dataset.minimizedKey = '/albums?painel=playlists'
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 30, height: 40 }) as DOMRect
    document.body.appendChild(el)
    expect(findMinimizedItemRect('/albums?painel=playlists')).toMatchObject({ left: 10, top: 20, width: 30, height: 40 })
    expect(findMinimizedItemRect('/outra')).toBeNull()
  })
})

describe('playGenie', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  function element(rect = page) {
    const el = document.createElement('section')
    el.getBoundingClientRect = () => rect as DOMRect
    const animation = { finished: Promise.resolve() }
    const animate = vi.fn(() => animation)
    ;(el as unknown as { animate: typeof animate }).animate = animate
    return { el, animate }
  }

  function reducedMotion(on: boolean) {
    window.matchMedia = vi.fn(() => ({ matches: on })) as unknown as typeof window.matchMedia
  }

  it('minimizar: anima até o item e mantém o estado final (a página sai em seguida)', async () => {
    reducedMotion(false)
    const { el, animate } = element()
    await playGenie(el, item, 'minimize')
    expect(el.style.transformOrigin).toBe('500px 695px')
    expect(el.style.willChange).toBe('transform, opacity')
    expect(animate).toHaveBeenCalledWith(genieKeyframes(page, item), {
      duration: GENIE_DURATION_MS,
      easing: 'cubic-bezier(0.55, 0, 0.75, 0.3)',
      fill: 'forwards',
    })
  })

  it('reabrir: mesmo caminho ao contrário, sem prender o estado final', async () => {
    reducedMotion(false)
    const { el, animate } = element()
    await playGenie(el, item, 'restore')
    expect(animate).toHaveBeenCalledWith([...genieKeyframes(page, item)].reverse().map((f) => ({ ...f, offset: 1 - f.offset })), {
      duration: GENIE_DURATION_MS,
      easing: 'cubic-bezier(0.25, 0.7, 0.45, 1)',
      fill: 'none',
    })
    expect(el.style.transformOrigin).toBe('')
    expect(el.style.willChange).toBe('')
  })

  it('movimento reduzido no sistema: sem efeito', async () => {
    reducedMotion(true)
    const { el, animate } = element()
    await playGenie(el, item, 'minimize')
    expect(animate).not.toHaveBeenCalled()
  })

  it('sem Web Animations (ex.: jsdom), sem alvo ou página sem tamanho: sem efeito e sem erro', async () => {
    reducedMotion(false)
    const plain = document.createElement('section')
    await expect(playGenie(plain, item, 'minimize')).resolves.toBeUndefined()
    const { el, animate } = element()
    await playGenie(el, null, 'minimize')
    await playGenie(null, item, 'minimize')
    const empty = element({ left: 0, top: 0, width: 0, height: 0 })
    await playGenie(empty.el, item, 'minimize')
    expect(animate).not.toHaveBeenCalled()
    expect(empty.animate).not.toHaveBeenCalled()
  })

  it('animação cancelada (navegou no meio) não quebra', async () => {
    reducedMotion(false)
    const el = document.createElement('section')
    el.getBoundingClientRect = () => page as DOMRect
    ;(el as unknown as { animate: () => unknown }).animate = () => ({ finished: Promise.reject(new DOMException('abort', 'AbortError')) })
    await expect(playGenie(el, item, 'restore')).resolves.toBeUndefined()
  })
})

describe('playGenieGhost (imagem da tela no lugar da página viva)', () => {
  const originalMatchMedia = window.matchMedia
  const originalAnimate = (HTMLElement.prototype as { animate?: unknown }).animate
  let animate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia
    animate = vi.fn(() => ({ finished: Promise.resolve() }))
    ;(HTMLElement.prototype as { animate?: unknown }).animate = animate
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    ;(HTMLElement.prototype as { animate?: unknown }).animate = originalAnimate
    document.body.innerHTML = ''
  })

  const ghost = () => document.querySelector<HTMLImageElement>('img.genie-ghost')

  it('minimizar: põe a imagem sobre a página, esconde a página e suga a imagem para o item', async () => {
    const realPage = document.createElement('section')
    const remove = await playGenieGhost('data:image/jpeg;base64,AA', page, item, 'minimize', realPage)
    const img = ghost()!
    expect(img.src).toContain('data:image/jpeg;base64,AA')
    expect(img.style.cssText).toContain('position: fixed')
    expect([img.style.left, img.style.top, img.style.width, img.style.height]).toEqual(['0px', '100px', '1000px', '600px'])
    expect(img.style.transformOrigin).toBe('500px 695px')
    // content-visibility: some sem recalcular o estilo de cada elemento (~20 ms × ~250 ms)
    expect(realPage.style.contentVisibility).toBe('hidden')
    expect(realPage.style.visibility).toBe('')
    expect(animate).toHaveBeenCalledWith(genieKeyframes(page, item), {
      duration: GENIE_DURATION_MS,
      easing: 'cubic-bezier(0.55, 0, 0.75, 0.3)',
      fill: 'forwards',
    })
    remove!()
    expect(ghost()).toBeNull()
  })

  it('reabrir: a imagem cresce do item até a tela e fica até a página real entrar', async () => {
    const remove = await playGenieGhost('data:image/jpeg;base64,AA', page, item, 'restore')
    expect(animate.mock.calls[0][1]).toMatchObject({ easing: 'cubic-bezier(0.25, 0.7, 0.45, 1)', fill: 'forwards' })
    expect(ghost()).not.toBeNull()
    remove!()
    expect(ghost()).toBeNull()
  })

  it('sem imagem, área, destino, suporte a animação ou com movimento reduzido: não faz nada (null)', async () => {
    expect(await playGenieGhost(null, page, item, 'minimize')).toBeNull()
    expect(await playGenieGhost('x', null, item, 'minimize')).toBeNull()
    expect(await playGenieGhost('x', page, null, 'minimize')).toBeNull()
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia
    expect(await playGenieGhost('x', page, item, 'minimize')).toBeNull()
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia
    ;(HTMLElement.prototype as { animate?: unknown }).animate = undefined
    const realPage = document.createElement('section')
    expect(await playGenieGhost('x', page, item, 'minimize', realPage)).toBeNull()
    expect(realPage.style.contentVisibility).toBe('')
    expect(ghost()).toBeNull()
  })

  it('animação cancelada não quebra e ainda devolve como remover a imagem', async () => {
    animate.mockReturnValue({ finished: Promise.reject(new DOMException('abort', 'AbortError')) })
    const remove = await playGenieGhost('x', page, item, 'minimize')
    expect(typeof remove).toBe('function')
    remove!()
  })
})
