import type { AlertPresetKey, SabbathAudioLangSetting } from '../services/alert-tone'

export interface SabbathScheduleConfig {
  /**
   * 'duration' = conta uma duração fixa; 'endOnly' = conta até a hora do
   * término; 'video' = projeta o vídeo personalizado e conta a duração dele.
   */
  scheduleMode: 'duration' | 'endOnly' | 'video'
  /** Duração da contagem no modo 'duration'. */
  durationMs: number
  /** Hora do término (ex: "10:15") no modo 'endOnly'. */
  endTime: string
}

export type AlertMarkerPreset = AlertPresetKey | 'none' | 'legacy-custom' | `custom:${string}`

/** Marco de alerta: dispara quando faltam `offsetMs`. */
export interface AlertMarker {
  /** ID estável entre reloads. Padrões: 'start', '5min', '1min'. */
  id: string
  /** Tempo restante (ms) em que o alerta dispara. 'start' = 0. */
  offsetMs: number
  /** Som tocado: preset fixo, 'none' ou 'custom:{libraryId}'. */
  preset: AlertMarkerPreset
}

/** Marcos padrão: abertura, faltam 5 minutos, falta 1 minuto. */
export const DEFAULT_ALERT_MARKERS: AlertMarker[] = [
  { id: 'start', offsetMs: 0, preset: 'abertura_es' },
  { id: '5min', offsetMs: 300_000, preset: '5min_es' },
  { id: '1min', offsetMs: 60_000, preset: '1min_es' },
]

/** Vídeo temático único, guardado em Media/modulos/escola-sabatina/video. */
export interface SabbathCustomVideo {
  /** Relativo à pasta Media. */
  relativePath: string
  /** Nome do arquivo escolhido pelo usuário. */
  name: string
  durationMs: number
}

export interface SabbathSchoolConfig {
  schedule: SabbathScheduleConfig
  /** Idioma das narrações oficiais. FR é só do áudio — a UI não tem locale FR. */
  audioLang: SabbathAudioLangSetting
  alertMarkers: AlertMarker[]
  customVideo: SabbathCustomVideo | null
}

export const DEFAULT_SABBATH_SCHEDULE: SabbathScheduleConfig = { scheduleMode: 'duration', durationMs: 45 * 60_000, endTime: '10:15' }

export function defaultSabbathSchoolConfig(): SabbathSchoolConfig {
  return {
    schedule: { ...DEFAULT_SABBATH_SCHEDULE },
    audioLang: 'auto',
    alertMarkers: DEFAULT_ALERT_MARKERS.map((m) => ({ ...m })),
    customVideo: null,
  }
}
