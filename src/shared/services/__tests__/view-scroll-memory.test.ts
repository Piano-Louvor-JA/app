// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { applyScroll, captureScroll, elementAtPath } from '../view-scroll-memory'

/**
 * Simula um elemento rolável com limite real: o jsdom guarda scrollTop sem
 * limitar e não calcula alturas.
 */
function scrollable(el: Element, { maxTop = 10_000, maxLeft = 0 } = {}) {
  let top = 0
  let left = 0
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = Math.max(0, Math.min(v, maxTop))
    },
  })
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (v: number) => {
      left = Math.max(0, Math.min(v, maxLeft))
    },
  })
  return {
    setMax(next: number) {
      maxTop = next
    },
  }
}

function build(html: string): HTMLElement {
  const root = document.createElement('main')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('elementAtPath', () => {
  it('acha o elemento pelo caminho de índices a partir da raiz', () => {
    const root = build('<section><div></div><div><ul id="alvo"></ul></div></section>')
    expect(elementAtPath(root, [0, 1, 0])?.id).toBe('alvo')
  })

  it('caminho vazio é a própria raiz; caminho inexistente é null', () => {
    const root = build('<section></section>')
    expect(elementAtPath(root, [])).toBe(root)
    expect(elementAtPath(root, [0, 4])).toBeNull()
  })
})

describe('captureScroll', () => {
  it('guarda só os elementos rolados, com o caminho até cada um', () => {
    const root = build('<section><div class="a"></div><div class="b"><ul></ul></div></section>')
    const section = root.querySelector('section')!
    const list = root.querySelector('ul')!
    scrollable(section)
    scrollable(list, { maxLeft: 500 })
    section.scrollTop = 300
    list.scrollLeft = 40
    scrollable(root.querySelector('.a')!)

    expect(captureScroll(root)).toEqual([
      { path: [0], top: 300, left: 0 },
      { path: [0, 1, 0], top: 0, left: 40 },
    ])
  })

  it('sem nada rolado devolve lista vazia', () => {
    const root = build('<section><div></div></section>')
    expect(captureScroll(root)).toEqual([])
  })
})

describe('applyScroll', () => {
  it('aplica e informa que terminou quando todas as posições foram alcançadas', () => {
    const root = build('<section><ul></ul></section>')
    scrollable(root.querySelector('section')!)
    scrollable(root.querySelector('ul')!)

    const done = applyScroll(root, [
      { path: [0], top: 300, left: 0 },
      { path: [0, 0], top: 50, left: 0 },
    ])
    expect(done).toBe(true)
    expect(root.querySelector('section')!.scrollTop).toBe(300)
    expect(root.querySelector('ul')!.scrollTop).toBe(50)
  })

  it('conteúdo ainda curto (dados carregando): aplica o possível e devolve false', () => {
    const root = build('<section></section>')
    const section = root.querySelector('section')!
    const ctl = scrollable(section, { maxTop: 100 })

    expect(applyScroll(root, [{ path: [0], top: 300, left: 0 }])).toBe(false)
    expect(section.scrollTop).toBe(100)

    ctl.setMax(1000)
    expect(applyScroll(root, [{ path: [0], top: 300, left: 0 }])).toBe(true)
    expect(section.scrollTop).toBe(300)
  })

  it('elemento ainda não renderizado devolve false', () => {
    const root = build('<section></section>')
    expect(applyScroll(root, [{ path: [0, 2], top: 10, left: 0 }])).toBe(false)
  })

  it('lista vazia já está concluída', () => {
    expect(applyScroll(build(''), [])).toBe(true)
  })
})
