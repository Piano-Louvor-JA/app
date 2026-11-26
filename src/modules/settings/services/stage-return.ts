import { isReturnCover, returnNextPhrase, returnPhrase } from '../../media/services/return-phrases'
import type { MediaProjectionRuntime } from '../../media/types/media'
import {
  bibleTransitionMs,
  effectiveLyricTransition,
  resolveReturnScreen,
  returnNextFontSize,
  type StageSettings,
  type StageTransition,
} from '../types/stage-settings'

/** Subconjunto que o receiver anima no retorno (igual ao espelho). */
function receiverReturnTransition(
  t: StageTransition,
): 'fade' | 'slide' | 'zoom' | undefined {
  if (t === 'none') return undefined
  if (
    t === 'slide' ||
    t === 'slide-down' ||
    t === 'slide-left' ||
    t === 'slide-right' ||
    t === 'drop' ||
    t === 'float'
  ) {
    return 'slide'
  }
  if (t === 'zoom' || t === 'zoom-out' || t === 'pop' || t === 'zoom-blur' || t === 'rotate') {
    return 'zoom'
  }
  return 'fade'
}

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
      /** Presente só com transições de slides ligadas; senão o receiver usa o flyer. */
      transition?: 'fade' | 'slide' | 'zoom'
      transitionMs?: number
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
  const transition = receiverReturnTransition(effectiveLyricTransition(stage))
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
    ...(transition
      ? {
          transition,
          transitionMs: bibleTransitionMs(stage.lyricTransitionSpeed),
        }
      : {}),
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
