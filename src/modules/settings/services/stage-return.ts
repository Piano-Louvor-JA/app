import { isReturnCover, returnNextPhrase, returnPhrase } from '../../media/services/return-phrases'
import type { MediaProjectionRuntime } from '../../media/types/media'
import { resolveReturnScreen, returnNextFontSize, type StageSettings } from '../types/stage-settings'

export type StageReturnStyle = {
  color: string | null
  /** px @1920 */
  fontSize: number
  /** px @1920 */
  nextFontSize: number
  fontWeight: number
  textAlign: string
  upperCase: boolean
  shadow: { blur: number; intensity: number } | null
  barColor: string
  backgroundColor: string | null
}

export type StageReturnMessage =
  | { v: 1; type: 'stageReturn'; active: false }
  | {
      v: 1
      type: 'stageReturn'
      active: true
      current: string
      next: string
      isCover: boolean
      nextIsCover: boolean
      slideIndex: number
      progress: number
      background?: string
      style: StageReturnStyle
    }

const DEFAULT_BAR_COLOR = '#FCCE02'

/** Retorno de palco (/retorno): o que a tela de retorno do app mostra, com a aparência de palco de hinos. */
export function buildStageReturn(runtime: MediaProjectionRuntime, stage: StageSettings, background?: string): StageReturnMessage {
  const current = returnPhrase(runtime)
  if (!runtime.active || !current) return { v: 1, type: 'stageReturn', active: false }
  const shadow = stage.lyricTextShadow ?? stage.textShadow
  // Personalização própria do retorno; campo vazio = igual aos slides.
  const ret = resolveReturnScreen(stage)
  const baseSize = ret.fontSize ?? stage.lyricFontSize ?? stage.fontSize
  return {
    v: 1,
    type: 'stageReturn',
    active: true,
    current,
    next: returnNextPhrase(runtime),
    isCover: isReturnCover(runtime),
    nextIsCover: runtime.nextIsCover,
    slideIndex: runtime.slideIndex,
    progress: Math.min(1, Math.max(0, runtime.slideProgressRatio)),
    ...(ret.bgMode === 'slides' && background ? { background } : {}),
    // TVs só recebem a imagem enviada pelo usuário (data URL); fundo oficial fica na cor.
    ...(ret.bgMode === 'image' && ret.bgImage?.startsWith('data:') ? { background: ret.bgImage } : {}),
    style: {
      color: ret.textColor ?? stage.lyricTextColor ?? stage.textColor ?? null,
      fontSize: baseSize,
      nextFontSize: returnNextFontSize(ret, stage),
      fontWeight: ret.fontWeight ?? stage.lyricFontWeight ?? stage.fontWeight,
      textAlign: stage.textAlign,
      upperCase: ret.upperCase ?? stage.lyricUpperCase,
      shadow: shadow ? { blur: stage.shadowBlur, intensity: stage.shadowIntensity } : null,
      barColor: ret.barColor ?? (stage.footerRefColor || DEFAULT_BAR_COLOR),
      backgroundColor: ret.bgMode === 'slides' ? stage.backgroundColor ?? null : ret.bgColor,
    },
  }
}
