import { describe, expect, it } from 'vitest'

import { DEFAULT_STAGE_SETTINGS, parseStageSettings, serializeStageSettings } from '../stage-settings'

describe('stage-settings: número do hino na capa do hinário', () => {
  it('padrão: mostra o número, grande (maior que o título)', () => {
    expect(DEFAULT_STAGE_SETTINGS.hymnNumberShow).toBe(true)
    expect(DEFAULT_STAGE_SETTINGS.hymnNumberSize).toBe(200)
  })

  it('salvos antigos (sem as chaves) ficam no padrão', () => {
    const p = parseStageSettings({})
    expect(p.hymnNumberShow).toBe(true)
    expect(p.hymnNumberSize).toBe(200)
  })

  it('roundtrip: desligar e mudar o tamanho sobrevive a salvar e ler', () => {
    const ser = serializeStageSettings({ ...DEFAULT_STAGE_SETTINGS, hymnNumberShow: false, hymnNumberSize: 320 })
    expect(ser['hnOn']).toBe(false)
    expect(ser['hnSize']).toBe(320)
    const back = parseStageSettings(ser)
    expect(back.hymnNumberShow).toBe(false)
    expect(back.hymnNumberSize).toBe(320)
  })

  it('tamanho limitado a 80–400', () => {
    expect(parseStageSettings({ hnSize: 999 }).hymnNumberSize).toBe(400)
    expect(parseStageSettings({ hnSize: 10 }).hymnNumberSize).toBe(80)
    expect(parseStageSettings({ hnSize: 'grande' }).hymnNumberSize).toBe(200)
  })
})

describe('stage-settings: nome do hinário na capa (HINÁRIO ADVENTISTA)', () => {
  it('padrão = como já era: mostra, 28 px, branco (cor não escolhida)', () => {
    expect(DEFAULT_STAGE_SETTINGS.hymnalNameShow).toBe(true)
    expect(DEFAULT_STAGE_SETTINGS.hymnalNameSize).toBe(28)
    expect(DEFAULT_STAGE_SETTINGS.hymnalNameColor).toBeNull()
    const p = parseStageSettings({})
    expect([p.hymnalNameShow, p.hymnalNameSize, p.hymnalNameColor]).toEqual([true, 28, null])
  })

  it('roundtrip: esconder, tamanho e cor sobrevivem a salvar e ler; cor não escolhida não vai', () => {
    const ser = serializeStageSettings({ ...DEFAULT_STAGE_SETTINGS, hymnalNameShow: false, hymnalNameSize: 60, hymnalNameColor: '#F6C32A' })
    expect(ser).toMatchObject({ hkOn: false, hkSize: 60, hkFg: '#F6C32A' })
    const back = parseStageSettings(ser)
    expect([back.hymnalNameShow, back.hymnalNameSize, back.hymnalNameColor]).toEqual([false, 60, '#F6C32A'])
    expect('hkFg' in serializeStageSettings({ ...DEFAULT_STAGE_SETTINGS })).toBe(false)
  })

  it('tamanho limitado a 16–80', () => {
    expect(parseStageSettings({ hkSize: 500 }).hymnalNameSize).toBe(80)
    expect(parseStageSettings({ hkSize: 2 }).hymnalNameSize).toBe(16)
  })
})
