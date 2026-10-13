// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STAGE_SETTINGS,
  parseStageSettings,
  serializeStageSettings,
} from '../stage-settings'

/**
 * Null-first para TODAS as cores (13/10 Rafael): cor só existe se o usuário
 * escolher — mesmo contrato do backgroundColor (bg). Defaults de FÁBRICA
 * (#FFFFFF etc.) não são escolha e não podem nascer setados.
 */
describe('stage-settings — cores de texto null-first', () => {
  it('defaults: cores de texto nulas = herda o padrão de render', () => {
    expect(DEFAULT_STAGE_SETTINGS.textColor).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.bibleTextColor).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.footerRefColor).toBeNull()
    // title*/lyric* já eram null-first
    expect(DEFAULT_STAGE_SETTINGS.titleTextColor).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.lyricTextColor).toBeNull()
  })

  it('serialize de defaults NÃO persiste cores de texto (chave ausente)', () => {
    const ser = serializeStageSettings({ ...DEFAULT_STAGE_SETTINGS })
    expect(ser).not.toHaveProperty('fg')
    expect(ser).not.toHaveProperty('bFg')
    expect(ser).not.toHaveProperty('refColor')
  })

  it('parse sem chaves de cor → null (não #FFFFFF)', () => {
    const s = parseStageSettings({})
    expect(s.textColor).toBeNull()
    expect(s.bibleTextColor).toBeNull()
    expect(s.footerRefColor).toBeNull()
  })

  it('roundtrip preserva cor escolhida', () => {
    const s = parseStageSettings({ fg: '#FFE9A8', bFg: '#B8E0FF', refColor: '#FCCE02' })
    const ser = serializeStageSettings(s)
    expect(ser.fg).toBe('#FFE9A8')
    expect(ser.bFg).toBe('#B8E0FF')
    expect(ser.refColor).toBe('#FCCE02')
    const rt = parseStageSettings(ser)
    expect(rt.textColor).toBe('#FFE9A8')
    expect(rt.bibleTextColor).toBe('#B8E0FF')
    expect(rt.footerRefColor).toBe('#FCCE02')
  })

  it('cor inválida no storage → null (não fallback de fábrica)', () => {
    const s = parseStageSettings({ fg: 'vermelho', bFg: 'azul', refColor: 42 })
    expect(s.textColor).toBeNull()
    expect(s.bibleTextColor).toBeNull()
    expect(s.footerRefColor).toBeNull()
  })
})
