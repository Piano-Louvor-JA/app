import { notesHtmlToPlainText, sanitizeNotesHtml } from '@modules/liturgy/services/rich-notes'

import { isInCarousel, type Announcement } from '../types/announcements'

/** Módulo da janela de projeção (ProjectionHost `?module=`). */
export const CAROUSEL_PROJECTION_MODULE = 'announcements-carousel'
export const CAROUSEL_RUNTIME_CHANNEL = 'louvorja-announcements-carousel'
export const CAROUSEL_RUNTIME_STORAGE_KEY = 'louvorja-announcements-carousel-state'

/** Um slide do carrossel: um aviso de texto ou uma imagem de um aviso de imagens. */
export type CarouselSlide =
  | { key: string; kind: 'text'; title: string; html: string; titleColor: string }
  | { key: string; kind: 'image'; relativePath: string; name: string }

/**
 * O que a projeção precisa saber. As janelas do app desenham o texto pelo
 * canal da anotação; `title`/`text` (texto puro) servem às conexões remotas (OBS).
 */
export type CarouselRuntime = {
  active: boolean
  kind: 'text' | 'image' | null
  relativePath: string
  title: string
  text: string
}

export const DEFAULT_CAROUSEL_RUNTIME: CarouselRuntime = { active: false, kind: null, relativePath: '', title: '', text: '' }

/**
 * Avisos de texto viram um slide; avisos de imagens, um slide por imagem.
 * Vídeo, apresentação, URL e os avisos tirados do carrossel ficam de fora.
 */
export function buildCarouselSlides(items: Announcement[]): CarouselSlide[] {
  return items.flatMap((item): CarouselSlide[] => {
    if (!isInCarousel(item)) return []
    if (item.kind === 'text') {
      if (!item.title.trim() && !item.plainText.trim()) return []
      return [{ key: item.id, kind: 'text', title: item.title, html: item.html, titleColor: item.titleColor }]
    }
    if (item.kind === 'images') {
      return item.files.map((file, index) => ({
        key: `${item.id}:${index}`,
        kind: 'image' as const,
        relativePath: file.relativePath,
        name: file.name,
      }))
    }
    return []
  })
}

export function carouselRuntimeFromSlide(slide: CarouselSlide | null): CarouselRuntime {
  if (!slide) return { ...DEFAULT_CAROUSEL_RUNTIME }
  if (slide.kind === 'image') return { active: true, kind: 'image', relativePath: slide.relativePath, title: '', text: '' }
  return { active: true, kind: 'text', relativePath: '', title: slide.title.trim(), text: notesHtmlToPlainText(sanitizeNotesHtml(slide.html)) }
}

export function normalizeCarouselRuntime(raw: unknown): CarouselRuntime {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CAROUSEL_RUNTIME }
  const value = raw as Record<string, unknown>
  const kind = value.kind === 'text' || value.kind === 'image' ? value.kind : null
  return {
    active: value.active === true && kind !== null,
    kind,
    relativePath: kind === 'image' && typeof value.relativePath === 'string' ? value.relativePath : '',
    title: kind === 'text' && typeof value.title === 'string' ? value.title : '',
    text: kind === 'text' && typeof value.text === 'string' ? value.text : '',
  }
}

export function readCarouselRuntime(): CarouselRuntime {
  try {
    const raw = localStorage.getItem(CAROUSEL_RUNTIME_STORAGE_KEY)
    return normalizeCarouselRuntime(raw ? (JSON.parse(raw) as unknown) : null)
  } catch {
    return { ...DEFAULT_CAROUSEL_RUNTIME }
  }
}

/** localStorage (quem abre depois) + BroadcastChannel (quem já está aberto), como a anotação. */
export function publishCarouselRuntime(state: CarouselRuntime): void {
  try {
    localStorage.setItem(CAROUSEL_RUNTIME_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // contexto restrito
  }
  try {
    const broadcast = new BroadcastChannel(CAROUSEL_RUNTIME_CHANNEL)
    broadcast.postMessage(state)
    broadcast.close()
  } catch {
    // sem BroadcastChannel
  }
}
