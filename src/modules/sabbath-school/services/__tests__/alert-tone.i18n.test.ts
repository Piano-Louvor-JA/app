import { describe, expect, it } from 'vitest'

import {
  SABBATH_AUDIO_REL_DIR,
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

  it('manifesto cobre 4 idiomas × 3 faixas na pasta de mídia', () => {
    const folders = { 'pt-BR': 'pt', es: 'es', en: 'en', fr: 'fr' } as const
    for (const key of trackKeys) {
      for (const lang of ['pt-BR', 'es', 'en', 'fr'] as const) {
        const entry = resolveSabbathSchoolAudio(key, lang)
        expect(entry.url).toContain(`${SABBATH_AUDIO_REL_DIR}/${folders[lang]}/${officialToneAssets[key].file}`)
        expect(entry.durationMs).toBeGreaterThan(0)
      }
    }
  })

  it('cada faixa tem seu arquivo em Media/modulos/escola-sabatina/<idioma>', () => {
    expect(resolveSabbathSchoolAudio('abertura_es', 'pt-BR').url).toContain('modulos/escola-sabatina/pt/abertura.mp3')
    expect(resolveSabbathSchoolAudio('5min_es', 'es').url).toContain('modulos/escola-sabatina/es/5minutos.mp3')
    expect(resolveSabbathSchoolAudio('1min_es', 'en').url).toContain('modulos/escola-sabatina/en/1minuto.mp3')
  })

  it('durações do manifesto valem para todos os idiomas', () => {
    // Mix preso ao instrumental original: durações conferem com ffprobe dos assets
    expect(resolveSabbathSchoolAudio('5min_es', 'en').durationMs).toBe(18_000)
    expect(resolveSabbathSchoolAudio('1min_es', 'fr').durationMs).toBe(65_500)
  })

  it('idioma desconhecido cai no PT e preset sem narração não tem arquivo', () => {
    expect(resolveSabbathSchoolAudio('abertura_es', 'de')).toEqual(resolveSabbathSchoolAudio('abertura_es', 'pt-BR'))
    expect(resolveSabbathSchoolAudio('beep', 'pt-BR')).toEqual({ url: '', durationMs: 0 })
  })
})
