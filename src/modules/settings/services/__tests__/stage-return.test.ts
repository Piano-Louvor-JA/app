import { describe, expect, it } from 'vitest'
import { DEFAULT_MEDIA_PROJECTION, type MediaProjectionRuntime } from '../../../media/types/media'
import { DEFAULT_STAGE_SETTINGS, type StageSettings } from '../../types/stage-settings'
import { buildStageReturn } from '../stage-return'

const runtime = (overrides: Partial<MediaProjectionRuntime> = {}): MediaProjectionRuntime => ({
  ...DEFAULT_MEDIA_PROJECTION, active: true, title: 'Santo, Santo, Santo', lyric: 'Santo, santo, santo<br>Deus Todo-Poderoso',
  nextLyric: 'Cedo de manhã', slideIndex: 2, slideCount: 8, slideProgressRatio: 0.4, ...overrides,
})
const stage = (overrides: Partial<StageSettings> = {}): StageSettings => ({ ...DEFAULT_STAGE_SETTINGS, ...overrides })

describe('buildStageReturn', () => {
  it('leva o trecho atual, o próximo e o progresso do slide, como a tela de retorno', () => {
    expect(buildStageReturn(runtime(), stage(), 'http://192.168.0.5:47080/bg/bg-09.png')).toMatchObject({
      v: 1, type: 'stageReturn', active: true,
      current: 'Santo, santo, santo\nDeus Todo-Poderoso', next: 'Cedo de manhã',
      isCover: false, nextIsCover: false, slideIndex: 2, progress: 0.4,
      background: 'http://192.168.0.5:47080/bg/bg-09.png',
    })
  })

  it('na capa mostra o título, e o título também anuncia uma capa seguinte', () => {
    expect(buildStageReturn(runtime({ isCover: true, lyric: '' }), stage())).toMatchObject({ isCover: true, current: 'Santo, Santo, Santo' })
    expect(buildStageReturn(runtime({ nextIsCover: true, nextLyric: '' }), stage())).toMatchObject({ nextIsCover: true, next: 'Santo, Santo, Santo' })
  })

  it('usa a aparência de palco de hinos, com a letra própria quando existe', () => {
    const style = buildStageReturn(runtime(), stage({
      fontSize: 100, lyricFontSize: 120, textColor: '#ffffff', lyricTextColor: '#ffeeaa', fontWeight: 600, lyricFontWeight: 800,
      textAlign: 'left', lyricUpperCase: true, textShadow: true, lyricTextShadow: null, shadowBlur: 3, shadowIntensity: 0.7,
      footerRefColor: '#00ff00', backgroundColor: '#101014',
    })).style
    expect(style).toEqual({
      color: '#ffeeaa', fontSize: 120, nextFontSize: 58, fontWeight: 800, textAlign: 'left', upperCase: true,
      shadow: { blur: 3, intensity: 0.7 }, barColor: '#00ff00', backgroundColor: '#101014',
    })
  })

  it('sem escolhas de cor, deixa a página usar as cores padrão do retorno', () => {
    const style = buildStageReturn(runtime(), stage({ textColor: null, lyricTextColor: null, footerRefColor: null, backgroundColor: null, textShadow: false, lyricTextShadow: null })).style
    expect(style).toMatchObject({ color: null, barColor: '#FCCE02', backgroundColor: null, shadow: null })
  })

  it('sem música no ar, só avisa que o retorno saiu', () => {
    expect(buildStageReturn(runtime({ active: false }), stage())).toEqual({ v: 1, type: 'stageReturn', active: false })
    expect(buildStageReturn(runtime({ lyric: '', title: '', isCover: false }), stage())).toEqual({ v: 1, type: 'stageReturn', active: false })
  })
})
