/**
 * Efeito "gênio" (macOS) / "lâmpada mágica" (Mint) ao minimizar e reabrir
 * páginas: a borda de baixo afunila até o item da barra e a página encolhe
 * para dentro dele. Reabrir faz o caminho inverso.
 *
 * Web Animations API (clip-path + transform), sem bibliotecas. Sem suporte
 * (ex.: jsdom) ou com movimento reduzido no sistema: sem efeito.
 */

/** Duração do efeito (minimizar e reabrir). */
export const GENIE_DURATION_MS = 420

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
  clipPath: string
  opacity: number
}

const FULL = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'

function percent(value: number): string {
  const clamped = Math.min(Math.max(value, 0), 100)
  return `${Math.round(clamped * 100) / 100}%`
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
  const left = percent(((target.left - page.left) / page.width) * 100)
  const right = percent(((target.left + target.width - page.left) / page.width) * 100)
  const scaleX = Math.round((target.width / page.width) * 1000) / 1000
  const scaleY = Math.round((target.height / page.height) * 1000) / 1000
  return [
    { offset: 0, transform: 'none', clipPath: FULL, opacity: 1 },
    // borda de baixo afunila até a largura do item (o "funil" do gênio)
    { offset: 0.45, transform: 'none', clipPath: `polygon(0% 0%, 100% 0%, ${right} 100%, ${left} 100%)`, opacity: 1 },
    // tudo encolhe para dentro do item
    {
      offset: 1,
      transform: `scale(${scaleX}, ${scaleY})`,
      clipPath: `polygon(${left} 0%, ${right} 0%, ${right} 100%, ${left} 100%)`,
      opacity: 0.4,
    },
  ]
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

  const frames = genieKeyframes(page, target)
  const keyframes =
    direction === 'minimize'
      ? frames
      : [...frames].reverse().map((frame) => ({ ...frame, offset: 1 - frame.offset }))

  const origin = genieOrigin(page, target)
  animatable.style.transformOrigin = `${origin.x}px ${origin.y}px`
  try {
    await animatable.animate(keyframes as unknown as Keyframe[], {
      duration: GENIE_DURATION_MS,
      easing: EASING[direction],
      fill: direction === 'minimize' ? 'forwards' : 'none',
    }).finished
  } catch {
    // cancelada (navegou no meio): sem efeito colateral
  } finally {
    if (direction === 'restore') animatable.style.transformOrigin = ''
  }
}
