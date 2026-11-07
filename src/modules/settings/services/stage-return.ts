import { isReturnCover, returnNextPhrase, returnPhrase } from '../../media/services/return-phrases'
import type { MediaProjectionRuntime } from '../../media/types/media'
import type { StageSettings } from '../types/stage-settings'

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

const NEXT_SCALE = 0.58
const DEFAULT_BAR_COLOR = '#FCCE02'

/** Retorno de palco (/retorno): o que a tela de retorno do app mostra, com a aparência de palco de hinos. */
export function buildStageReturn(runtime: MediaProjectionRuntime, stage: StageSettings, background?: string): StageReturnMessage {
  const current = returnPhrase(runtime)
  if (!runtime.active || !current) return { v: 1, type: 'stageReturn', active: false }
  const shadow = stage.lyricTextShadow ?? stage.textShadow
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
    ...(background ? { background } : {}),
    style: {
      color: stage.lyricTextColor ?? stage.textColor ?? null,
      fontSize: stage.lyricFontSize ?? stage.fontSize,
      nextFontSize: Math.round(stage.fontSize * NEXT_SCALE * 100) / 100,
      fontWeight: stage.lyricFontWeight ?? stage.fontWeight,
      textAlign: stage.textAlign,
      upperCase: stage.lyricUpperCase,
      shadow: shadow ? { blur: stage.shadowBlur, intensity: stage.shadowIntensity } : null,
      barColor: stage.footerRefColor || DEFAULT_BAR_COLOR,
      backgroundColor: stage.backgroundColor ?? null,
    },
  }
}
