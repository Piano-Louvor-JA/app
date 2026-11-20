// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolveAppLocale } from '../locale.mjs'

describe('resolveAppLocale', () => {
  it('retorna pt-BR para pt-BR exato', () => {
    expect(resolveAppLocale('pt-BR')).toBe('pt-BR')
  })

  it('retorna en para en-US', () => {
    expect(resolveAppLocale('en-US')).toBe('en')
  })

  it('retorna es para es-ES', () => {
    expect(resolveAppLocale('es-ES')).toBe('es')
  })

  it('retorna es para es-419', () => {
    expect(resolveAppLocale('es-419')).toBe('es')
  })

  it('retorna pt-BR para pt-PT (match por prefixo)', () => {
    expect(resolveAppLocale('pt-PT')).toBe('pt-BR')
  })

  it('retorna en para en-GB (match por prefixo)', () => {
    expect(resolveAppLocale('en-GB')).toBe('en')
  })

  it('retorna pt-BR para locale não suportado (fr-FR)', () => {
    expect(resolveAppLocale('fr-FR')).toBe('pt-BR')
  })

  it('retorna pt-BR para locale vazio', () => {
    expect(resolveAppLocale('')).toBe('pt-BR')
  })

  it('retorna pt-BR para locale malformado', () => {
    expect(resolveAppLocale('xyz')).toBe('pt-BR')
  })

  it('é case-insensitive (PT-BR vs pt-BR)', () => {
    expect(resolveAppLocale('PT-BR')).toBe('pt-BR')
  })
})
