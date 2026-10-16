// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GENIE_DURATION_MS,
  findMinimizedItemRect,
  genieKeyframes,
  genieOrigin,
  playGenie,
} from '../genie-animation'

const page = { left: 0, top: 100, width: 1000, height: 600 }
const item = { left: 450, top: 780, width: 100, height: 30 }

describe('genieOrigin', () => {
  it('ponto de fuga = centro do item, relativo ao canto da página', () => {
    expect(genieOrigin(page, item)).toEqual({ x: 500, y: 695 })
  })
})

describe('genieKeyframes (minimizar)', () => {
  const frames = genieKeyframes(page, item)

  it('começa a página inteira, sem transformação', () => {
    expect(frames[0]).toEqual({
      offset: 0,
      transform: 'none',
      clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
      opacity: 1,
    })
  })

  it('no meio a borda de baixo afunila até a largura do item (efeito lâmpada)', () => {
    expect(frames[1]).toEqual({
      offset: 0.45,
      transform: 'none',
      clipPath: 'polygon(0% 0%, 100% 0%, 55% 100%, 45% 100%)',
      opacity: 1,
    })
  })

  it('termina do tamanho do item, já no lugar dele', () => {
    expect(frames[2]).toEqual({
      offset: 1,
      transform: 'scale(0.1, 0.05)',
      clipPath: 'polygon(45% 0%, 55% 0%, 55% 100%, 45% 100%)',
      opacity: 0.4,
    })
  })

  it('item fora da página (limites) não gera porcentagens negativas nem acima de 100', () => {
    const [, middle] = genieKeyframes(page, { left: -80, top: 780, width: 40, height: 30 })
    expect(middle.clipPath).toBe('polygon(0% 0%, 100% 0%, 0% 100%, 0% 100%)')
    const [, right] = genieKeyframes(page, { left: 1200, top: 780, width: 40, height: 30 })
    expect(right.clipPath).toBe('polygon(0% 0%, 100% 0%, 100% 100%, 100% 100%)')
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
