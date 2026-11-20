import { describe, expect, it } from 'vitest'
import { parseStageSettings, serializeStageSettings, DEFAULT_STAGE_SETTINGS } from '../stage-settings'

describe('stage-settings title (1o slide)', () => {
  it('default herda estilo geral (title* = null)', () => {
    expect(DEFAULT_STAGE_SETTINGS.titleFontSize).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.titleTextColor).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.titleUpperCase).toBe(false)
  })
  it('parse lê tSize/tWeight/tFg/tUpper/tsOnT', () => {
    const p = parseStageSettings({ tSize: 130, tWeight: 800, tFg: '#FF0000', tUpper: true, tsOnT: false })
    expect(p.titleFontSize).toBe(130)
    expect(p.titleFontWeight).toBe(800)
    expect(p.titleTextColor).toBe('#FF0000')
    expect(p.titleUpperCase).toBe(true)
    expect(p.titleTextShadow).toBe(false)
  })
  it('parse sem chaves = null (compat salvos antigos)', () => {
    const p = parseStageSettings({})
    expect(p.titleFontSize).toBeNull()
    expect(p.titleFontWeight).toBeNull()
    expect(p.titleTextColor).toBeNull()
    expect(p.titleTextShadow).toBeNull()
  })
  it('round-trip preserva overrides; ausentes nao poluem payload', () => {
    const custom = { ...DEFAULT_STAGE_SETTINGS, titleFontSize: 140, titleUpperCase: true }
    const ser = serializeStageSettings(custom)
    expect(ser['tSize']).toBe(140)
    expect(ser['tUpper']).toBe(true)
    const back = parseStageSettings(ser)
    expect(back.titleFontSize).toBe(140)
    expect(back.titleUpperCase).toBe(true)
    const clean = serializeStageSettings({ ...DEFAULT_STAGE_SETTINGS })
    expect('tSize' in clean).toBe(false)
    expect('tWeight' in clean).toBe(false)
  })
  it('clamp de tamanho 60-160', () => {
    expect(parseStageSettings({ tSize: 999 }).titleFontSize).toBe(160)
    expect(parseStageSettings({ tSize: 10 }).titleFontSize).toBe(60)
  })
})
