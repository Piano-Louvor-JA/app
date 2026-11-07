/** Pasta dos arquivos copiados, relativa à pasta Media (posix). Cada aviso tem a sua subpasta. */
export const ANNOUNCEMENTS_MEDIA_DIR = 'modulos/avisos'

export const ANNOUNCEMENT_KINDS = ['text', 'images', 'video', 'presentation', 'url'] as const
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number]

/** Arquivo copiado para `Media/modulos/avisos/<id-do-aviso>/`. */
export interface AnnouncementFile {
  /** Relativo à pasta Media (posix), sempre dentro de `ANNOUNCEMENTS_MEDIA_DIR`. */
  relativePath: string
  /** Nome original, para mostrar ao operador. */
  name: string
}

interface AnnouncementBase {
  id: string
  title: string
}

export interface TextAnnouncement extends AnnouncementBase {
  kind: 'text'
  /** Cor do título (hex); vazio = cor padrão da projeção. */
  titleColor: string
  /** HTML do editor rico (já limpo). */
  html: string
  /** Mesmo texto sem formatação (busca, prévia da linha). */
  plainText: string
  /** false = fica fora do carrossel. Ausente = participa (padrão). */
  inCarousel?: boolean
}

export interface ImagesAnnouncement extends AnnouncementBase {
  kind: 'images'
  files: AnnouncementFile[]
  /** false = fica fora do carrossel. Ausente = participa (padrão). */
  inCarousel?: boolean
}

export interface VideoAnnouncement extends AnnouncementBase {
  kind: 'video'
  file: AnnouncementFile | null
}

export interface PresentationAnnouncement extends AnnouncementBase {
  kind: 'presentation'
  /** PPTX, PPT, ODP ou PDF. Projeta sempre pelo modo interno do Piano. */
  file: AnnouncementFile | null
}

/** Site, YouTube ou Vimeo: o player é escolhido pelo próprio link (como na Liturgia). */
export interface UrlAnnouncement extends AnnouncementBase {
  kind: 'url'
  url: string
}

export type Announcement =
  | TextAnnouncement
  | ImagesAnnouncement
  | VideoAnnouncement
  | PresentationAnnouncement
  | UrlAnnouncement

export interface AnnouncementList {
  id: string
  name: string
  items: Announcement[]
}

export const CAROUSEL_SLIDE_MS_DEFAULT = 5_000
export const CAROUSEL_SLIDE_MS_MIN = 2_000
export const CAROUSEL_SLIDE_MS_MAX = 10 * 60_000

export interface CarouselConfig {
  /** Tempo de cada slide. */
  slideMs: number
  /** Volta ao primeiro depois do último. */
  loop: boolean
}

export interface AnnouncementsState {
  version: 1
  lists: AnnouncementList[]
  activeListId: string
  carousel: CarouselConfig
}

/** Tipos que o carrossel passa sozinho; vídeo, apresentação e URL ficam de fora. */
export function isCarouselKind(kind: AnnouncementKind): boolean {
  return kind === 'text' || kind === 'images'
}

/** O aviso entra no carrossel: tipo aceito e o operador não o tirou. */
export function isInCarousel(item: Announcement): boolean {
  return (item.kind === 'text' || item.kind === 'images') && item.inCarousel !== false
}
