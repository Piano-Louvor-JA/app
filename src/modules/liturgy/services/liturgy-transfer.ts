import { cloneLiturgyItems, createLiturgyItemId } from './liturgy-item-helpers'
import { normalizeLiturgyState } from './liturgy-preferences'
import {
  LITURGY_WEEKDAYS,
  type CustomLiturgy,
  type LiturgyItem,
  type LiturgyPersistedState,
  type WeekdayLiturgies,
  type WeekdayNotes,
} from '../types/liturgy'

/**
 * Exportar/importar a liturgia da semana (Dom a Sáb + Avulsas + notas do
 * dia) num arquivo .json. Só a lista: arquivos locais dos itens (vídeo,
 * áudio, PDF…) não vão junto. Horários reais do culto e cadeados ficam no
 * computador (são do uso local).
 */
export const LITURGY_EXPORT_FORMAT = 'louvorja-liturgia'
export const LITURGY_EXPORT_VERSION = 1

export interface LiturgyExport {
  format: typeof LITURGY_EXPORT_FORMAT
  version: number
  exportedAt: string
  weekdays: WeekdayLiturgies
  dayNotes: WeekdayNotes
  customLiturgies: CustomLiturgy[]
}

export type LiturgyImportResult =
  | { ok: true; data: LiturgyExport }
  | { ok: false; error: 'invalid' | 'version' }

/** Itens exportados saem desmarcados: concluído é do culto, não da lista. */
function undone(items: LiturgyItem[]): LiturgyItem[] {
  return items.map((item) => ({ ...item, done: false }))
}

export function buildLiturgyExport(state: LiturgyPersistedState, now = new Date()): LiturgyExport {
  const weekdays = { ...state.weekdays }
  for (const day of LITURGY_WEEKDAYS) weekdays[day] = undone(state.weekdays[day] ?? [])
  return {
    format: LITURGY_EXPORT_FORMAT,
    version: LITURGY_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    weekdays,
    dayNotes: { ...state.dayNotes },
    customLiturgies: state.customLiturgies.map((custom) => ({ ...custom, items: undone(custom.items) })),
  }
}

/** Nome do arquivo: liturgia-AAAA-MM-DD.json */
export function liturgyExportFileName(now = new Date()): string {
  return `liturgia-${now.toISOString().slice(0, 10)}.json`
}

export function parseLiturgyImport(raw: string): LiturgyImportResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid' }
  const source = data as Record<string, unknown>
  if (source.format !== LITURGY_EXPORT_FORMAT) return { ok: false, error: 'invalid' }
  if (source.version !== LITURGY_EXPORT_VERSION) return { ok: false, error: 'version' }
  // Mesma limpeza da liturgia salva: itens inválidos ficam de fora.
  const normalized = normalizeLiturgyState(source)
  return {
    ok: true,
    data: {
      format: LITURGY_EXPORT_FORMAT,
      version: LITURGY_EXPORT_VERSION,
      exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : '',
      weekdays: normalized.weekdays,
      dayNotes: normalized.dayNotes,
      customLiturgies: normalized.customLiturgies,
    },
  }
}

/** A semana já tem algo (dia com itens ou avulsa): importar pergunta antes. */
export function hasLiturgyContent(state: LiturgyPersistedState): boolean {
  return (
    state.customLiturgies.length > 0 ||
    LITURGY_WEEKDAYS.some((day) => (state.weekdays[day] ?? []).length > 0)
  )
}

/** Substituir: dias, notas e avulsas vêm do arquivo; horários reais e cadeados ficam. */
export function replaceWithImportedLiturgy(
  current: LiturgyPersistedState,
  imported: LiturgyExport,
): LiturgyPersistedState {
  return {
    ...current,
    weekdays: imported.weekdays,
    dayNotes: imported.dayNotes,
    customLiturgies: imported.customLiturgies,
  }
}

/**
 * Acrescentar: os itens importados vão para o fim de cada dia (ids novos,
 * sub-itens religados à categoria), notas são somadas e as avulsas entram
 * como novas.
 */
export function appendImportedLiturgy(
  current: LiturgyPersistedState,
  imported: LiturgyExport,
): LiturgyPersistedState {
  const weekdays = { ...current.weekdays }
  const dayNotes = { ...current.dayNotes }
  for (const day of LITURGY_WEEKDAYS) {
    const added = imported.weekdays[day] ?? []
    if (added.length > 0) weekdays[day] = [...(current.weekdays[day] ?? []), ...cloneLiturgyItems(added)]
    const note = (imported.dayNotes[day] ?? '').trim()
    const existing = (current.dayNotes[day] ?? '').trim()
    if (note && note !== existing) dayNotes[day] = existing ? `${existing}\n\n${note}` : note
  }
  return {
    ...current,
    weekdays,
    dayNotes,
    customLiturgies: [
      ...current.customLiturgies,
      ...imported.customLiturgies.map((custom) => ({
        ...custom,
        id: createLiturgyItemId(),
        items: cloneLiturgyItems(custom.items),
      })),
    ],
  }
}
