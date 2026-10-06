import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STAGE_SETTINGS,
  parseStageSettings,
  resolveBackgroundImage,
  serializeStageSettings,
  STAGE_OFFICIAL_BACKGROUNDS,
  stageFlexAlign,
} from '../types/stage-settings'

describe('stage-settings (paridade APK)', () => {
  it('defaults idênticos ao APK', () => {
    // 05/10 Rafael: backgroundColor default é NULL (não setado) — cor só
    // existe se o usuário escolher; sem escolha, a imagem da projeção vence.
    expect(DEFAULT_STAGE_SETTINGS.backgroundColor).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.textColor).toBe('#FFFFFF')
    expect(DEFAULT_STAGE_SETTINGS.fontSize).toBe(96)
    expect(DEFAULT_STAGE_SETTINGS.shadowBlur).toBeCloseTo(2.2)
    expect(DEFAULT_STAGE_SETTINGS.shadowIntensity).toBeCloseTo(0.8)
    expect(DEFAULT_STAGE_SETTINGS.textBox).toBe(true)
    expect(DEFAULT_STAGE_SETTINGS.boxOpacity).toBeCloseTo(0.45)
    expect(DEFAULT_STAGE_SETTINGS.footerRefColor).toBe('#FCCE02')
    expect(DEFAULT_STAGE_SETTINGS.bibleFontSize).toBe(84)
    expect(DEFAULT_STAGE_SETTINGS.textAlign).toBe('center')
    expect(DEFAULT_STAGE_SETTINGS.textVerticalAlign).toBe('middle')
  })

  it('parse nas chaves do APK (bg/fg/size/weight/tsOn/...)', () => {
    const s = parseStageSettings({
      bg: '#000000',
      fg: '#FFE9A8',
      size: 120,
      weight: 800,
      tsOn: false,
      boxOn: true,
      boxBg: 0.7,
      tAlign: 'left',
      tVAlign: 'bottom',
      refColor: '#00C1E6',
      showVer: false,
      bSize: 70,
      bWeight: 700,
      bFg: '#B8E0FF',
    })
    expect(s.backgroundColor).toBe('#000000')
    expect(s.textColor).toBe('#FFE9A8')
    expect(s.fontSize).toBe(120)
    expect(s.fontWeight).toBe(800)
    expect(s.textShadow).toBe(false)
    expect(s.textBox).toBe(true)
    expect(s.boxOpacity).toBeCloseTo(0.7)
    expect(s.textAlign).toBe('left')
    expect(s.textVerticalAlign).toBe('bottom')
    expect(s.footerRefColor).toBe('#00C1E6')
    expect(s.showBibleVersion).toBe(false)
    expect(s.bibleFontSize).toBe(70)
    expect(s.bibleFontWeight).toBe(700)
    expect(s.bibleTextColor).toBe('#B8E0FF')
  })

  it('parse clampa valores fora de faixa (como o APK)', () => {
    const s = parseStageSettings({ size: 999, tsBlur: 99, boxBg: 5 })
    expect(s.fontSize).toBe(160)
    expect(s.shadowBlur).toBe(5)
    expect(s.boxOpacity).toBeCloseTo(0.9)
  })

  it('parse de lixo → defaults', () => {
    expect(parseStageSettings(null)).toEqual(DEFAULT_STAGE_SETTINGS)
    expect(parseStageSettings('x')).toEqual(DEFAULT_STAGE_SETTINGS)
    expect(parseStageSettings({ bg: 'red' }).backgroundColor).toBe(
      DEFAULT_STAGE_SETTINGS.backgroundColor,
    )
  })

  it('serialize ↔ parse roundtrip', () => {
    const s = {
      ...DEFAULT_STAGE_SETTINGS,
      backgroundColor: '#1B2A1F',
      fontSize: 140,
      fontWeight: 800 as const,
      textAlign: 'right' as const,
      bibleTextColor: '#FFE9A8',
      backgroundImage: 'data:image/png;base64,xyz',
    }
    const out = parseStageSettings(serializeStageSettings(s))
    expect(out).toEqual(s)
  })

  it('background oficial (official:bg-XX) sobrevive ao roundtrip', () => {
    const s = { ...DEFAULT_STAGE_SETTINGS, backgroundImage: 'official:bg-03' }
    expect(parseStageSettings(serializeStageSettings(s)).backgroundImage).toBe('official:bg-03')
    // dataURL continua válido
    const d = { ...DEFAULT_STAGE_SETTINGS, backgroundImage: 'data:image/png;base64,abc' }
    expect(parseStageSettings(serializeStageSettings(d)).backgroundImage).toBe(d.backgroundImage)
    // lixo continua rejeitado
    expect(parseStageSettings({ bgImg: 'javascript:alert(1)' }).backgroundImage).toBeNull()
  })

  it('resolveBackgroundImage: official → URL resolvida, dataURL → inalterado', () => {
    // Em build/vite o glob resolve p/ URL com hash; em node puro o fallback
    // do caminho público é usado.
    const url = resolveBackgroundImage('official:bg-07')
    expect(url === '/backgrounds/bg-07.png' || url.includes('bg-07')).toBe(true)
    expect(resolveBackgroundImage('data:image/png;base64,x')).toBe('data:image/png;base64,x')
    expect(resolveBackgroundImage(null)).toBeNull()
  })

  it('parse aceita bgImg oficial do APK (assets/backgrounds/bg-01.png)', () => {
    // No APK o path do asset é salvo; convertemos para o formato web
    const s = parseStageSettings({ bgImg: 'official:bg-01' })
    expect(s.backgroundImage).toBe('official:bg-01')
  })

  it('galeria oficial começa pelo fundo do piano (bg-11)', () => {
    expect(STAGE_OFFICIAL_BACKGROUNDS[0]).toBe('bg-11')
  })

  it('stageFlexAlign: horizontal no eixo cruzado, vertical no eixo principal (coluna)', () => {
    const leftBottom = stageFlexAlign({ textAlign: 'left', textVerticalAlign: 'bottom' })
    expect(leftBottom.alignItems).toBe('flex-start')
    expect(leftBottom.justifyContent).toBe('flex-end')

    const rightTop = stageFlexAlign({ textAlign: 'right', textVerticalAlign: 'top' })
    expect(rightTop.alignItems).toBe('flex-end')
    expect(rightTop.justifyContent).toBe('flex-start')
  })

  it('stageFlexAlign: em linha os eixos não invertem', () => {
    const leftBottom = stageFlexAlign(
      { textAlign: 'left', textVerticalAlign: 'bottom' },
      'row',
    )
    expect(leftBottom.alignItems).toBe('flex-end')
    expect(leftBottom.justifyContent).toBe('flex-start')
  })
})
