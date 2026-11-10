import { notesHtmlToPlainText, normalizeTitleColor, sanitizeNotesHtml } from '@modules/liturgy/services/rich-notes'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import {
  ANNOUNCEMENTS_MEDIA_DIR,
  CAROUSEL_SLIDE_MS_DEFAULT,
  CAROUSEL_SLIDE_MS_MAX,
  CAROUSEL_SLIDE_MS_MIN,
  type Announcement,
  type AnnouncementFile,
  type AnnouncementList,
  type AnnouncementsState,
  type CarouselConfig,
} from '../types/announcements'

type Raw = Record<string, unknown>

function asRecord(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function newAnnouncementsId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Só caminhos relativos dentro da pasta de avisos, sem `..` nem barra invertida. */
export function isAnnouncementMediaPath(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value.startsWith(`${ANNOUNCEMENTS_MEDIA_DIR}/`) || value.includes('\\')) return false
  return !value.split('/').some((part) => part === '..' || part === '.' || part === '')
}

function asFile(value: unknown): AnnouncementFile | null {
  const source = asRecord(value)
  if (!source || !isAnnouncementMediaPath(source.relativePath)) return null
  return { relativePath: source.relativePath, name: asText(source.name) }
}

function asAnnouncement(value: unknown): Announcement | null {
  const source = asRecord(value)
  const id = asId(source?.id)
  if (!source || !id) return null
  const title = asText(source.title)

  switch (source.kind) {
    case 'text': {
      const html = sanitizeNotesHtml(asText(source.html))
      return {
        id,
        kind: 'text',
        title,
        titleColor: normalizeTitleColor(source.titleColor),
        html,
        plainText: html ? notesHtmlToPlainText(html) : '',
        ...(source.inCarousel === false ? { inCarousel: false } : {}),
      }
    }
    case 'images': {
      const files = Array.isArray(source.files) ? source.files.map(asFile).filter((f) => f !== null) : []
      return { id, kind: 'images', title, files, ...(source.inCarousel === false ? { inCarousel: false } : {}) }
    }
    case 'video':
      return { id, kind: 'video', title, file: asFile(source.file) }
    case 'presentation':
      return { id, kind: 'presentation', title, file: asFile(source.file) }
    case 'url':
      return { id, kind: 'url', title, url: asText(source.url).trim() }
    default:
      return null
  }
}

function asList(value: unknown): AnnouncementList | null {
  const source = asRecord(value)
  const id = asId(source?.id)
  if (!source || !id) return null
  const items = Array.isArray(source.items) ? source.items.map(asAnnouncement).filter((i) => i !== null) : []
  return { id, name: asText(source.name), items }
}

function asCarousel(value: unknown): CarouselConfig {
  const source = asRecord(value) ?? {}
  const raw = source.slideMs
  const slideMs = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(CAROUSEL_SLIDE_MS_MAX, Math.max(CAROUSEL_SLIDE_MS_MIN, Math.round(raw)))
    : CAROUSEL_SLIDE_MS_DEFAULT
  return { slideMs, loop: source.loop === false ? false : true }
}

export function emptyAnnouncementList(name: string): AnnouncementList {
  return { id: newAnnouncementsId(), name, items: [] }
}

/** Estado válido a partir de qualquer coisa: descarta o inválido e garante uma lista ativa. */
export function normalizeAnnouncementsState(raw: unknown, defaultListName: string): AnnouncementsState {
  const source = asRecord(raw) ?? {}
  const seen = new Set<string>()
  const lists = (Array.isArray(source.lists) ? source.lists.map(asList) : [])
    .filter((list): list is AnnouncementList => list !== null && !seen.has(list.id) && Boolean(seen.add(list.id)))
  if (lists.length === 0) lists.push(emptyAnnouncementList(defaultListName))

  const activeId = asId(source.activeListId)
  return {
    version: 1,
    lists,
    activeListId: activeId && lists.some((l) => l.id === activeId) ? activeId : lists[0]!.id,
    carousel: asCarousel(source.carousel),
  }
}

export function loadAnnouncementsState(defaultListName: string): AnnouncementsState {
  return normalizeAnnouncementsState(getUserPreference(USER_PREFERENCE_KEYS.announcementsState), defaultListName)
}

export function saveAnnouncementsState(state: AnnouncementsState): void {
  setUserPreference(USER_PREFERENCE_KEYS.announcementsState, state)
}
