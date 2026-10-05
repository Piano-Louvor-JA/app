import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STAGE_SETTINGS,
  parseStageSettings,
  serializeStageSettings,
} from '../stage-settings'

/**
 * Teste-gêmeo (paridade web ↔ app, task P1): a MESMA tabela de configs JSON
 * (chaves do APK) deve produzir o MESMO estilo final calculado na projeção.
 * O web tem a tabela espelhada em
 * pianolouvorja/web src/modules/settings/__tests__/stage-settings-lyric.test.ts
 */
const CONFIG_TABLE: Record<string, Record<string, unknown>> = {
  herdaTudo: {},
  overrideCompleto: {
    size: 120,
    weight: 800,
    fg: '#FFE9A8',
    tsOn: true,
    tsBlur: 2.2,
    tsInt: 0.8,
    lSize: 150,
    lWeight: 400,
    lFg: '#00C1E6',
    lUpper: true,
    tsOnL: false,
  },
  overridesParciais: {
    size: 96,
    weight: 600,
    lSize: 60,
  },
  forasDeFaixa: {
    size: 999,
    lSize: 999,
    lWeight: 9999,
    lFg: 'vermelho',
  },
}

/** Estilo final da estrofe, calculado como a MediaProjectionView faz. */
function effectiveLyricStyle(raw: Record<string, unknown>) {
  const st = parseStageSettings(raw)
  return {
    fontSizePx: st.lyricFontSize ?? st.fontSize,
    fontWeight: st.lyricFontWeight ?? st.fontWeight,
    color: st.lyricTextColor ?? st.textColor,
    textShadow: st.lyricTextShadow ?? st.textShadow,
    textTransform: st.lyricUpperCase ? 'uppercase' : 'none',
  }
}

describe('teste-gêmeo app↔web: mesma tabela de configs → mesmo estilo', () => {
  it('herdaTudo: estilo = geral (defaults)', () => {
    expect(effectiveLyricStyle(CONFIG_TABLE.herdaTudo)).toEqual({
      fontSizePx: 96,
      fontWeight: 600,
      color: '#FFFFFF',
      textShadow: true,
      textTransform: 'none',
    })
  })

  it('overrideCompleto: todos os lyric* aplicam', () => {
    const style = effectiveLyricStyle(CONFIG_TABLE.overrideCompleto)
    expect(style.fontSizePx).toBe(150)
    expect(style.fontWeight).toBe(400)
    expect(style.color).toBe('#00C1E6')
    expect(style.textShadow).toBe(false)
    expect(style.textTransform).toBe('uppercase')
  })

  it('overridesParciais: lyric sobrepõe só o que existe', () => {
    const style = effectiveLyricStyle(CONFIG_TABLE.overridesParciais)
    expect(style.fontSizePx).toBe(60)
    expect(style.fontWeight).toBe(600)
  })

  it('forasDeFaixa: clampa como o web (60–160, pesos válidos, cor hex)', () => {
    const s = parseStageSettings(CONFIG_TABLE.forasDeFaixa)
    expect(s.lyricFontSize).toBe(160)
    expect(s.lyricFontWeight).toBeNull()
    expect(s.lyricTextColor).toBe('#FFFFFF') // cor inválida → fallback do estilo geral
  })

  it('serialize↔parse roundtrip preserva os lyric* (chaves APK lSize/lWeight/lFg/lUpper/tsOnL)', () => {
    const parsed = parseStageSettings(CONFIG_TABLE.overrideCompleto)
    const ser = serializeStageSettings(parsed)
    expect(ser.lSize).toBe(150)
    expect(ser.lWeight).toBe(400)
    expect(ser.lFg).toBe('#00C1E6')
    expect(ser.lUpper).toBe(true)
    expect(ser.tsOnL).toBe(false)
    const roundtrip = parseStageSettings(serializeStageSettings(parsed))
    expect(roundtrip.lyricFontSize).toBe(parsed.lyricFontSize)
    expect(roundtrip.lyricFontWeight).toBe(parsed.lyricFontWeight)
    expect(roundtrip.lyricTextColor).toBe(parsed.lyricTextColor)
    expect(roundtrip.lyricUpperCase).toBe(parsed.lyricUpperCase)
    expect(roundtrip.lyricTextShadow).toBe(parsed.lyricTextShadow)
  })

  it('defaults: lyric* nulos = herda', () => {
    expect(DEFAULT_STAGE_SETTINGS.lyricFontSize).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.lyricFontWeight).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.lyricTextColor).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.lyricUpperCase).toBe(false)
    expect(DEFAULT_STAGE_SETTINGS.lyricTextShadow).toBeNull()
  })
})
