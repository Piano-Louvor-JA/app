import { describe, expect, it } from 'vitest'

import {
  officialToneAssets,
  type SabbathAudioLang,
  resolveSabbathSchoolAudio,
  resolveSabbathSchoolAudioLang,
} from '../alert-tone'

describe('resolveSabbathSchoolAudioLang', () => {
  it('auto segue locale suportado', () => {
    expect(resolveSabbathSchoolAudioLang('auto', 'pt-BR')).toBe('pt-BR')
    expect(resolveSabbathSchoolAudioLang('auto', 'en')).toBe('en')
    expect(resolveSabbathSchoolAudioLang('auto', 'es')).toBe('es')
  })

  it('auto com locale não mapeado cai em pt-BR', () => {
    expect(resolveSabbathSchoolAudioLang('auto', 'fr')).toBe('pt-BR')
    expect(resolveSabbathSchoolAudioLang('auto', 'xx-YY')).toBe('pt-BR')
  })

  it('fr explícito funciona sem locale FR na UI', () => {
    expect(resolveSabbathSchoolAudioLang('fr', 'pt-BR')).toBe('fr')
  })

  it('valor inválido vira auto', () => {
    expect(resolveSabbathSchoolAudioLang('de', 'en')).toBe('en')
    expect(resolveSabbathSchoolAudioLang('zzz', 'xx')).toBe('pt-BR')
  })
})

describe('resolveSabbathSchoolAudio', () => {
  const trackKeys = ['abertura_es', '5min_es', '1min_es'] as const

  it('manifesto cobre 4 idiomas × 3 faixas', () => {
    for (const key of trackKeys) {
      for (const lang of ['pt-BR', 'es', 'en', 'fr'] as const) {
        const entry = officialToneAssets[key][lang]
        expect(entry.url).toBeTruthy()
        expect(entry.durationMs).toBeGreaterThan(0)
      }
    }
  })

  it('pt-BR resolve o asset original sem sufixo de idioma', () => {
    expect(resolveSabbathSchoolAudio('abertura_es', 'pt-BR').url).toContain('abertura_escsb.mp3')
    expect(resolveSabbathSchoolAudio('5min_es', 'pt-BR').url).toContain('5minutos_escsb.mp3')
    expect(resolveSabbathSchoolAudio('1min_es', 'pt-BR').url).toContain('1minuto_escsb.mp3')
  })

  it('locale traduzido usa asset localizado com duração do manifesto', () => {
    const en = resolveSabbathSchoolAudio('5min_es', 'en')
    expect(en.url).toContain('5minutos_escsb_en.mp3')
    expect(en.url).not.toBe(resolveSabbathSchoolAudio('5min_es', 'pt-BR').url)
    // Mix preso ao instrumental original: durações conferem com ffprobe dos assets
    expect(en.durationMs).toBe(18_000)
    expect(resolveSabbathSchoolAudio('1min_es', 'fr').durationMs).toBe(65_500)
  })

  it('idioma sem asset para a faixa cai no PT correspondente', () => {
    expect(resolveSabbathSchoolAudio('abertura_es', 'de')).toMatchObject(
      resolveSabbathSchoolAudio('abertura_es', 'pt-BR'),
    )
  })
})
