/**
 * Parser do "colar lista do trimestre" — o Rafael planeja no WhatsApp/planilha
 * e cola aqui. Aceita blocos por data (múltiplas posições) e linha única.
 *
 * Formatos aceitos:
 *   03/10                      ← abre bloco da data (ano do contexto)
 *   inicial: 15 - Adoração     ← slot: hino número - título
 *   provai: video-set.mp4      ← slot: caminho/URL (arquivo)
 *   ML: 22 | Bassora           ← separador alternativo
 *
 *   11/10 — hino 400 — Meu Lugar no Mundo   ← linha única (data + 1 item)
 *
 * slotKey é livre (inicial/provai/ML/final/culto...): o mapeamento pro nome
 * da rotação é feito pela UI (heurística + confirmação), não pelo parser.
 */
import { LITURGY_WEEKDAYS, type LiturgyWeekday } from '../types/liturgy'

export interface QuarterPasteEntry {
  slotKey: string
  /** Número do hino (música do catálogo), se a linha tinha número. */
  musicId?: number
  name: string
  /** Caminho/URL quando o conteúdo é arquivo/vídeo. */
  filePath?: string
}

export interface QuarterPasteGroup {
  dateISO: string
  weekday: LiturgyWeekday
  entries: QuarterPasteEntry[]
}

export interface QuarterParseResult {
  groups: QuarterPasteGroup[]
  errors: string[]
}

const SLOT_SEPARATOR = /[:\uFF1A]/ // ":" full-width incluso (colado de teclado pt/JP)
const FIELD_SEPARATOR = /\s+[-\u2014|]+\s+/ // " - ", " — ", " | "

function toISO(day: number, month: number, year: number): string | null {
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function weekdayOf(dateISO: string): LiturgyWeekday {
  const d = new Date(dateISO + 'T12:00:00')
  return LITURGY_WEEKDAYS[d.getDay()] ?? 'sunday'
}

/** "15 - Adoração" | "hino 400 — título" | "video.mp4" → entry */
function parseContentLine(raw: string): QuarterPasteEntry | null {
  let text = raw.trim()
  if (!text) return null

  // slot prefixo "inicial:" / "provai :" (chave = palavra(s) antes do :)
  let slotKey = 'item'
  const slotMatch = new RegExp(`^([^${':\\uFF1A'}]{1,24})${SLOT_SEPARATOR.source}\\s*(.*)$`).exec(text)
  if (slotMatch && /^[A-Za-zÀ-ÿ0-9 _-]+$/.test(slotMatch[1]!)) {
    slotKey = slotMatch[1]!.trim().toLowerCase()
    text = slotMatch[2]!.trim()
  }

  // tira prefixo "hino " do número
  const withoutHymn = text.replace(/^hino\s+/i, '')
  const fields = withoutHymn.split(FIELD_SEPARATOR).map((f) => f.trim()).filter(Boolean)

  if (fields.length === 0) return null

  const first = fields[0]!
  // primeiro campo numérico = musicId
  const num = parseInt(first.replace(/^#/, ''), 10)
  if (Number.isFinite(num) && num > 0 && /^\d+/.test(first)) {
    return { slotKey, musicId: num, name: fields.slice(1).join(' - ') }
  }

  // não-numérico = arquivo/URL (texto único)
  return { slotKey, name: fields.join(' - '), filePath: withoutHymn }
}

export function parseQuarterPaste(
  text: string,
  context: { year: number },
): QuarterParseResult {
  const groups: QuarterPasteGroup[] = []
  const errors: string[] = []
  let current: QuarterPasteGroup | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    // linha de data: dd/mm (abre bloco) — também aceita dd/mm/yy(yy)
    const dateMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*$/.exec(line)
    if (dateMatch) {
      const day = parseInt(dateMatch[1]!, 10)
      const month = parseInt(dateMatch[2]!, 10)
      let year = context.year
      if (dateMatch[3]) {
        const y = parseInt(dateMatch[3]!, 10)
        year = y < 100 ? 2000 + y : y
      }
      const iso = toISO(day, month, year)
      if (!iso) {
        errors.push(line)
        current = null
        continue
      }
      current = { dateISO: iso, weekday: weekdayOf(iso), entries: [] }
      groups.push(current)
      continue
    }

    // linha única "data — conteúdo"
    const singleMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+[-\u2014|]+\s+(.+)$/.exec(line)
    if (singleMatch) {
      const day = parseInt(singleMatch[1]!, 10)
      const month = parseInt(singleMatch[2]!, 10)
      let year = context.year
      if (singleMatch[3]) {
        const y = parseInt(singleMatch[3]!, 10)
        year = y < 100 ? 2000 + y : y
      }
      const iso = toISO(day, month, year)
      if (!iso) {
        errors.push(line)
        continue
      }
      const entry = parseContentLine(singleMatch[4]!)
      if (entry) {
        groups.push({ dateISO: iso, weekday: weekdayOf(iso), entries: [entry] })
      }
      continue
    }

    // linha de conteúdo dentro do bloco atual
    if (current) {
      const entry = parseContentLine(line)
      if (entry) current.entries.push(entry)
    } else {
      errors.push(line)
    }
  }

  return { groups, errors }
}
