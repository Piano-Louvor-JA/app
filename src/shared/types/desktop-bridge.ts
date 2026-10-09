export type MediaFolderType = 'covers' | 'music' | 'slides'

export type ProgressPayload = {
  progress: number
  text?: string
}

export type WorkspaceApi = {
  /** Lê bytes de arquivo escolhido via openFile (decode fica no caller). */
  readBinaryFile?: (path: string) => Promise<Uint8Array | null>
  getRecord: <T = unknown>(filename: string) => Promise<T | null>
  saveRecord: (filename: string, data: unknown) => Promise<boolean>
  clear: (options?: { preserveMedia?: boolean }) => Promise<boolean>
}

export type CatalogApi = {
  downloadDatabase: () => Promise<boolean>
  extractDatabase: () => Promise<boolean>
  onDownloadProgress: (callback: (payload: ProgressPayload) => void) => () => void
  onExtractProgress: (callback: (payload: ProgressPayload) => void) => () => void
}

/** Resultado do detector da instalação LouvorJA Classo/Delphi (issue #142). */
export type ClassoAlbumInfo = {
  name: string
  dir: string
  files: string[]
  bytes: number
}

export type ClassoDetectionResult = {
  found: boolean
  root: string | null
  media: { albums: ClassoAlbumInfo[]; totalBytes: number }
  dataFiles: {
    liturgiaJa: string | null
    itensAgendados: string | null
    itensAgendadosCategorias: string | null
    configPt: string
  } | null
}

export type ClassoApi = {
  detect: () => Promise<ClassoDetectionResult>
}

export type YoutubeAuthStatus = {
  signedIn: boolean
  premium: boolean | null
}

export type YoutubeAuthApi = {
  status: () => Promise<YoutubeAuthStatus>
  login: () => Promise<{ ok: boolean; signedIn: boolean }>
  logout: () => Promise<{ ok: boolean }>
}

export type YoutubeAdblockApi = {
  status: () => Promise<{ enabled: boolean }>
  set: (enabled: boolean) => Promise<{ ok: boolean }>
}

export type LegacyMediaCounts = {
  covers: number
  music: number
  slides: number
}

export type LegacyMediaAnalyzeResult = {
  found: boolean
  configDir: string | null
  /** Idioma injetado no path de músicas (pt|es). */
  lang?: 'pt' | 'es'
  scanned: number
  missing: number
  present: number
  totalBytes: number
  missingBytes: number
  counts: LegacyMediaCounts
}

export type LegacyMediaImportProgress = {
  current: number
  total: number
  relativePath: string
  mediaType: MediaFolderType
}

export type LegacyMediaImportResult = {
  ok: boolean
  imported: number
  skipped: number
  failed: number
  total: number
  reason?: string
}

export type LegacyMediaApi = {
  analyze: (selectedPath?: string) => Promise<LegacyMediaAnalyzeResult>
  import: (selectedPath?: string) => Promise<LegacyMediaImportResult>
  pickFolder: () => Promise<string | null>
  onImportProgress: (
    callback: (progress: LegacyMediaImportProgress) => void,
  ) => () => void
}

export type MediaFolderStatus = {
  currentPath: string
  defaultPath: string
  isCustom: boolean
}

export type MediaFolderMigrateResult = {
  ok: boolean
  path: string | null
  reason?: string
  movedBytes?: number
}

export type MediaFolderApi = {
  status: () => Promise<MediaFolderStatus>
  pick: () => Promise<string | null>
  migrate: (targetPath: string) => Promise<MediaFolderMigrateResult>
}

export type BackupProgress = {
  current: number
  total: number
  zipPath: string
}

export type BackupResult = {
  ok: boolean
  path?: string
  reason?: string
}

export type BackupApi = {
  create: () => Promise<BackupResult>
  restore: () => Promise<BackupResult>
  onProgress: (callback: (progress: BackupProgress) => void) => () => void
}

export type MediaApi = {
  download: (url: string, mediaType: MediaFolderType, filename: string) => Promise<boolean>
  check: (mediaType: MediaFolderType, filename: string) => Promise<string | false>
  /** Checagem em lote no main process (um IPC). */
  checkMany?: (
    mediaType: MediaFolderType,
    filenames: string[],
  ) => Promise<Record<string, string | false>>
  delete: (mediaType: MediaFolderType, filename: string) => Promise<boolean>
  /** Duração de mídia local em ms via ffprobe (main process). */
  probeDuration?: (path: string) => Promise<number>
}

/** Mensagem de comando vinda do controle remoto (APK via WS). */
export type RemoteBridgeMessage = {
  id?: string | number
  action: string
  value?: unknown
  [key: string]: unknown
}

export type RemotePairingInfo = {
  host: string
  port: number
  token: string
  connectUrl: string
  qrDataUrl: string
  clientCount: number
  clientAddress?: string | null
}

