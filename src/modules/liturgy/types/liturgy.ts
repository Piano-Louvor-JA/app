import type { PresentationEngine } from '@shared/types/desktop-bridge'

export const LITURGY_WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

export type LiturgyWeekday = (typeof LITURGY_WEEKDAYS)[number]

/** Ordem das chips no Stitch: dom→sáb (semana litúrgica). */
export const LITURGY_DAY_TAB_ORDER: LiturgyWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export type LiturgyDayKey = LiturgyWeekday | 'custom'

/** Fonte para clonar liturgia (dia da semana ou avulsa). */
export type LiturgyCloneSource =
  | { kind: 'weekday'; day: LiturgyWeekday; labelKey: string; itemCount: number }
  | {
      kind: 'custom'
      id: string
      index: number
      name: string
      itemCount: number
    }

/** Tipos de momento alinhados ao Stitch addItem (+ verse legado). */
export const LITURGY_ITEM_TYPES = [
  'category',
  'music',
  'annotation',
  'notice',
  'scheduled',
  'prayer',
  'audio',
  'video',
  'images',
  'pdf',
  'presentation',
  'other_files',
  'online_video',
  'site',
  'verse',
] as const

export type LiturgyItemType = (typeof LITURGY_ITEM_TYPES)[number]

export type LiturgyTypeGroupId = 'default' | 'internal' | 'external'

export interface LiturgyTypeChip {
  value: LiturgyItemType
  dot: string
}

export interface LiturgyTypeGroup {
  id: LiturgyTypeGroupId
  labelKey: string
  toneClass: 'primary' | 'secondary' | 'tertiary'
  types: LiturgyTypeChip[]
}

/** Grupos e pills do popup (Stitch addItem).
 * Cores bem separadas no espectro — prioriza distinção, não harmonia de tema.
 */
export const LITURGY_TYPE_GROUPS: LiturgyTypeGroup[] = [
  {
    id: 'default',
    labelKey: 'liturgy.dialog.groups.default',
    toneClass: 'primary',
    types: [
      { value: 'category', dot: '#FFD600' }, // amarelo puro
      { value: 'music', dot: '#00E676' }, // verde neon
      { value: 'annotation', dot: '#FF6D00' }, // laranja vivo
    ],
  },
  {
    id: 'internal',
    labelKey: 'liturgy.dialog.groups.internal',
    toneClass: 'secondary',
    types: [
      { value: 'audio', dot: '#D500F9' }, // magenta
      { value: 'video', dot: '#00B8D4' }, // ciano
      { value: 'images', dot: '#6D4C41' }, // marrom
      { value: 'pdf', dot: '#1A237E' }, // índigo/navy
      { value: 'presentation', dot: '#F5F5F5' }, // branco
    ],
  },
  {
    id: 'external',
    labelKey: 'liturgy.dialog.groups.external',
    toneClass: 'tertiary',
    types: [
      { value: 'online_video', dot: '#2979FF' }, // azul royal
      { value: 'site', dot: '#AEEA00' }, // chartreuse
    ],
  },
]

export type LiturgyMusicMode = 'audio' | 'instrumental'

export const DEFAULT_MOMENT_DURATION_MS = 0
export const MOMENT_DURATION_STEP_MS = 60 * 1000
export const MOMENT_DURATION_MIN_MS = 0
export const MOMENT_DURATION_MAX_MS = 99 * 60 * 1000

export function getTypeDotColor(type: LiturgyItemType): string {
  for (const group of LITURGY_TYPE_GROUPS) {
    const chip = group.types.find((entry) => entry.value === type)
    if (chip) return chip.dot
  }
  return '#9ecaff'
}

export interface LiturgyItem {
  id: string
  type: LiturgyItemType
  name: string
  subtitle: string
  done: boolean
  durationMs: number
  accentColor: string
  /** ID da Categoria/Sessão vinculada (itens que não são category). */
  categoryId?: string | null
  /** Horário de início da categoria/separador (HH:MM). */
  startTime?: string | null
  /** Horário de término da categoria/separador (HH:MM). */
  endTime?: string | null
  /** Título opcional ao lado do nome da música na listagem. */
  complementaryTitle?: string
  /** Anotações livres (em música, exibidas abaixo do álbum). */
  notes?: string
  musicId?: number | null
  musicMode?: LiturgyMusicMode
  verseBookId?: number | null
  verseChapter?: number | null
  verseNumbers?: string
  filePath?: string
  /** Caminhos locais (galeria de imagens). */
  filePaths?: string[]
  /** Engine do PPTX (itens presentation): auto|powerpoint|libreoffice|onlyoffice|…|custom. */
  presentationEngine?: PresentationEngine
  /**
   * Player de reprodução do item (vídeo/áudio): undefined = usa o global das
   * Configurações; senão associated|<known-id>|custom:<path>.
   */
  playerId?: string
  url?: string
}

export interface CustomLiturgy {
  id: string
  name: string
  items: LiturgyItem[]
  notes: string
  /** Horário de início real (HH:MM). */
  startTime?: string | null
  /** Horário final planejado (HH:MM). */
  endTime?: string | null
}

