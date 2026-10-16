/**
 * Efeito "gênio" (macOS) / "lâmpada mágica" (Mint) ao minimizar e reabrir
 * páginas: a página inclina (base mais estreita que o topo) e é sugada para
 * dentro do item da barra. Reabrir faz o caminho inverso.
 *
 * Só transform + opacity (Web Animations API): roda na placa de vídeo, sem
 * redesenhar a página a cada quadro — telas grandes (Hinário) não travam.
 * Sem suporte (ex.: jsdom) ou com movimento reduzido no sistema: sem efeito.
 */

/** Duração do efeito (minimizar e reabrir): curta para não parecer lento. */
export const GENIE_DURATION_MS = 300

/** Acelera ao sair (sugado pela barra) e desacelera ao voltar. */
const EASING = {
  minimize: 'cubic-bezier(0.55, 0, 0.75, 0.3)',
  restore: 'cubic-bezier(0.25, 0.7, 0.45, 1)',
} as const

export type GenieDirection = keyof typeof EASING

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface GenieFrame {
  offset: number
  transform: string
  opacity: number
}

/** Perspectiva da inclinação (px): quanto menor, mais forte o funil. */
const PERSPECTIVE = 1200

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Escala intermediária: `t` = quanto do caminho até `scale` já foi feito. */
function towards(scale: number, t: number): number {
  return round3(1 + (scale - 1) * t)
}

/** Centro do item, em px a partir do canto da página (transform-origin). */
export function genieOrigin(page: Box, target: Box): { x: number; y: number } {
  return {
    x: target.left + target.width / 2 - page.left,
    y: target.top + target.height / 2 - page.top,
  }
}

/** Quadros do efeito ao minimizar (reabrir = os mesmos, invertidos). */
export function genieKeyframes(page: Box, target: Box): GenieFrame[] {
  const scaleX = round3(target.width / page.width)
  const scaleY = round3(target.height / page.height)
  return [
    { offset: 0, transform: 'none', opacity: 1 },
    // inclina para trás (topo mais largo que a base: o funil) e começa a encolher,
    // mais rápido na altura que na largura, como o gênio do macOS
    {
      offset: 0.45,
      transform: `perspective(${PERSPECTIVE}px) rotateX(-28deg) scale(${towards(scaleX, 0.45)}, ${towards(scaleY, 0.7)})`,
      opacity: 0.95,
    },
    // sugada para dentro do item
    {
      offset: 1,
      transform: `perspective(${PERSPECTIVE}px) rotateX(-55deg) scale(${scaleX}, ${scaleY})`,
      opacity: 0,
    },
  ]
}

/** Folga entre itens da barra e tamanho padrão de um item novo (px). */
const BAR_GAP = 8
const NEW_ITEM = { width: 140, height: 30 }

function cssPx(name: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

/**
 * Onde o item da página vai aparecer na barra — antes de ele existir, para o
 * efeito começar já no clique: logo depois do último item, ou no centro da
 * barra (logo acima do dock) quando ela ainda está vazia.
 */
export function predictMinimizedTarget(): Box {
  const items = document.querySelectorAll<HTMLElement>('[data-minimized-key]')
  const last = items[items.length - 1]
  if (last) {
    const rect = last.getBoundingClientRect()
    return { left: rect.right + BAR_GAP, top: rect.top, width: rect.width, height: rect.height }
  }
  const dock = cssPx('--ds-dock-height', 72)
  const bar = cssPx('--ds-minimized-bar-height', 40)
  return {
    left: window.innerWidth / 2 - NEW_ITEM.width / 2,
    top: window.innerHeight - dock - bar / 2 - NEW_ITEM.height / 2,
    width: NEW_ITEM.width,
    height: NEW_ITEM.height,
  }
}

/** Posição do item da barra de minimizadas para uma página (fullPath). */
export function findMinimizedItemRect(fullPath: string): DOMRect | null {
  const items = document.querySelectorAll<HTMLElement>('[data-minimized-key]')
  for (const item of items) {
    if (item.dataset.minimizedKey === fullPath) return item.getBoundingClientRect()
  }
  return null
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function framesFor(page: Box, target: Box, direction: GenieDirection) {
  const frames = genieKeyframes(page, target)
  return direction === 'minimize'
    ? frames
    : [...frames].reverse().map((frame) => ({ ...frame, offset: 1 - frame.offset }))
}

/**
 * Efeito sobre uma IMAGEM da tela (a miniatura) em vez da página viva: animar
 * uma imagem é barato até sem placa de vídeo, enquanto a página real pode ter
 * milhares de elementos (Hinário: ~14 mil). Ao minimizar, `hide` (a página)
 * some na hora e a imagem é sugada até o item; ao reabrir, a imagem cresce do
 * item até a tela e fica lá até quem chamou remover (a página real entrou).
 * Devolve como remover a imagem, ou null quando não dá para usar o efeito
 * (sem imagem, sem suporte ou movimento reduzido) — aí nada foi alterado.
 */
export async function playGenieGhost(
  image: string | null,
  area: Box | null,
  target: Box | null,
  direction: GenieDirection,
  hide?: HTMLElement | null,
): Promise<(() => void) | null> {
  if (!image || !area || !target || prefersReducedMotion()) return null
  const ghost = document.createElement('img')
  if (typeof ghost.animate !== 'function') return null

  ghost.className = 'genie-ghost'
  ghost.alt = ''
  ghost.src = image
  const origin = genieOrigin(area, target)
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${area.left}px`,
    top: `${area.top}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
    margin: '0',
    zIndex: '1000',
    pointerEvents: 'none',
    transformOrigin: `${origin.x}px ${origin.y}px`,
    willChange: 'transform, opacity',
  })
  document.body.appendChild(ghost)
  if (hide) hide.style.visibility = 'hidden'

  try {
    await ghost.animate(framesFor(area, target, direction) as unknown as Keyframe[], {
      duration: GENIE_DURATION_MS,
      easing: EASING[direction],
      fill: 'forwards',
    }).finished
  } catch {
    // cancelada: quem chamou ainda remove a imagem
  }
  return () => ghost.remove()
}

/**
 * Toca o efeito em `el` rumo a `target` (minimizar) ou a partir dele
 * (reabrir). Ao minimizar o estado final fica preso: a página sai logo
 * depois. Sempre resolve (nunca rejeita), mesmo se a animação for cancelada.
 */
export async function playGenie(
  el: Element | null,
  target: Box | null,
  direction: GenieDirection,
): Promise<void> {
  if (!el || !target || prefersReducedMotion()) return
  const animatable = el as HTMLElement & { animate?: HTMLElement['animate'] }
  if (typeof animatable.animate !== 'function') return

  const page = el.getBoundingClientRect()
  if (page.width <= 0 || page.height <= 0) return

  const keyframes = framesFor(page, target, direction)

  const origin = genieOrigin(page, target)
  animatable.style.transformOrigin = `${origin.x}px ${origin.y}px`
  // camada própria na placa de vídeo durante o efeito
  animatable.style.willChange = 'transform, opacity'
  try {
    await animatable.animate(keyframes as unknown as Keyframe[], {
      duration: GENIE_DURATION_MS,
      easing: EASING[direction],
      fill: direction === 'minimize' ? 'forwards' : 'none',
    }).finished
  } catch {
    // cancelada (navegou no meio): sem efeito colateral
  } finally {
    if (direction === 'restore') {
      animatable.style.transformOrigin = ''
      animatable.style.willChange = ''
    }
  }
}
