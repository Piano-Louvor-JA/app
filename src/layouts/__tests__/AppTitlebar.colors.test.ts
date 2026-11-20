// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const titlebar = readFileSync(new URL('../AppTitlebar.vue', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../AppShell.vue', import.meta.url), 'utf8')

function rule(source: string, selector: string): string {
  const match = source.match(new RegExp(`\\n${selector.replace('.', '\\.')} \\{([^}]*)\\}`))
  expect(match, `regra ${selector}`).not.toBeNull()
  return match![1]
}

function declaration(body: string, property: string): string {
  return body.match(new RegExp(`\\n\\s*${property}:\\s*([^;]+);`))?.[1].trim() ?? ''
}

describe('barra de título x header do app', () => {
  const bar = rule(titlebar, '.app-titlebar')
  const header = rule(shell, '.app-shell__header')

  it('fundo da barra de título se distingue do header', () => {
    expect(declaration(bar, 'background')).not.toBe(declaration(header, 'background'))
  })

  it('o tom segue o tema: mistura a cor do texto com a superfície (clareia no escuro, escurece no claro)', () => {
    expect(declaration(bar, 'background')).toMatch(
      /^color-mix\(in srgb, var\(--ds-color-on-surface\) \d+%, var\(--ds-color-surface(, #[0-9a-f]+)?\)\)$/i,
    )
  })

  it('borda inferior mais marcada que a do header', () => {
    expect(declaration(bar, 'border-bottom')).toContain('var(--ds-color-outline-strong')
    expect(declaration(header, 'border-bottom')).toContain('var(--ds-color-outline)')
  })
})
