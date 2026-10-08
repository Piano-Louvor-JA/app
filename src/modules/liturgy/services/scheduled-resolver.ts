/**
 * Resolve a entrada agendada de uma categoria para uma data — usado pela
 * timeline (badge do placeholder), dialog de gestão e validação de culto.
 * Puro: sem store, recebe categorias/itens (facilita teste e reuso web).
 */
import type {
  ScheduledCategory,
  ScheduledItem,
  ScheduledItemContent,
} from '../stores/useScheduledStore'

export interface ResolvedScheduledEntry {
  entry: ScheduledItem
  entryName: string
  kind: NonNullable<ScheduledItemContent['kind']>
  content: ScheduledItemContent | null
}

/**
 * Migração segura: placeholders legados não tinham `scheduledRotationId`.
 * Só associa quando o nome do placeholder identifica UMA rotação existente;
 * `categoryId` litúrgico nunca é alterado.
 */
export function resolveLegacyScheduledRotationId(
  item: {
    type?: string
    name?: string
    scheduledRotationId?: string | null
  },
  categories: ScheduledCategory[],
): string | null {
  if (item.type !== 'scheduled' || item.scheduledRotationId?.trim()) return null
  const normalizedName = item.name
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('pt-BR')
  if (!normalizedName) return null
  const matches = categories.filter(
    (category) =>
      category.name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLocaleLowerCase('pt-BR') === normalizedName,
  )
  return matches.length === 1 ? matches[0]!.id : null
}

/** Item legado (port Delphi): sem `content`, o filePath É o conteúdo. */
function legacyContent(item: ScheduledItem): ScheduledItemContent | null {
  const filePath = item.filePath?.trim()
  if (!filePath) return null
  return { kind: 'file', filePath }
}

export function resolveScheduledEntry(
  categoryId: string,
  dateISO: string,
  categories: ScheduledCategory[],
  items: ScheduledItem[],
): ResolvedScheduledEntry | null {
  if (!categories.some((c) => c.id === categoryId)) return null

  const entry = items.find((i) => i.categoryId === categoryId && i.date === dateISO)
  if (!entry) return null

  const content = entry.content ?? legacyContent(entry)
  return {
    entry,
    entryName: entry.name,
    kind: content?.kind ?? 'file',
    content,
  }
}

/** Rótulo curto do tipo resolvido (i18n fica por conta do chamador via key). */
export const SCHEDULED_KIND_LABEL_KEYS: Record<
  NonNullable<ScheduledItemContent['kind']>,
  string
> = {
  music: 'liturgy.scheduled.kind.music',
  file: 'liturgy.scheduled.kind.file',
  verse: 'liturgy.scheduled.kind.verse',
  annotation: 'liturgy.scheduled.kind.annotation',
  online_video: 'liturgy.scheduled.kind.onlineVideo',
}
