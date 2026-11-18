// @vitest-environment jsdom
// RF-02 (SPEC-crud-comunidade-hub v1.0.0): import .slja = 1 coletânea por
// arquivo. Nome = título do conteúdo; colisão com coletânea do usuário →
// sufixo "(2)", "(3)"... Nunca agrupa numa "Importações .slja".
import { describe, expect, it } from 'vitest'
import {
  collectionNameForImport,
  stripSljaExtension,
} from '../import-collection-name'

describe('stripSljaExtension', () => {
  it('remove .slja do nome do arquivo', () => {
    expect(stripSljaExtension('Natal 2026.slja')).toBe('Natal 2026')
  })
  it('remove .slja.zip (wrapper do WhatsApp)', () => {
    expect(stripSljaExtension('Natal 2026.slja.zip')).toBe('Natal 2026')
  })
  it('nome sem extensão: intacto', () => {
    expect(stripSljaExtension('Natal 2026')).toBe('Natal 2026')
  })
})

describe('collectionNameForImport — RF-02', () => {
  const names = (...xs: string[]) => xs.map((name) => ({ name }))

  it('sem colisão: título puro, sem sufixo', () => {
    expect(collectionNameForImport('Natal', names('Louvor'))).toBe('Natal')
  })

  it('colisão: sufixo (2)', () => {
    expect(collectionNameForImport('Natal', names('Natal'))).toBe('Natal (2)')
  })

  it('colisão dupla: sufixo (3)', () => {
    expect(collectionNameForImport('Natal', names('Natal', 'Natal (2)'))).toBe(
      'Natal (3)',
    )
  })

  it('colisão com o SUFIXO existente: pula pra seguinte', () => {
    expect(
      collectionNameForImport('Natal', names('Natal', 'Natal (2)', 'Natal (4)')),
    ).toBe('Natal (3)')
    expect(
      collectionNameForImport('Natal', names('Natal', 'Natal (2)', 'Natal (3)')),
    ).toBe('Natal (4)')
  })

  it('dois arquivos do mesmo título: nomes distintos', () => {
    const existing: Array<{ name: string }> = []
    const n1 = collectionNameForImport('Natal', existing)
    existing.push({ name: n1 })
    const n2 = collectionNameForImport('Natal', existing)
    existing.push({ name: n2 })
    expect(n1).toBe('Natal')
    expect(n2).toBe('Natal (2)')
    expect(n1).not.toBe(n2)
  })

  it('case-insensitive na colisão (comportamento do storage)', () => {
    expect(collectionNameForImport('natal', names('Natal'))).toBe('natal (2)')
  })

  it('ignora coletânea legada "Importações .slja" como colisão semântica', () => {
    // legadas FICAM (SPEC), mas não interferem no nome novo
    expect(collectionNameForImport('Natal', names('Importações .slja'))).toBe(
      'Natal',
    )
  })
})
