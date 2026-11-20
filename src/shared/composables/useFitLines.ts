import { nextTick } from 'vue'

/**
 * 2 LINHAS, NUNCA MAIS — paridade do receiver (05/10 Rafael):
 * (1) reflow primeiro: quebras declaradas (<br> de \\n) viram espaço — o
 *     texto usa a largura TODA disponível antes de quebrar linha;
 * (2) só então reduz a fonte (0.85x por passo) até caber em 2 linhas.
 * Aplica a QUALQUER projeção in-app (cabo/segunda tela): hinos, bíblia,
 * liturgia — mesma regra do receiver.html (fitSlideText).
 *
 * Uso: const { fitText } = useFitLines(); await fitText(el, baseCqw)
 * (el = elemento do texto; baseCqw = fonte configurada em cqw).
 */

const MAX_LINES = 2
const STEP = 0.85

function lineCountOf(el: HTMLElement): number {
  const lh = Number.parseFloat(window.getComputedStyle(el).lineHeight) || 1
  return Math.max(1, Math.round(el.clientHeight / lh))
}

export function useFitLines() {
  async function fitText(el: HTMLElement | null, base: number): Promise<void> {
    if (!el || !(base > 0)) return
    // innerHTML aqui é o MESMO conteúdo que a view já renderizou via
    // v-html (fonte confiável a montante) — o replace cirúrgico só troca
    // <br> por espaço, não introduz conteúdo novo.
    el.style.fontSize = `${base}cqw`
    el.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, ' ')
    await nextTick()
    let ratio = 1
    for (let i = 0; i < 12; i++) {
      if (lineCountOf(el) <= MAX_LINES) return
      ratio *= STEP
      el.style.fontSize = `${(base * ratio).toFixed(3)}cqw`
      await nextTick()
    }
  }

  return { fitText }
}
