export type CountdownTimeFormat =
  | 'hh:mm:ss.ms'
  | 'hh:mm:ss'
  | 'mm:ss.ms'
  | 'mm:ss'

import type { AlertPresetKey } from '../services/alert-tone'

export type CountdownStatus = 'idle' | 'running' | 'paused'

export type CountdownMode = 'standard' | 'sabbath'
export type CountdownRuntimeMode = 'duration' | 'until'

export interface SabbathModeConfig {
  /** 'start' = usuário define horário início + fim; 'endOnly' = só fim */
  scheduleMode: 'start' | 'endOnly'
  /** Horário de fim (ex: "10:15") — obrigatório. */
  endTime: string
  /** Horário de início (ex: "09:00") — opcional, só se scheduleMode === 'start'. */
  startTime?: string
}

export type AlertMarkerPreset = AlertPresetKey | 'none' | 'legacy-custom' | `custom:${string}`

/** Marco de alerta do cronômetro (v2): dispara quando faltam `offsetMs`. */
export interface AlertMarker {
  /** ID estável entre reloads. Padrões: 'start', '5min', '1min'. */
  id: string
  /** Tempo restante (ms) em que o alerta dispara. 'start' = 0. */
  offsetMs: number
  /** Som tocado: preset fixo, 'none' ou 'custom:{libraryId}'. */
  preset: AlertMarkerPreset
}

/** Marcos padrão — paridade exata com o comportamento atual (start/5min/1min). */
export const DEFAULT_ALERT_MARKERS: AlertMarker[] = [
  { id: 'start', offsetMs: 0, preset: 'abertura_es' },
  { id: '5min', offsetMs: 300_000, preset: '5min_es' },
  { id: '1min', offsetMs: 60_000, preset: '1min_es' },
]

export interface CountdownDisplayConfig {
  timeFormat: CountdownTimeFormat
  bgColor: string
  textColor: string
  /** Se true, o cronômetro continua rodando após zerar (tempo negativo).
   *  Se false (padrão), trava em zero e pausa automaticamente. */
  allowNegative?: boolean
  /** Mapeia marco → preset de áudio. Chaves: 'start', '5min', '1min'.
   *  Valor: key de ALERT_PRESETS, 'none' (desabilitado) ou 'custom' (áudio do usuário).
   *  @deprecated v1 — migrado para `alertMarkers` no boot; mantido só para ler configs antigas. */
  alertTonePresets?: Partial<Record<'start' | '5min' | '1min', AlertPresetKey | 'none'>>
  /** Versão do formato da config. Ausente = v1 (legado) → migrado no load. */
  configVersion?: 2
  /** v2: marcos dinâmicos de alerta — fonte única de verdade. */
  alertMarkers?: AlertMarker[]
  /** Modo de operação. 'sabbath' carrega todas as funcionalidades da Escola Sabatina. */
  mode?: CountdownMode
  /** Configuração extra quando mode === 'sabbath'. */
  sabbathConfig?: SabbathModeConfig
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
