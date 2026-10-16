/** Chaves de persistência no browser (localStorage / sessionStorage). */
export const BROWSER_STORAGE_KEYS = {
  userPreferences: 'user_data',
  recentCollections: 'history_recent_collections',
  topSongs: 'history_top_songs',
  catalogSessionPrefix: 'db:',
  playlists: 'louvorja-playlists-v1',
  /** sessionStorage: histórico de navegação (sobrevive a reload, não a fechar o app). */
  navigationHistory: 'navigation-history-v1',
  /** sessionStorage: páginas minimizadas (barra acima do dock). */
  minimizedPages: 'minimized-pages-v1',
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
  /** Posição (left/top em px) do player minimizado arrastado; ausente = canto padrão. */
  mediaChromePosition: 'media.chromePosition',
  /** Posição (left/top em px) da prévia flutuante da Bíblia; ausente = canto padrão. */
  bibleChromePosition: 'bible.chromePosition',
  /** Posição (left/top em px) da prévia flutuante do Timer; ausente = canto padrão. */
  countdownChromePosition: 'countdown.chromePosition',
  /** Posição (left/top em px) da prévia flutuante do Cronômetro; ausente = canto padrão. */
  timerChromePosition: 'timer.chromePosition',
  /** Posição (left/top em px) da prévia flutuante do Relógio; ausente = canto padrão. */
  clockChromePosition: 'clock.chromePosition',
  /** Posição (left/top em px) da prévia flutuante do Sorteio; ausente = canto padrão. */
  randomChromePosition: 'random.chromePosition',
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
  catalogRefreshCheckedAt: 'catalog_refresh_checked_at',
} as const
