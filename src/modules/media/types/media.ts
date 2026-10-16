/** Modos de reprodução alinhados ao catálogo (vocal / instrumental / só slides). */
export type MediaPlaybackMode = 'audio' | 'instrumental' | 'no_audio'

export type MediaOpenParams = {
  musicId: number
  mode?: MediaPlaybackMode
  albumId?: number | null
  /** Quando true, mantém o chrome flutuante sem navegar para a view maximizada. */
  minimized?: boolean
  /** Quando true, abre projeção nas telas configuradas após carregar. */
  project?: boolean
  /** Avanço automático da fila: não zera queue/queueIndex no open(). */
  keepQueue?: boolean
}

export type MediaLyricSlide = {
  order: number
  lyric: string
  showSlide: boolean
  time: string
  instrumentalTime: string
  imageUrl: string | null
  imagePosition: string | null
  /** Frame PDF/PPT capturado (data:image/) — slide de frame, sem véu. */
  frameDataUrl?: string
  isCover: boolean
}

export type MediaAlbumRef = {
  id: number
  name: string
  track: number | null
  imageUrl: string | null
}

export type MediaTrackRecord = {
  id: number
  name: string
  durationLabel: string
  audioUrl: string | null
  instrumentalUrl: string | null
  coverUrl: string | null
  coverPosition: string | null
  albums: MediaAlbumRef[]
  categories: string[]
  lyrics: MediaLyricSlide[]
}

export type MediaSession = {
  musicId: number
  albumId: number | null
  mode: MediaPlaybackMode
  title: string
  subtitle: string
  coverUrl: string | null
  audioUrl: string
  hasInstrumental: boolean
  slides: MediaLyricSlide[]
  slideTimesSec: number[]
}

export type MediaPlayerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'

export type MediaProjectionRuntime = {
  active: boolean
  title: string
  subtitle: string
  lyric: string
  imageUrl: string | null
  imagePosition: string | null
  frameDataUrl: string | null
  isCover: boolean
  slideIndex: number
  slideCount: number
  nextLyric: string
  nextIsCover: boolean
  progressRatio: number
  slideProgressRatio: number
}

export type MediaOpenResult =
  | { ok: true; warningKey?: string }
  | { ok: false; messageKey: string }

export const DEFAULT_MEDIA_PROJECTION: MediaProjectionRuntime = {
  active: false,
  title: '',
  subtitle: '',
  lyric: '',
  imageUrl: null,
  imagePosition: null,
  frameDataUrl: null,
  isCover: false,
  slideIndex: 0,
  slideCount: 0,
  nextLyric: '',
  nextIsCover: false,
  progressRatio: 0,
  slideProgressRatio: 0,
}