export type WeekdayLiturgies = Record<LiturgyWeekday, LiturgyItem[]>

export type WeekdayNotes = Record<LiturgyWeekday, string>

export interface LiturgySessionTimes {
  startTime: string | null
  endTime: string | null
}

export type WeekdaySessionTimes = Record<LiturgyWeekday, LiturgySessionTimes>

export interface LiturgyPersistedState {
  weekdays: WeekdayLiturgies
  dayNotes: WeekdayNotes
  daySessionTimes: WeekdaySessionTimes
  customLiturgies: CustomLiturgy[]
  /** Cadeado anti-exclusão por chave de dia (`monday`) ou avulsa (`custom:<id>`). */
  deletionLocks: Record<string, boolean>
}

export interface LiturgyItemDraft {
  type: LiturgyItemType | null
  name: string
  subtitle: string
  durationMs: number
  accentColor: string
  categoryId: string | null
  /** Horário de início (HH:MM) — usado em categorias/separadores. */
  startTime: string
  /** Horário de término (HH:MM) — usado em categorias/separadores. */
  endTime: string
  musicId: number | null
  musicMode: LiturgyMusicMode
  verseBookId: number | null
  verseChapter: number | null
  verseNumbers: string
  filePath: string
  filePaths: string[]
  presentationEngine: PresentationEngine
  /** Player do item; 'default' = herda o global das Configurações. */
  playerId: string
  url: string
}

export interface LiturgyMusicOption {
  id: number
  name: string
  hymnalTrack: number | null
  albumNames: string
  displayLabel: string
  /** Duração detectada no catálogo (ms). Null se indisponível. */
  durationMs: number | null
  /** True quando há faixa instrumental no catálogo. */
  hasInstrumental: boolean
  /** Letra normalizada (fold diacrítico) p/ busca por trecho (issue #348). */
  lyricsText?: string
}

export interface LiturgyBibleBookOption {
  id: number
  name: string
  chapters: number
}

export interface LiturgyItemTypeMeta {
  value: LiturgyItemType
  icon: string
  tone: string
}

export const DEFAULT_LITURGY_ITEM_DRAFT: LiturgyItemDraft = {
  type: null,
  name: '',
  subtitle: '',
  durationMs: 0,
  accentColor: '#9ecaff',
  categoryId: null,
  startTime: '',
  endTime: '',
  musicId: null,
  musicMode: 'audio',
  verseBookId: null,
  verseChapter: null,
  verseNumbers: '',
  filePath: '',
  filePaths: [],
  presentationEngine: 'auto',
  playerId: 'default',
  url: '',
}

export function createEmptyWeekdayLiturgies(): WeekdayLiturgies {
  return {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  }
}

export function createEmptyWeekdayNotes(): WeekdayNotes {
  return {
    sunday: '',
    monday: '',
    tuesday: '',
    wednesday: '',
    thursday: '',
    friday: '',
    saturday: '',
  }
}

export function createEmptySessionTimes(): LiturgySessionTimes {
  return { startTime: null, endTime: null }
}

export function createEmptyWeekdaySessionTimes(): WeekdaySessionTimes {
  return {
    sunday: createEmptySessionTimes(),
    monday: createEmptySessionTimes(),
    tuesday: createEmptySessionTimes(),
    wednesday: createEmptySessionTimes(),
    thursday: createEmptySessionTimes(),
    friday: createEmptySessionTimes(),
    saturday: createEmptySessionTimes(),
  }
}

export const LITURGY_ITEM_TYPE_META: LiturgyItemTypeMeta[] = [
  { value: 'category', icon: 'ti-tag', tone: 'warning' },
  { value: 'music', icon: 'ti-music', tone: 'success' },
  { value: 'annotation', icon: 'ti-text-caption', tone: 'info' },
  { value: 'notice', icon: 'ti-speakerphone', tone: 'warning' },
  { value: 'scheduled', icon: 'ti-calendar-time', tone: 'cyan' },
  { value: 'prayer', icon: 'ti-pray', tone: 'info' },
  { value: 'audio', icon: 'ti-headphones', tone: 'purple' },
  { value: 'video', icon: 'ti-video', tone: 'orange' },
  { value: 'images', icon: 'ti-photo', tone: 'success' },
  { value: 'pdf', icon: 'ti-file-type-pdf', tone: 'warning' },
  { value: 'presentation', icon: 'ti-file-type-ppt', tone: 'orange' },
  { value: 'other_files', icon: 'ti-files', tone: 'cyan' },
  { value: 'online_video', icon: 'ti-brand-youtube', tone: 'orange' },
  { value: 'site', icon: 'ti-world', tone: 'cyan' },
  { value: 'verse', icon: 'ti-book', tone: 'purple' },
]

export const EXECUTABLE_ITEM_TYPES: LiturgyItemType[] = [
  'music',
  'verse',
  'audio',
  'video',
  'images',
  'pdf',
  'presentation',
  'other_files',
  'online_video',
  'site',
]

export const INTERNAL_FILE_TYPES: LiturgyItemType[] = [
  'audio',
  'video',
  'images',
  'pdf',
  'presentation',
  'other_files',
]
