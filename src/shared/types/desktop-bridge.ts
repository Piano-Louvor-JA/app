import type { FontsApi } from './fonts'

export type MediaFolderType = 'covers' | 'music' | 'slides'

export type ProgressPayload = {
  progress: number
  text?: string
}

export type WorkspaceApi = {
  /** Lê bytes de arquivo escolhido via openFile (decode fica no caller). */
  readBinaryFile?: (path: string) => Promise<Uint8Array | null>
  /** Baixa url → Media/provai-e-vede/<fileName>. Retorna o caminho local ou null. */
  downloadToMedia?: (url: string, fileName: string) => Promise<string | null>
  /** Fetch de página remota pelo main process (sem CORS). Retorna texto ou null. */
  fetchText?: (url: string) => Promise<string | null>
  getRecord: <T = unknown>(filename: string) => Promise<T | null>
  saveRecord: (filename: string, data: unknown) => Promise<boolean>
  clear: (options?: { preserveMedia?: boolean }) => Promise<boolean>
}

/** Download em background (fila no MAIN, T1/T2 — Provai e Vede). */
export type DownloadBatchApi = {
  enqueue: (items: Array<{ id: string, url: string, fileName: string }>) => Promise<{ ok: boolean }>
  cancel: (id: string) => Promise<{ ok: boolean }>
  retry: (id: string) => Promise<{ ok: boolean }>
  pending: () => Promise<Array<{ id: string, fileName: string, status: string }>>
  onProgress: (cb: (p: { done: number, total: number, current: { id: string, fileName: string, receivedBytes: number, totalBytes: number } | null }) => void) => () => void
  onItemDone: (cb: (p: { id: string, fileName: string, filePath: string }) => void) => () => void
  onItemFailed: (cb: (p: { id: string, fileName: string, reason: string }) => void) => () => void
  onBatchDone: (cb: (p: { done: number, failed: number, total: number }) => void) => () => void
}

