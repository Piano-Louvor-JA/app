import DOMPurify from 'dompurify'

/**
 * Texto formatado das anotações da liturgia. O HTML do editor passa sempre por aqui: só as tags de
 * formatação e uma lista fechada de estilos sobrevivem (o conteúdo também chega por sincronização e
 * importação). `subtitle` guarda a versão em texto puro para quem não entende formatação.
 */
/** Cores de texto das anotações: editor e cor do título usam a mesma paleta. */
export const NOTES_TEXT_COLORS = [
  '#ffffff', '#bdbdbd', '#ffee58', '#ffb74d', '#ff6d00', '#ef5350',
  '#f06292', '#ab47bc', '#42a5f5', '#26c6da', '#66bb6a',
]

/** Cor do título da anotação: só hex de 6 dígitos; o resto vira vazio (cor padrão). */
export function normalizeTitleColor(value: unknown): string {
  const color = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^#[\da-f]{6}$/.test(color) ? color : ''
}

const ALLOWED_TAGS = ['p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li']
const BLOCK_TAGS = new Set(['P', 'DIV', 'UL', 'OL', 'LI'])

const COLOR = /^(#[\da-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|transparent)$/i
const STYLE_RULES: Record<string, (value: string) => boolean> = {
  'color': (v) => COLOR.test(v),
  'background-color': (v) => COLOR.test(v),
  'font-size': (v) => /^(x-small|small|medium|large|x-large|xx-large|xxx-large)$/.test(v),
  'font-weight': (v) => /^(bold|bolder|normal|[1-9]00)$/.test(v),
  'font-style': (v) => /^(italic|normal)$/.test(v),
  'text-decoration': (v) => /^(underline|line-through|none)$/.test(v),
  'text-decoration-line': (v) => /^(underline|line-through|none)$/.test(v),
  'text-align': (v) => /^(left|center|right|justify|start|end)$/.test(v),
}

/** Só as propriedades permitidas, no formato `prop: valor;` (o CSS das notas casa por esse texto). */
export function filterNotesStyle(style: string): string {
  return style
    .split(';')
    .map((declaration) => {
      const colon = declaration.indexOf(':')
      if (colon < 0) return ''
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      const value = declaration.slice(colon + 1).trim().toLowerCase().replace(/\s+/g, ' ')
      return STYLE_RULES[prop]?.(value) ? `${prop}: ${value};` : ''
    })
    .filter(Boolean)
    .join(' ')
}

let purifier: ReturnType<typeof DOMPurify> | null = null

function getPurifier(): ReturnType<typeof DOMPurify> | null {
  if (purifier) return purifier
  if (typeof window === 'undefined') return null
  const instance = DOMPurify(window)
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'style') return
    data.attrValue = filterNotesStyle(data.attrValue)
    if (!data.attrValue) data.keepAttr = false
  })
  purifier = instance
  return instance
}

function textOf(node: Node): string {
  let text = ''
  const newline = () => {
    if (text && !text.endsWith('\n')) text += '\n'
  }
  node.childNodes.forEach((child) => {
    if (child instanceof Text) {
      text += child.data
      return
    }
    if (!(child instanceof Element)) return
    if (child.nodeName === 'BR') {
      text += '\n'
      return
    }
    const inner = textOf(child)
    if (child.nodeName === 'LI') {
      const list = child.parentElement!
      const index = Array.prototype.indexOf.call(list.children, child)
      newline()
      text += `${list.nodeName === 'OL' ? `${index + 1}.` : '•'} ${inner.replace(/\n+$/, '')}\n`
    } else if (BLOCK_TAGS.has(child.nodeName)) {
      newline()
      text += inner
      newline()
    } else {
      text += inner
    }
  })
  return text
}

function parse(html: string): Document | null {
  return typeof DOMParser === 'undefined' ? null : new DOMParser().parseFromString(html, 'text/html')
}

/** Texto puro do HTML das notas: blocos e `<br>` viram quebras de linha, listas ganham marcador. */
export function notesHtmlToPlainText(html: string): string {
  const doc = parse(html)
  // Sem parser, remova os delimitadores numa só passagem, inclusive tags incompletas.
  let fallback = ''
  let insideTag = false
  if (!doc) {
    for (const char of html) {
      if (char === '<') insideTag = true
      else if (char === '>' && insideTag) insideTag = false
      else if (!insideTag) fallback += char
    }
  }
  const raw = doc ? textOf(doc.body) : fallback
  return raw
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** HTML limpo; vazio quando não sobra texto. Sem DOM (fora do app) não há como limpar: descarta. */
export function sanitizeNotesHtml(html: string | null | undefined): string {
  const value = (html ?? '').trim()
  if (!value) return ''
  const instance = getPurifier()
  if (!instance) return ''
  const clean = instance.sanitize(value, { ALLOWED_TAGS, ALLOWED_ATTR: ['style'] }).trim()
  return notesHtmlToPlainText(clean) ? clean : ''
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texto puro (anotação antiga) como HTML do editor, uma linha por bloco. */
export function plainTextToNotesHtml(text: string): string {
  if (!text.trim()) return ''
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>'))
    .join('')
}
