/**
 * Guarda de i18n — toda chave `t()` literal dos componentes de liturgia e
 * toda chave gerada dinamicamente (scheduledKind.*, liturgy.types.*) DEVE
 * existir nos 3 locales. Escapes de leak: template mostra o caminho cru.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Nested = Record<string, unknown>

function flatten(obj: Nested, prefix = ''): Set<string> {
  const out = new Set<string>()
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') for (const child of flatten(v as Nested, key)) out.add(child)
    else out.add(key)
  }
  return out
}

function loadLocale(path: string): Nested {
  // locales usam `export default {` — converte pra ESM avaliável via import dinâmico
  return (globalThis as never as Record<string, Nested>)[path] ?? ({} as Nested)
}

const liturgyPt = flatten((await import('../locales/pt-BR')).default as Nested)
const liturgyEn = flatten((await import('../locales/en')).default as Nested)
const liturgyEs = flatten((await import('../locales/es')).default as Nested)
const commonPt = flatten((await import('@locales/pt-BR')).default as Nested)
const commonEn = flatten((await import('@locales/en')).default as Nested)
const commonEs = flatten((await import('@locales/es')).default as Nested)

/** Extrai chaves t('...') literais de um arquivo fonte. */
function usedKeys(src: string): string[] {
  return [...src.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!)
}

const SOURCES = [
  '../components/LiturgyScheduledDialog.vue',
  '../components/LiturgyTimelineItem.vue',
  '../components/LiturgyTimeline.vue',
  '../views/LiturgyView.vue',
] as const

const scriptOf = (file: string) => {
  const raw = readFileSync(new URL(file, import.meta.url), 'utf-8')
  return raw
}

describe('guarda i18n — nenhuma chave com leak', () => {
  const all = SOURCES.flatMap((f) => usedKeys(scriptOf(f)))

  it('todas as chaves literais existem em pt-BR, en e es', () => {
    const missing: string[] = []
    for (const key of new Set(all)) {
      const inPt = liturgyPt.has(key) || commonPt.has(key)
      const inEn = liturgyEn.has(key) || commonEn.has(key)
      const inEs = liturgyEs.has(key) || commonEs.has(key)
      if (!inPt || !inEn || !inEs) missing.push(`${key} (pt=${inPt} en=${inEn} es=${inEs})`)
    }
    expect(missing, `chaves vazando:\n${missing.join('\n')}`).toEqual([])
  })

  it('chaves dinâmicas scheduledKind.* e types.scheduled existem nos 3 locales', () => {
    for (const kind of ['music', 'file', 'verse', 'annotation', 'onlineVideo']) {
      const key = `liturgy.messages.scheduledKind.${kind}`
      expect(liturgyPt.has(key), `pt faltando ${key}`).toBe(true)
      expect(liturgyEn.has(key), `en faltando ${key}`).toBe(true)
      expect(liturgyEs.has(key), `es faltando ${key}`).toBe(true)
    }
    for (const set of [liturgyPt, liturgyEn, liturgyEs]) {
      expect(set.has('liturgy.types.scheduled')).toBe(true)
    }
  })

  it('nenhuma chave com prefixo duplicado scheduledScheduled sobrou nos locales', () => {
    for (const set of [liturgyPt, liturgyEn, liturgyEs]) {
      expect([...set].filter((k) => k.includes('scheduledScheduled'))).toEqual([])
    }
  })
})

describe('chaves dinâmicas por kind do store (snake_case da API)', () => {
  it('scheduledKind.<kind do store> existe para TODOS os kinds conhecidos', () => {
    const kinds = ['music', 'file', 'verse', 'annotation', 'online_video'] as const
    for (const kind of kinds) {
      const key = `liturgy.messages.scheduledKind.${kind}`
      expect(liturgyPt.has(key), `pt faltando ${key} (cru do store)`).toBe(true)
      expect(liturgyEn.has(key), `en faltando ${key} (cru do store)`).toBe(true)
      expect(liturgyEs.has(key), `es faltando ${key} (cru do store)`).toBe(true)
    }
  })
})
