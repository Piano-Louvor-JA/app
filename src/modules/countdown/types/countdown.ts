export type CountdownTimeFormat =
  | 'hh:mm:ss.ms'
  | 'hh:mm:ss'
  | 'mm:ss.ms'
  | 'mm:ss'

export type CountdownStatus = 'idle' | 'running' | 'paused'

export type CountdownRuntimeMode = 'duration' | 'until'

export interface CountdownDisplayConfig {
  timeFormat: CountdownTimeFormat
  bgColor: string
  textColor: string
  /** Se true, o cronômetro continua rodando após zerar (tempo negativo).
   *  Se false (padrão), trava em zero e pausa automaticamente. */
  allowNegative?: boolean
}

export interface CountdownRuntimeState {
  mode?: CountdownRuntimeMode
  untilHour?: number
  untilMinute?: number
  pausedRemainingMs?: number | null
  status: CountdownStatus
  /** Epoch ms when the current running segment started. */
  segmentStartedAt: number | null
  /** Milliseconds already counted down before the current segment. */
  accumulatedMs: number
  /** Total countdown duration set by the user. */
  durationMs: number
  savedTimesMs: number[]
  finished: boolean
  /** app desktop: janela de projeção viva (CountdownProjectionView). */
  projecting?: boolean
  /** Vídeo (relativo à pasta Media) projetado no lugar dos números. */
  videoPath?: string
  /** Volume (0–1) do vídeo na projeção; 0 = mudo. */
  videoVolume?: number
}

/** Única origem de vídeo da contagem: o vídeo personalizado da Escola Sabatina. */
export const COUNTDOWN_VIDEO_DIR = 'modulos/escola-sabatina/video/'

export function isCountdownVideoPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(COUNTDOWN_VIDEO_DIR)) return false
  const fileName = value.slice(COUNTDOWN_VIDEO_DIR.length)
  return fileName.length > 0 && !/[\\/]/.test(fileName) && fileName !== '..' && fileName !== '.'
}

export interface CountdownDurationParts {
  hours: number
  minutes: number
  seconds: number
}

/** Duração inicial do Timer: 0h 05m 00s */
export const DEFAULT_COUNTDOWN_DURATION_PARTS: CountdownDurationParts = {
  hours: 0,
  minutes: 5,
  seconds: 0,
}

export const DEFAULT_COUNTDOWN_DURATION_MS =
  DEFAULT_COUNTDOWN_DURATION_PARTS.hours * 3_600_000 +
  DEFAULT_COUNTDOWN_DURATION_PARTS.minutes * 60_000 +
  DEFAULT_COUNTDOWN_DURATION_PARTS.seconds * 1_000

export const DEFAULT_COUNTDOWN_DISPLAY_CONFIG: CountdownDisplayConfig = {
  timeFormat: 'hh:mm:ss',
  bgColor: '#000000',
  textColor: '#FFFFFF',
  allowNegative: true,
}

export const DEFAULT_COUNTDOWN_RUNTIME: CountdownRuntimeState = {
  status: 'idle',
  segmentStartedAt: null,
  accumulatedMs: 0,
  durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
  savedTimesMs: [],
  finished: false,
  mode: 'duration',
  untilHour: 18,
  untilMinute: 0,
  pausedRemainingMs: null,
}

export const COUNTDOWN_TIME_FORMATS: CountdownTimeFormat[] = [
  'hh:mm:ss.ms',
  'hh:mm:ss',
  'mm:ss.ms',
  'mm:ss',
]

export const COUNTDOWN_BG_PRESETS = [
  '#000000',
  '#1A1A1A',
  '#FFFFFF',
  '#1976D2',
  '#388E3C',
  '#D32F2F',
  '#F57C00',
  '#7B1FA2',
] as const

export const COUNTDOWN_TEXT_PRESETS = [
  '#FFFFFF',
  '#000000',
  '#f6c32a',
  '#FF6B6B',
  '#4ECDC4',
  '#96CEB4',
  '#FFEAA7',
  '#0097d7',
] as const
