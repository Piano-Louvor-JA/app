export type SettingsSectionId =
  | 'appearance'
  | 'general'
  | 'media'
  | 'projection'
  | 'transmission'
  | 'remote'

export type ThemeMode = 'light' | 'dark'

export type AppearanceInteraction = 'dynamic' | 'soft' | 'mist'

export interface SettingsSection {
  id: SettingsSectionId
  routeName: string
  labelKey: string
  /** Oculto nas abas — rotas/views permanecem para reativar depois. */
  hidden?: boolean
}

export type {
  LyricFontWeight,
  LyricVerticalAlign,
  MonitorArrangementSlot,
  ProjectionSettings,
  SystemDisplay,
} from './projection'
