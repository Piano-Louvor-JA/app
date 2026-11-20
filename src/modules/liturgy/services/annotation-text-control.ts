import { getDesktopBridge } from '@shared/services/desktop-bridge'

import type { LiturgyItem } from '../types/liturgy'
import { openLocalTextControl } from './liturgy-web-projection'
import { normalizeTitleColor, plainTextToNotesHtml, sanitizeNotesHtml } from './rich-notes'
import { stageTextPayload } from './text-control-payload'

type AnnotationText = Pick<LiturgyItem, 'name' | 'subtitle' | 'notesHtml' | 'titleColor'>

/** O player de texto (janela de controle) só existe no desktop. */
export function canOpenAnnotationTextControl(): boolean {
  return Boolean(getDesktopBridge()?.projection?.openUrl)
}

/** Anotação abre o mesmo player do aviso de texto: projetar, telas, conexões e tamanho. */
export function openAnnotationTextControl(item: AnnotationText): Promise<boolean> {
  const title = item.name?.trim() ?? ''
  const html = sanitizeNotesHtml(item.notesHtml) || plainTextToNotesHtml(item.subtitle ?? '')
  return openLocalTextControl(
    stageTextPayload({ title, html, titleColor: normalizeTitleColor(item.titleColor) }),
    title,
  )
}