export type RemoteApi = {
  onCommand: (callback: (msg: RemoteBridgeMessage) => void) => () => void
  onStateRequest: (callback: () => void) => () => void
  sendAck: (ack: { id?: string | number; ok: boolean }) => void
  sendState: (state: Record<string, unknown>) => void
  pairingInfo: () => Promise<RemotePairingInfo>
  onClients?: (
    callback: (payload: { count: number; address?: string | null }) => void,
  ) => () => void
}

export type DisplayBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type SystemDisplayInfo = {
  id: number
  bounds: DisplayBounds
  workArea: DisplayBounds
  scaleFactor: number
  isPrimary: boolean
}

export type DisplaysApi = {
  list: () => Promise<SystemDisplayInfo[]>
  identify: () => Promise<boolean>
  /** Hotplug: display adicionado/removido/métricas alteradas. */
  onChanged?: (
    callback: (displays: SystemDisplayInfo[]) => void,
  ) => () => void
}

export type FileDialogFilter = {
  name: string
  extensions: string[]
}

export type OpenFileDialogOptions = {
  title?: string
  filters?: FileDialogFilter[]
  /** Permite selecionar vários arquivos (ex.: galeria de imagens). */
  multiple?: boolean
}

export type DialogApi = {
  openFile: (
    options?: OpenFileDialogOptions,
  ) => Promise<string | string[] | null>
}

export type ExternalPlayerPreference =
  | 'associated'
  | 'vlc'
  | 'mpv'
  | 'celluloid'
  | 'smplayer'
  | 'totem'
  | 'haruna'
  | 'clapper'
  | 'iina'
  | 'mpc'
  | `custom:${string}`

export type DetectedPlayer = { id: string; label: string }

export type ExternalPlayerApi = {
  get: () => Promise<ExternalPlayerPreference>
  /** Players conhecidos instalados nesta máquina (além do "player do sistema"). */
  detect: () => Promise<DetectedPlayer[]>
  /** Players adicionados em “Escolher outro player…”, persistidos na lista. */
  listCustom: () => Promise<string[]>
  set: (player: ExternalPlayerPreference) => Promise<boolean>
  removeCustom: (
    binPath: string,
  ) => Promise<{ player: ExternalPlayerPreference; customPlayers: string[] }>
  play: (
    filePath: string,
    player?: ExternalPlayerPreference,
  ) => Promise<{ ok: boolean; player: string; error?: string }>
}

export type PresentationEngine =
  | 'auto'
  | 'powerpoint'
  | 'libreoffice'
  | 'onlyoffice'
  | 'wps'
  | 'keynote'
  | 'calligra'
  | 'custom'

export type DetectedPresentationEngine = { id: string; label: string }

export type PresentationApi = {
  /** True se LibreOffice/soffice estiver disponível para converter PPT. */
  detectOffice?: () => Promise<boolean>
  /** PowerPoint / LibreOffice instalados nesta máquina. */
  detectEngines?: () => Promise<DetectedPresentationEngine[]>
  /** Engine de conversão: auto (padrão) até o usuário escolher outro. */
  getEngine?: () => Promise<PresentationEngine>
  setEngine?: (engine: PresentationEngine) => Promise<boolean>
  /** Abre o .pptx no aplicativo externo (PowerPoint/Impress) em modo slideshow. */
  openExternal?: (
    filePath: string,
    engine: Exclude<PresentationEngine, 'auto'>,
  ) => Promise<{ ok: boolean; error?: string }>
  /** Define o app externo custom de apresentação (executável escolhido). */
  setCustomApp?: (appPath: string) => Promise<boolean>
}

export type OpenUrlProjectionPayload = {
  url?: string
  filePath?: string
  /** Galeria de imagens locais (vários caminhos absolutos). */
  filePaths?: string[]
  title?: string
  videoId?: string
  monitorIds?: number[]
  fullscreenOnPrimary?: boolean
  mode?: 'video' | 'site' | 'image' | 'pdf' | 'presentation'
  withScreens?: boolean
  /** Engine de conversão para este item (sobrepõe o setting global). */
  presentationEngine?: PresentationEngine
}

export type PlaybackSyncPayload = {
  currentTime: number
  paused: boolean
  ended?: boolean
  updatedAt?: number
}

export type ProjectionPlaybackState = {
  paused: boolean
  currentTime: number
  duration: number
  muted?: boolean
  /** Volume do vídeo no popup (0–1). */
  volume?: number
  /** Telas estendidas espelhando o popup. */
  projecting?: boolean
}

export type ProjectionNavigationState = {
  canGoBack: boolean
  canGoForward: boolean
  projecting?: boolean
}

