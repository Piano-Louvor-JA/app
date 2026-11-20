// @vitest-environment node
/**
 * Guarda de i18n — toda chave `t('announcements.…')` literal do módulo DEVE
 * existir nos 3 locales, e os 3 locales têm as mesmas chaves.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import es from '../locales/es'
import ptBR from '../locales/pt-BR'

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

const MODULE_DIR = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'locales' ? [] : sourceFiles(path)
    }
    return /\.(vue|ts)$/.test(entry.name) ? [path] : []
  })
}

const usedKeys = [
  ...new Set(
    sourceFiles(MODULE_DIR).flatMap((file) =>
      [...readFileSync(file, 'utf-8').matchAll(/\bt\(\s*['"](announcements\.[^'"]+)['"]/g)].map((m) => m[1]!),
    ),
  ),
]

describe('guarda i18n dos Avisos — nenhuma chave vazando', () => {
  it('encontra as chaves usadas no módulo', () => {
    expect(usedKeys).toContain('announcements.title')
  })

  it.each([
    ['pt-BR', ptBR],
    ['en', en],
    ['es', es],
  ])('todas as chaves literais existem em %s', (_locale, messages) => {
    const defined = flatten(messages as Nested)
    expect(usedKeys.filter((key) => !defined.has(key))).toEqual([])
  })

  it('os 3 locales têm as mesmas chaves', () => {
    const keys = [ptBR, en, es].map((messages) => [...flatten(messages as Nested)].sort())
    expect(keys[1]).toEqual(keys[0])
    expect(keys[2]).toEqual(keys[0])
  })
})
