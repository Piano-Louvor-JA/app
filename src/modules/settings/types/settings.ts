export type SettingsSectionId =
  | 'appearance'
  | 'general'
  | 'media'
  | 'projection'
  | 'transmission'
  | 'remote'
  | 'palco'
  | 'connections'

export type ThemeMode = 'light' | 'dark'

export type AppearanceInteraction = 'dynamic' | 'soft' | 'mist'

export interface SettingsSection {
  id: SettingsSectionId
  routeName: string
  labelKey: string
  /** Oculto nas abas — rotas/views permanecem para reativar depois. */
  hidden?: boolean
  /** Aba que agrupa outras rotas (fica ativa em qualquer uma delas). */
  routeNames?: string[]
}

export type {
  LyricFontWeight,
  LyricVerticalAlign,
  MonitorArrangementSlot,
  ProjectionSettings,
  SystemDisplay,
} from './projection'