export type ProjectionApi = {
  openUrl: (payload: OpenUrlProjectionPayload) => Promise<boolean>
  closeUrl: () => Promise<boolean>
  /** Há projeção externa (video/pdf/ppt/site) com janela viva no main? */
  externalAlive: () => Promise<boolean>
  getSourceMediaId?: () => Promise<string | null>
  publishPlaybackSync?: (payload: PlaybackSyncPayload) => void
  onPlaybackSync?: (callback: (payload: PlaybackSyncPayload) => void) => () => void
  /** ESC pressionado na janela de projeção → operador exibe confirm. */
  onCloseRequested?: (callback: () => void) => () => void
  /** ←/→ na projeção de mídia → operador navega slides. */
  onMediaNavigate?: (callback: (direction: 'previous' | 'next') => void) => () => void
  remotePlay?: () => Promise<boolean>
  remotePause?: () => Promise<boolean>
  remoteSeek?: (seconds: number) => Promise<boolean>
  remoteToggleMute?: () => Promise<{ muted: boolean; volume?: number } | null>
  remoteSetVolume?: (
    volume: number,
  ) => Promise<{ muted: boolean; volume: number } | null>
  getPlaybackState?: () => Promise<ProjectionPlaybackState | null>
  getNavigationState?: () => Promise<ProjectionNavigationState | null>
  remoteGoBack?: () => Promise<boolean>
  remoteGoForward?: () => Promise<boolean>
  remoteReload?: () => Promise<boolean>
  toggleSiteScreens?: () => Promise<boolean>
  toggleVideoScreens?: () => Promise<boolean>
  remoteImageNext?: () => Promise<{ index: number; total: number } | null>
  remoteImagePrev?: () => Promise<{ index: number; total: number } | null>
  getImageSlideState?: () => Promise<{
    index: number
    total: number
    projecting?: boolean
  } | null>
  remotePdfNext?: () => Promise<{ index: number; total: number } | null>
  remotePdfPrev?: () => Promise<{ index: number; total: number } | null>
  getPdfPageState?: () => Promise<{
    index: number
    total: number
    projecting?: boolean
  } | null>
  remotePptNext?: () => Promise<{ index: number; total: number } | null>
  remotePptPrev?: () => Promise<{ index: number; total: number } | null>
  getPptSlideState?: () => Promise<{
    index: number
    total: number
    projecting?: boolean
  } | null>
  getSiteTargetMonitors?: () => Promise<number[]>
  setSiteTargetMonitors?: (ids: number[]) => Promise<boolean>
  getVideoTargetMonitors?: () => Promise<number[]>
  setVideoTargetMonitors?: (ids: number[]) => Promise<boolean>
  setSiteControlPanelOpen?: (open: boolean) => Promise<boolean>
  onSiteTargetsChanged?: (callback: (ids: number[]) => void) => () => void
  onVideoTargetsChanged?: (callback: (ids: number[]) => void) => () => void
}

export type WindowControlAction = 'minimize' | 'maximize' | 'close' | 'is-maximized'

export type WindowApi = {
  control: (action: WindowControlAction) => Promise<boolean | null>
  onMaximizedState: (callback: (isMaximized: boolean) => void) => () => void
}

export type ZoomChangedPayload = {
  factor: number
  direction?: 'in' | 'out'
}

export type ZoomApi = {
  getFactor: () => number
  setFactor: (factor: number) => number
  zoomIn: () => number
  zoomOut: () => number
  onChanged: (callback: (payload: ZoomChangedPayload) => void) => () => void
}

export type RandomAudioApi = {
  ensureDefaultAudio: () => Promise<{
    ok: boolean
    relativePath?: string
    filePath?: string
  }>
  importAudio: () => Promise<{
    ok: boolean
    fileName?: string
    relativePath?: string
    reason?: string
  }>
  deleteAudio: (fileName: string) => Promise<{
    ok: boolean
    reason?: string
  }>
}

export type DiagnosticsApi = {
  run: () => Promise<{ report: unknown; jsonPath: string; txtPath: string }>
  send: (report: unknown) => Promise<{ ok: boolean; reason?: string }>
  openFolder: (filePath: string) => Promise<void>
}

export type LouvorJaBridge = {
  platform: string
  isElectron: boolean
  diagnostics?: DiagnosticsApi
  window?: WindowApi
  zoom?: ZoomApi
  workspace: WorkspaceApi
  catalog: CatalogApi
  classo?: ClassoApi
  ytAuth?: YoutubeAuthApi
  ytAdblock?: YoutubeAdblockApi
  externalPlayer?: ExternalPlayerApi
  legacyMedia?: LegacyMediaApi
  mediaFolder?: MediaFolderApi
  backup?: BackupApi
  media: MediaApi
  displays: DisplaysApi
  dialog: DialogApi
  presentation?: PresentationApi
  projection: ProjectionApi
  remote?: RemoteApi
  random?: RandomAudioApi
}
