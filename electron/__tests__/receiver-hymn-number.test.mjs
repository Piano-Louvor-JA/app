// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Número do hino na capa do hinário, no receiver do palco (TVs, navegador, OBS).
const html = readFileSync(fileURLToPath(new URL('../palco/receiver.html', import.meta.url)), 'utf8')
const fn = (name) => {
  const start = html.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`sem ${name}`)
  let depth = 0
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1)
  }
  throw new Error(`fim de ${name}`)
}

/** DOM mínimo: só o que applyHymnNumber usa. */
function fakeText() {
  const children = []
  const el = {
    children,
    prepend(node) {
      children.unshift(node)
      node.parent = el
    },
    querySelectorAll(sel) {
      const cls = sel.slice(1)
      return children.filter((c) => c.className === cls)
    },
  }
  return el
}
const doc = {
  createElement() {
    const node = { className: '', textContent: '', style: { fontSize: '', color: '' }, remove() { const i = node.parent.children.indexOf(node); if (i >= 0) node.parent.children.splice(i, 1) } }
    return node
  },
}
function apply(target, m) {
  // eslint-disable-next-line no-new-func
  return new Function('document', 't', 'm', `${fn('applyHymnNumber')}\nreturn applyHymnNumber(t, m)`)(doc, target, m)
}
function applyName(target, m) {
  // eslint-disable-next-line no-new-func
  return new Function('document', 't', 'm', `${fn('applyHymnalName')}\nreturn applyHymnalName(t, m)`)(doc, target, m)
}

describe('receiver: número do hino na capa', () => {
  it('capa com número: entra acima do título, no tamanho mandado (px@1080 → vw)', () => {
    const t = fakeText()
    apply(t, { isCover: true, hymnNumber: 1, hymnNumberSize: 216 })
    expect(t.children).toHaveLength(1)
    expect(t.children[0].className).toBe('hymn-no')
    expect(t.children[0].textContent).toBe('1')
    // 216 px@1080 = 384 px@1920 = 20vw
    expect(t.children[0].style.fontSize).toBe('20vw')
  })

  it('o app de celular manda px@1920 (fontRef 1920)', () => {
    const t = fakeText()
    apply(t, { isCover: true, hymnNumber: 7, hymnNumberSize: 192, fontRef: 1920 })
    expect(t.children[0].style.fontSize).toBe('10vw')
  })

  it('troca de slide: o número antigo sai; estrofe ou sem número, nada', () => {
    const t = fakeText()
    apply(t, { isCover: true, hymnNumber: 1, hymnNumberSize: 216 })
    apply(t, { isCover: false, hymnNumber: 1 })
    expect(t.children).toHaveLength(0)
    apply(t, { isCover: true })
    apply(t, { isCover: true, hymnNumber: '1' })
    expect(t.children).toHaveLength(0)
  })
})

describe('receiver: nome do hinário na capa', () => {
  it('entra acima do número, com tamanho e cor; ordem: nome, número, título', () => {
    const t = fakeText()
    const m = { isCover: true, hymnNumber: 1, hymnNumberSize: 108, hymnalName: 'Hinário Adventista', hymnalNameSize: 27, hymnalNameColor: '#F6C32A' }
    apply(t, m)
    applyName(t, m)
    expect(t.children.map((c) => c.className)).toEqual(['hymnal-name', 'hymn-no'])
    expect(t.children[0].textContent).toBe('Hinário Adventista')
    // 27 px@1080 = 48 px@1920 = 2.5vw
    expect(t.children[0].style.fontSize).toBe('2.5vw')
    expect(t.children[0].style.color).toBe('#F6C32A')
  })

  it('estrofe, sem nome ou escondido: nada (e o antigo sai)', () => {
    const t = fakeText()
    applyName(t, { isCover: true, hymnalName: 'Hinário Adventista', hymnalNameSize: 27 })
    applyName(t, { isCover: false, hymnalName: 'Hinário Adventista' })
    expect(t.children).toHaveLength(0)
    applyName(t, { isCover: true })
    expect(t.children).toHaveLength(0)
  })
})
