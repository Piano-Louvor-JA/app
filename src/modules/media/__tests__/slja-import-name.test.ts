import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * RF-02 (SPEC-crud-comunidade-hub-v1.0.0): import .slja — um arquivo = uma
 * coletânea própria (nome derivado do arquivo), renomeável depois. Nada de
 * coletânea agrupadora "Importações .slja" para imports novos.
 *
 * helper alvo: deriveImportCollectionName(fileName, existingNames)
 *  - "ENCONTRO ESPECIAL.slja" → "ENCONTRO ESPECIAL"
 *  - colisão → "ENCONTRO ESPECIAL (2)", "(3)"...
 *  - .slja.zip → mesma regra
 */

import { deriveImportCollectionName } from '../slja-import-name'

describe('deriveImportCollectionName (RF-02)', () => {
  it('deriva o nome do arquivo sem extensão', () => {
    expect(deriveImportCollectionName('ENCONTRO ESPECIAL.slja', [])).toBe('ENCONTRO ESPECIAL')
  })

  it('aceita wrapper .slja.zip (WhatsApp)', () => {
    expect(deriveImportCollectionName('missa.slja.zip', [])).toBe('missa')
  })

  it('adiciona sufixo (2) em colisão com coletânea existente', () => {
    expect(deriveImportCollectionName('Culto.slja', ['Culto'])).toBe('Culto (2)')
  })

  it('incrementa sufixo até achar nome livre', () => {
    expect(deriveImportCollectionName('Culto.slja', ['Culto', 'Culto (2)', 'Culto (3)'])).toBe('Culto (4)')
  })

  it('colisão é case-insensitive (dedupe por nome)', () => {
    expect(deriveImportCollectionName('culto.slja', ['Culto'])).toBe('culto (2)')
  })

  it('nome vazio após strip cai em fallback Importação', () => {
    expect(deriveImportCollectionName('.slja', [])).toBe('Importação')
  })
})