/** Bíblia offline: bundles `<versionId>.json.gz` (download > instalador). */
export type BibleApi = {
  getChapter: (
    versionId: number,
    bookId: number,
    chapter: number,
  ) => Promise<Record<string, string> | null>
  listVersions: () => Promise<
    Array<{ versionId: number; source: 'download' | 'bundled' }>
  >
  /** Confere bundles novos na API (no máximo 1x/dia). */
  checkUpdates?: () => Promise<{
    status: 'skipped' | 'up-to-date' | 'updated' | 'error'
    updated: number[]
    failed: number[]
  }>
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

export type OnlineVideoQuality = 480 | 720 | 1080

export type OnlineVideoSettings = {
  enabled: boolean
  maxHeight: OnlineVideoQuality
  limitGb: number
}

export type OnlineVideoToolsStatus = {
  state: 'unavailable' | 'missing' | 'installing' | 'ready' | 'error'
  tool?: 'ytdlp' | 'ffmpeg'
  progress?: number
  version?: string
  error?: string
}

export type OnlineVideoStatus = {
  hidden: boolean
  available: boolean
  settings: OnlineVideoSettings
  tools: OnlineVideoToolsStatus
  usage: { bytes: number; count: number; limitBytes: number }
}

export type OnlineVideoItemStatus = {
  state: 'none' | 'queued' | 'resolving' | 'downloading' | 'muxing' | 'ready' | 'error'
  progress?: number
  code?: string
  message?: string
}

export type OnlineVideoApi = {
  status: () => Promise<OnlineVideoStatus>
  setSettings: (partial: Partial<OnlineVideoSettings>) => Promise<OnlineVideoStatus>
  prefetch: (ids: string[]) => Promise<void>
  cancel: (id: string) => Promise<void>
  keep: (ids: string[]) => Promise<void>
  clear: () => Promise<OnlineVideoStatus>
  videoStatus: (ids: string[]) => Promise<Record<string, OnlineVideoItemStatus>>
  retryTools: () => Promise<OnlineVideoStatus>
  onChanged: (callback: (payload: { id: string; status: OnlineVideoItemStatus }) => void) => () => void
  onTools: (callback: (status: OnlineVideoToolsStatus) => void) => () => void
}

export type YoutubeVideoInfo = {
  title: string
  channel: string
  description: string
  durationMs: number
}

export type YoutubeInfoApi = {
  get: (videoId: string) => Promise<YoutubeVideoInfo | null>
}

export type SitePageInfo = {
  title: string
  siteName: string
  description: string
}

export type SiteInfoApi = {
  get: (url: string) => Promise<SitePageInfo | null>
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

export type MediaDownloadFailure = {
  ok: false
  url: string
  status: number | null
  bytes: number
  error: string
}

export type MediaApi = {
  download: (url: string, mediaType: MediaFolderType, filename: string) => Promise<boolean | MediaDownloadFailure>
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
  speakerUrl?: string
  viewerUrl?: string
  viewerQrDataUrl?: string
  speakerQrDataUrl?: string
  operatorUrl?: string
  operatorQrDataUrl?: string
  clientCount: number
  clientAddress?: string | null
  /** Identidade do APK/controle remoto conectado (painel esquerdo). */
  remoteAddress?: string | null
  /** Identidade do pregador conectado (painel direito). */
  speakerAddress?: string | null
}

export type RemoteApi = {
  onCommand: (callback: (msg: RemoteBridgeMessage) => void) => () => void
  onStateRequest: (callback: () => void) => () => void
  sendAck: (ack: { id?: string | number; ok: boolean }) => void
  sendState: (state: Record<string, unknown>) => void
  pairingInfo: () => Promise<RemotePairingInfo>
  resetToken?: (role: 'remote' | 'speaker') => Promise<RemotePairingInfo>
  disconnectSpeaker?: () => Promise<RemotePairingInfo>
  onClients?: (
    callback: (payload: {
      count: number
      address?: string | null
      remoteAddress?: string | null
      speakerAddress?: string | null
    }) => void,
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
  mode?: 'video' | 'site' | 'image' | 'pdf' | 'presentation' | 'text'
  /** Modo texto (avisos): conteúdo e cores do Palco. */
  text?: { title: string; html: string; titleColor?: string; textColor?: string; backgroundColor?: string }
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
  /** Mostra juntas as janelas de mídia já carregadas em segundo plano. */
  revealWarm?: (payload: {
    shows: { monitorId: number; fullscreen?: boolean; layout?: 'audience' | 'return' }[]
  }) => Promise<boolean>
  /** Há projeção externa (video/pdf/ppt/site) com janela viva no main? */
  externalAlive: () => Promise<boolean>
  /** SÓ mídia externa de verdade (vídeo/pdf/ppt do web-projection) — sem popups. */
  externalMediaAlive: () => Promise<boolean>
  getSourceMediaId?: () => Promise<string | null>
  publishPlaybackSync?: (payload: PlaybackSyncPayload) => void
  onPlaybackSync?: (callback: (payload: PlaybackSyncPayload) => void) => () => void
  /** ESC pressionado na janela de projeção → operador exibe confirm. */
  onCloseRequested?: (callback: () => void) => () => void
  /** Enter pressionado na janela de projeção → confirma o encerramento pendente. */
  onConfirmCloseRequested?: (callback: () => void) => () => void
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
  /** Leva o site projetado ao endereço que o celular abriu no navegador dele. */
  remoteNavigate?: (url: string) => Promise<boolean>
  /** Rola o site projetado na proporção (0..1) da rolagem do celular. */
  remoteScroll?: (ratio: number) => Promise<boolean>
  remoteGoForward?: () => Promise<boolean>
  remoteReload?: () => Promise<boolean>
  toggleSiteScreens?: () => Promise<boolean>
  toggleVideoScreens?: () => Promise<boolean>
  remoteImageNext?: () => Promise<{ index: number; total: number } | null>
  /** Tamanho do texto no player de texto (0,5–2). Null fora do modo texto. */
  getTextScale?: () => Promise<{ scale: number } | null>
  /** Projeção independente do player do Piano (monitor + sobrepor/compartilhar). */
  openIndependent?: (displayIds: number | number[], mode: 'overlay' | 'share') => Promise<boolean>
  closeIndependent?: () => Promise<boolean>
  getIndependentState?: () => Promise<{ displayIds: number[]; mode: 'overlay' | 'share' } | null>
  /** Monitores ativos no "Telas" quando o player abriu; os demais ficam desativados no painel. */
  getIndependentEnabledDisplays?: () => Promise<number[]>
  setTextScale?: (scale: number) => Promise<{ scale: number } | null>
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
  captureSourceFrame?: () => Promise<string | null>
  /** Miniatura JPEG (base64) do slide atual, para o controle remoto. */
  captureSlidePreview?: () => Promise<string | null>
  /** Miniaturas JPEG de toda a galeria aberta e a chave dela. */
  captureGalleryPreviews?: () => Promise<{ key: string; previews: string[] } | null>
  getSiteTargetMonitors?: () => Promise<number[]>
  setSiteTargetMonitors?: (ids: number[]) => Promise<boolean>
  getVideoTargetMonitors?: () => Promise<number[]>
  setVideoTargetMonitors?: (ids: number[]) => Promise<boolean>
  /** Estado da barra de vídeo aberta, para o controle remoto. */
  getVideoControlSnapshot?: () => Promise<Record<string, unknown> | null>
  /** Executa um comando na barra de vídeo, pelo mesmo caminho do clique. */
  runVideoControlCommand?: (command: Record<string, unknown>) => Promise<boolean>
  /** `height`: altura que o painel precisa (px), limitada à janela do player. */
  setSiteControlPanelOpen?: (open: boolean, height?: number) => Promise<boolean>
  onSiteTargetsChanged?: (callback: (ids: number[]) => void) => () => void
  onVideoTargetsChanged?: (callback: (ids: number[]) => void) => () => void
}

export type WindowControlAction = 'minimize' | 'maximize' | 'close' | 'is-maximized'

export type WindowApi = {
  control: (action: WindowControlAction) => Promise<boolean | null>
  onMaximizedState: (callback: (isMaximized: boolean) => void) => () => void
  /** Voltar/avançar do sistema (app-command no Windows). */
  onHistoryCommand?: (callback: (direction: HistoryCommandDirection) => void) => () => void
  /** Miniatura JPEG (data URL) de uma área da janela, em DIP; `null` se falhar. */
  capturePreview?: (rect: PreviewRect) => Promise<string | null>
}

export type PreviewRect = { x: number; y: number; width: number; height: number }

export type HistoryCommandDirection = 'back' | 'forward'

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

export type SabbathSchoolVideoApi = {
  importVideo: () => Promise<{
    ok: boolean
    fileName?: string
    relativePath?: string
    originalName?: string
    reason?: string
  }>
  clearVideo: () => Promise<{ ok: boolean; reason?: string }>
}

export type AnnouncementFileKind = 'images' | 'video' | 'presentation'

export type AnnouncementImportedFile = { relativePath: string; name: string }

export type AnnouncementsFilesApi = {
  /** Abre o diálogo (vários arquivos para imagens) e copia para Media/modulos/avisos/<id>/. */
  pickAndImport: (avisoId: string, kind: AnnouncementFileKind) => Promise<{
    ok: boolean
    files?: AnnouncementImportedFile[]
    rejected?: { name: string; reason: 'unsupported_format' | 'not_found' | 'copy_failed' }[]
    reason?: string
  }>
  /** Duplicar aviso: copia a pasta; `paths` mapeia caminho antigo → novo. */
  copyFolder: (fromId: string, toId: string) => Promise<{ ok: boolean; paths?: Record<string, string>; reason?: string }>
  removeFolder: (avisoId: string) => Promise<{ ok: boolean; reason?: string }>
  removeFiles: (relativePaths: string[]) => Promise<{ ok: boolean; removed?: number; reason?: string }>
  resolvePaths: (relativePaths: string[]) => Promise<{ relativePath: string; absolutePath: string | null; exists: boolean }[]>
}

export type DiagnosticsApi = {
  run: () => Promise<{ report: unknown; jsonPath: string; txtPath: string }>
  send: (report: unknown) => Promise<{ ok: boolean; reason?: string }>
  openFolder: (filePath: string) => Promise<void>
  reportRendererErrors?: (errors: unknown) => void
  reportDownloadFailures?: (failures: unknown) => void,
  reportAudioDevices?: (snapshot: unknown) => void
  reportJank?: (snapshot: unknown) => void
}

export type LouvorJaBridge = {
  platform: string
  isElectron: boolean
  fonts?: FontsApi
  diagnostics?: DiagnosticsApi
  window?: WindowApi
  zoom?: ZoomApi
  workspace: WorkspaceApi
  downloadBatch?: DownloadBatchApi
  catalog: CatalogApi
  bible?: BibleApi
  classo?: ClassoApi
  ytAuth?: YoutubeAuthApi
  onlineVideo?: OnlineVideoApi
  ytInfo?: YoutubeInfoApi
  siteInfo?: SiteInfoApi
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
  sabbathSchool?: SabbathSchoolVideoApi
  announcements?: AnnouncementsFilesApi
}
