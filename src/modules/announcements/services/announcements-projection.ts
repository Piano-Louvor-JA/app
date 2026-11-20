import type { Router } from 'vue-router'

import { toggleAnnotationProjection } from '@modules/liturgy/services/annotation-projection'
import { executeLiturgyItem } from '@modules/liturgy/services/liturgy-actions'
import { openLocalTextControl } from '@modules/liturgy/services/liturgy-web-projection'
import { parseLiturgyWebTarget } from '@modules/liturgy/services/liturgy-web-runtime'
import { stageTextPayload } from '@modules/liturgy/services/text-control-payload'
import type { LiturgyItem } from '@modules/liturgy/types/liturgy'
import { getDesktopBridge } from '@shared/services/desktop-bridge'

import type { Announcement, TextAnnouncement, UrlAnnouncement } from '../types/announcements'
import { resolveAnnouncementFiles } from './announcements-files'

export type AnnouncementProjectionResult =
  | { ok: true }
  | { ok: false; key: string; params?: Record<string, unknown> }

/** Aviso de texto no formato que a tela de anotação da Liturgia projeta. */
export function announcementAnnotationSource(item: TextAnnouncement) {
  return {
    id: item.id,
    name: item.title,
    subtitle: item.plainText,
    notesHtml: item.html,
    titleColor: item.titleColor,
  }
}

/** Link válido para o player web da Liturgia (site, YouTube, Vimeo). */
export function isProjectableUrl(url: string): boolean {
  return parseLiturgyWebTarget(url) !== null
}

/** Aviso de URL vira item "site": a Liturgia detecta YouTube/Vimeo pelo link e abre o player certo. */
export function urlAnnouncementAsLiturgyItem(item: UrlAnnouncement): LiturgyItem {
  return {
    id: `announcement-${item.id}`,
    type: 'site',
    name: item.title.trim(),
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '',
    url: item.url.trim(),
  }
}

/** Conteúdo e cores do Palco da Liturgia para o player de texto. */
export function announcementTextPayload(item: TextAnnouncement) {
  return stageTextPayload({ title: item.title, html: item.html, titleColor: item.titleColor })
}

function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf')
}

/** Item de Liturgia equivalente, com caminhos absolutos: os players da Liturgia fazem o resto. */
export function announcementAsLiturgyItem(
  item: Exclude<Announcement, TextAnnouncement | UrlAnnouncement>,
  absolutePaths: string[],
): LiturgyItem {
  const base = {
    id: `announcement-${item.id}`,
    name: item.title.trim(),
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '',
  }
  switch (item.kind) {
    case 'images':
      return { ...base, type: 'images', filePaths: absolutePaths }
    case 'video':
      // Módulo Avisos usa só os players do Piano (decisão de produto): ignora VLC/mpv e PowerPoint/LibreOffice externos.
      return { ...base, type: 'video', filePath: absolutePaths[0], playerId: 'associated' }
    case 'presentation': {
      const filePath = absolutePaths[0] ?? ''
      return isPdf(filePath)
        ? { ...base, type: 'pdf', filePath }
        : { ...base, type: 'presentation', filePath, presentationEngine: 'auto' }
    }
  }
}

/**
 * Projeta o aviso. Texto liga/desliga a tela de anotação; os demais abrem o
 * player da Liturgia, sempre os do Piano (vídeo interno, apresentação convertida pelo app).
 */
export async function projectAnnouncement(item: Announcement, router: Router): Promise<AnnouncementProjectionResult> {
  if (item.kind === 'text') {
    if (!item.title.trim() && !item.plainText.trim()) return { ok: false, key: 'announcements.dialog.emptyText' }
    // Desktop: janela de controle (projetar, telas, conexões, tamanho). Fora dele: tela de anotação.
    if (getDesktopBridge()?.projection?.openUrl) {
      const opened = await openLocalTextControl(announcementTextPayload(item), item.title)
      return opened ? { ok: true } : { ok: false, key: 'announcements.notices.projectionFailed' }
    }
    await toggleAnnotationProjection(announcementAnnotationSource(item))
    return { ok: true }
  }

  if (item.kind === 'url') {
    if (!isProjectableUrl(item.url)) return { ok: false, key: 'announcements.dialog.invalidUrl' }
    const result = await executeLiturgyItem(urlAnnouncementAsLiturgyItem(item), router)
    return result.ok ? { ok: true } : { ok: false, key: result.messageKey }
  }

  if (!getDesktopBridge()) return { ok: false, key: 'announcements.notices.desktopOnly' }

  const { absolutePaths, missing } = await resolveAnnouncementFiles(item)
  if (missing.length > 0) return { ok: false, key: 'announcements.notices.missing', params: { names: missing.join(', ') } }
  if (absolutePaths.length === 0) return { ok: false, key: 'announcements.dialog.emptyFiles' }

  const result = await executeLiturgyItem(announcementAsLiturgyItem(item, absolutePaths), router)
  return result.ok ? { ok: true } : { ok: false, key: result.messageKey }
}
