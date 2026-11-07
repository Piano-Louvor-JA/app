import type { LiturgyItem } from '../types/liturgy'
import { normalizeTitleColor, plainTextToNotesHtml, sanitizeNotesHtml } from './rich-notes'

/**
 * Conteúdo da anotação projetada. A principal e a independente usam canais
 * separados: cada uma pode mostrar uma anotação diferente ao mesmo tempo.
 */
export type AnnotationProjectionRuntime = {
  active: boolean
  title: string
  html: string
  /** Cor escolhida para o título; vazio = cor padrão da projeção. */
  titleColor: string
}

export const DEFAULT_ANNOTATION_RUNTIME: AnnotationProjectionRuntime = {
  active: false,
  title: '',
  html: '',
  titleColor: '',
}

export const ANNOTATION_RUNTIME_CHANNEL = 'louvorja-liturgy-annotation'
export const ANNOTATION_RUNTIME_STORAGE_KEY = 'louvorja-liturgy-annotation-state'
export const ANNOTATION_INDEPENDENT_CHANNEL = 'louvorja-liturgy-annotation-independent'
export const ANNOTATION_INDEPENDENT_STORAGE_KEY = 'louvorja-liturgy-annotation-independent-state'

function channelOf(independent: boolean) {
  return independent
    ? { channel: ANNOTATION_INDEPENDENT_CHANNEL, key: ANNOTATION_INDEPENDENT_STORAGE_KEY }
    : { channel: ANNOTATION_RUNTIME_CHANNEL, key: ANNOTATION_RUNTIME_STORAGE_KEY }
}

export function annotationStorageKey(independent: boolean): string {
  return channelOf(independent).key
}

export function annotationChannelName(independent: boolean): string {
  return channelOf(independent).channel
}

export function normalizeAnnotationRuntime(raw: unknown): AnnotationProjectionRuntime {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ANNOTATION_RUNTIME }
  const value = raw as Record<string, unknown>
  return {
    active: value.active === true,
    title: typeof value.title === 'string' ? value.title : '',
    html: typeof value.html === 'string' ? value.html : '',
    titleColor: normalizeTitleColor(value.titleColor),
  }
}

export function annotationRuntimeFromItem(
  item: Pick<LiturgyItem, 'name' | 'subtitle' | 'notesHtml' | 'titleColor'>,
): AnnotationProjectionRuntime {
  return {
    active: true,
    title: item.name?.trim() ?? '',
    html: sanitizeNotesHtml(item.notesHtml) || plainTextToNotesHtml(item.subtitle ?? ''),
    titleColor: normalizeTitleColor(item.titleColor),
  }
}

export function readAnnotationRuntime(independent: boolean): AnnotationProjectionRuntime {
  try {
    const raw = localStorage.getItem(annotationStorageKey(independent))
    return normalizeAnnotationRuntime(raw ? (JSON.parse(raw) as unknown) : null)
  } catch {
    return { ...DEFAULT_ANNOTATION_RUNTIME }
  }
}

export function publishAnnotationRuntime(
  state: AnnotationProjectionRuntime,
  independent: boolean,
): void {
  const { channel, key } = channelOf(independent)
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // localStorage pode falhar em contextos restritos
  }
  try {
    const broadcast = new BroadcastChannel(channel)
    broadcast.postMessage(state)
    broadcast.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}
