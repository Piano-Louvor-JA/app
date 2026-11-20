import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFitLines } from '../useFitLines'

afterEach(() => vi.restoreAllMocks())

describe('texto de projeção em duas linhas', () => {
  function text(height: () => number, lineHeight = '10px') {
    const el = document.createElement('div')
    el.innerHTML = 'Fé<br>esperança<BR />paz'
    Object.defineProperty(el, 'clientHeight', { get: height })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ lineHeight } as CSSStyleDeclaration)
    return el
  }

  it('ignora elemento ausente e tamanho inválido sem alterar o conteúdo', async () => {
    const el = text(() => 10)
    const original = el.innerHTML
    const { fitText } = useFitLines()
    await fitText(null, 5)
    for (const base of [0, -1, Number.NaN]) await fitText(el, base)
    expect(el.innerHTML).toBe(original)
    expect(el.style.fontSize).toBe('')
  })

  it('substitui quebras por espaço e mantém a fonte quando cabe em duas linhas', async () => {
    const el = text(() => 20)
    await useFitLines().fitText(el, 5)
    expect(el.innerHTML).toBe('Fé esperança paz')
    expect(el.style.fontSize).toBe('5cqw')
  })

  it('reduz a fonte até a medição caber e interrompe a redução', async () => {
    let el: HTMLElement
    el = text(() => Number.parseFloat(el.style.fontSize) > 4 ? 30 : 20)
    await useFitLines().fitText(el, 5)
    expect(el.style.fontSize).toBe('3.612cqw')
  })

  it('limita o trabalho a doze reduções mesmo quando a altura nunca cabe', async () => {
    const height = vi.fn(() => 1000)
    const el = text(height)
    await useFitLines().fitText(el, 5)
    expect(height).toHaveBeenCalledTimes(12)
    expect(el.style.fontSize).toBe(`${(5 * 0.85 ** 12).toFixed(3)}cqw`)
  })

  it('tolera line-height não numérico e altura zero', async () => {
    const el = text(() => 0, 'normal')
    await useFitLines().fitText(el, 5)
    expect(el.style.fontSize).toBe('5cqw')
  })
})
