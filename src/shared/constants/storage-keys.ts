/** Chaves de persistência no browser (localStorage / sessionStorage). */
export const BROWSER_STORAGE_KEYS = {
  userPreferences: 'user_data',
  recentCollections: 'history_recent_collections',
  topSongs: 'history_top_songs',
  catalogSessionPrefix: 'db:',
  playlists: 'louvorja-playlists-v1',
} as const

/** Campos dentro de `user_data` (preferências do operador). */
export const USER_PREFERENCE_KEYS = {
  theme: 'theme',
  blur: 'blur',
  accent: 'accent',
  interaction: 'interaction',
  autoBrightness: 'autoBrightness',
  bibleSelectedVersion: 'bible.selectedVersionId',
  projectionSettings: 'projection.settings',
  homeLocation: 'home.location',
  /** Zoom da UI do operador (fator 0.7–1.5). */
  uiZoom: 'ui.zoom',
  clockConfig: 'clock.config',
  timerConfig: 'timer.config',
  countdownConfig: 'countdown.config',
  randomConfig: 'random.config',
  randomSession: 'random.session',
  liturgyState: 'liturgy.state',
  scheduledState: 'scheduled.state',
  language: 'language',
  /** Prefixo das personalizações do Palco por escopo (stage.settings.global|hymns|bible|...). */
  stageSettingsPrefix: 'stage.settings.',
} as const

/** Registros do workspace em disco (`.sysdata/*.bin`). */
export const WORKSPACE_RECORD_KEYS = {
  bootstrapComplete: 'bootstrap_complete',
  downloadQueue: 'download_queue',
  coversSynced: 'covers_synced',
  downloadedAlbums: 'downloaded_albums',
  config: 'config',
} as const
