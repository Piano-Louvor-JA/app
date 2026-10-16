/**
 * Rolagem das telas para "voltar onde estava": captura a posição dos
 * elementos rolados dentro de uma raiz (o <main> do AppShell) e reaplica
 * depois. Os elementos são achados pelo caminho de índices a partir da raiz,
 * porque as telas são recriadas a cada troca de rota.
 */

export interface ScrollMark {
  /** Índices de `children` da raiz até o elemento. */
  path: number[]
  top: number
  left: number
}

/** Diferença tolerada (px) ao conferir se a posição foi alcançada. */
const TOLERANCE = 2

export function elementAtPath(root: Element, path: number[]): Element | null {
  let current: Element | null = root
  for (const index of path) {
    current = current?.children[index] ?? null
  }
  return current
}

/** Caminho de índices da raiz até `el` (que precisa estar dentro dela). */
function pathTo(root: Element, el: Element): number[] {
  const path: number[] = []
  let current: Element = el
  while (current !== root) {
    const parent = current.parentElement as Element
    path.unshift(Array.prototype.indexOf.call(parent.children, current))
    current = parent
  }
  return path
}

/** Ordem do documento (busca em profundidade) = ordem lexicográfica dos caminhos. */
function byDocumentOrder(a: ScrollMark, b: ScrollMark): number {
  for (let i = 0; i < Math.min(a.path.length, b.path.length); i++) {
    if (a.path[i] !== b.path[i]) return a.path[i] - b.path[i]
  }
  return a.path.length - b.path.length
}

/**
 * Posições dos elementos com rolagem diferente de zero. Com `candidates`
 * (os elementos que dispararam scroll), mede só eles — telas enormes (Hinário,
 * ~14 mil elementos) não são percorridas inteiras.
 */
export function captureScroll(root: Element, candidates?: Iterable<Element>): ScrollMark[] {
  if (candidates) {
    const marks: ScrollMark[] = []
    for (const el of candidates) {
      if (el === root || !root.contains(el)) continue
      if (el.scrollTop > 0 || el.scrollLeft > 0) {
        marks.push({ path: pathTo(root, el), top: el.scrollTop, left: el.scrollLeft })
      }
    }
    return marks.sort(byDocumentOrder)
  }
  const marks: ScrollMark[] = []
  const walk = (el: Element, path: number[]) => {
    Array.from(el.children).forEach((child, index) => {
      const childPath = [...path, index]
      if (child.scrollTop > 0 || child.scrollLeft > 0) {
        marks.push({ path: childPath, top: child.scrollTop, left: child.scrollLeft })
      }
      walk(child, childPath)
    })
  }
  walk(root, [])
  return marks
}

/**
 * Aplica as posições que já for possível. Devolve `true` quando todas foram
 * alcançadas; `false` quando algum elemento ainda não existe ou o conteúdo
 * ainda não tem altura suficiente (dados carregando) — tentar de novo depois.
 */
export function applyScroll(root: Element, marks: ScrollMark[]): boolean {
  let done = true
  for (const mark of marks) {
    const el = elementAtPath(root, mark.path)
    if (!el) {
      done = false
      continue
    }
    el.scrollTop = mark.top
    el.scrollLeft = mark.left
    if (Math.abs(el.scrollTop - mark.top) > TOLERANCE || Math.abs(el.scrollLeft - mark.left) > TOLERANCE) {
      done = false
    }
  }
  return done
}
