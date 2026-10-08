/**
 * Parser do formato `.ja` exportado pelo LouvorJA Delphi.
 *
 * Mesma spec do APK (lib/core/services/liturgy/ja_liturgy_parser.dart):
 * INI-like UTF-8 BOM/CRLF; `[item_<ts>[_d<dia>_i<n>]]`; `[Geral]` chaves
 * 1..7 (segunda..domingo) ordenam os ids separados por `;`.
 * IDs de música Delphi são compatíveis com a API louvorja.com.br.
 */
import type { LiturgyItem, LiturgyItemType, LiturgyWeekday } from '../types/liturgy'
import { decodeTextFileBytes } from '@shared/services/text-encoding'

export type JaLiturgy = Partial<Record<LiturgyWeekday, LiturgyItem[]>>

/** Dia do .ja do Delphi: 1=domingo .. 7=sábado (NOMES_DIAS em
 * fmCopiaLiturgiaDia.pas; chave 7 = Escola Sabatina de sábado). */
const JA_DAYS: Record<number, LiturgyWeekday> = {
  1: 'sunday',
  2: 'monday',
  3: 'tuesday',
  4: 'wednesday',
  5: 'thursday',
  6: 'friday',
  7: 'saturday',
}

const SECTION_RE = /^\[(.+)\]$/
const KV_RE = /^([^=]+)=(.*)$/
const DELPHI_COLOR_RE = /^\$([0-9A-Fa-f]{8})$/

function baseId(id: string): string {
  return id.replace(/_d\d+_i\d+$/, '')
}

function delphiColor(raw: string): string {
  const m = DELPHI_COLOR_RE.exec(raw.trim())
  if (!m) return ''
  const hex = m[1]!
  const b = hex.slice(2, 4)
  const g = hex.slice(4, 6)
  const r = hex.slice(6, 8)
  return `#${r}${g}${b}`
}

function typeFromPath(path: string): LiturgyItemType {
  const p = path.toLowerCase()
  if (!p) return 'other_files'
  if (/\.(mp4|mkv|avi|webm|mov)$/.test(p)) return 'video'
  if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(p)) return 'images'
  if (p.endsWith('.pdf')) return 'pdf'
  if (/\.(pptx|ppt)$/.test(p)) return 'presentation'
  return 'other_files'
}

function parseSectionItem(
  sectionId: string,
  f: Map<string, string>,
): LiturgyItem | null {
  const tipo = f.get('tipo')?.trim().toLowerCase()
  const name = f.get('item') ?? ''
  const subitem = f.get('subitem') ?? ''
  const checked = f.get('checked') ?? ''
  // Semântica Delphi: checked guarda a DATA (dd/mm/aaaa) do dia em que foi
  // marcado; item só está done se a data == HOJE (reset automático na virada
  // do dia — fmMenu.pas: checkbox.Checked := checked == FormatDateTime('dd/mm/yyyy', Now)).
  const isDoneToday = () => {
    const v = checked.trim()
    if (!v) return false
    const now = new Date()
    const dd = String(now.getDate()).padStart(2, '0')
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yyyy = String(now.getFullYear())
    return v === `${dd}/${mm}/${yyyy}`
  }
  const cor = f.get('cor') ?? ''
  const musicId = Number.parseInt(f.get('musica') ?? '', 10)

  let type: LiturgyItemType | null = null
  if (tipo === 'musica') type = 'music'
  else if (tipo === 'anotacao') type = 'annotation'
  else if (tipo === 'arquivo') type = typeFromPath(f.get('dir') ?? subitem)
  if (!type) return null

  const dir = f.get('dir')?.trim()
  const isFile = type !== 'music' && type !== 'annotation'

  return {
    id: `ja_${baseId(sectionId)}`,
    type,
    name: name || subitem,
    subtitle: subitem,
    done: isDoneToday(),
    durationMs: 0,
    accentColor: delphiColor(cor),
    musicId: type === 'music' && Number.isFinite(musicId) ? musicId : null,
    filePath: isFile && dir ? dir : undefined,
  }
}

/** Faz o parse; lança Error em arquivo estruturalmente inválido. */
export function parseJaLiturgy(raw: string): JaLiturgy {
  let text = raw
  if (text.startsWith('﻿')) text = text.slice(1)

  const sections = new Map<string, Map<string, string>>()
  let current: string | null = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const sec = SECTION_RE.exec(line)
    if (sec) {
      current = sec[1]!.toLowerCase()
      sections.set(current, new Map())
      continue
    }
    const kv = current ? KV_RE.exec(line) : null
    if (kv && current)
      sections.get(current)!.set(kv[1]!.trim().toLowerCase(), kv[2]!)
  }

  const geral = sections.get('geral')
  if (!geral) throw new Error('Arquivo .ja sem seção [Geral]')

  const itemsById = new Map<string, LiturgyItem>()
  for (const [sectionId, fields] of sections) {
    if (sectionId === 'geral') continue
    const item = parseSectionItem(sectionId, fields)
    if (item && !itemsById.has(baseId(sectionId))) {
      itemsById.set(baseId(sectionId), item)
    }
  }
  if (itemsById.size === 0) throw new Error('Arquivo .ja sem itens de liturgia')

  const result: JaLiturgy = {}
  for (const [dayKey, refs] of geral) {
    const dayNum = Number.parseInt(dayKey, 10)
    const weekday = JA_DAYS[dayNum]
    if (!weekday) continue
    const list: LiturgyItem[] = []
    for (const ref of refs.split(';')) {
      const id = ref.trim().toLowerCase()
      if (!id) continue
      const item = itemsById.get(baseId(id))
      if (item) list.push(item)
    }
    if (list.length > 0) result[weekday] = list
  }
  if (Object.keys(result).length === 0) {
    throw new Error('[Geral] sem ordem de itens por dia')
  }
  return result
}

/**
 * Decodifica bytes do .ja: Delphi exporta ANSI (Windows-1252); versões
 * novas/convertidas vêm em UTF-8. Tenta UTF-8 estrito, cai pro Latin-1.
 */
export function decodeJaBytes(bytes: Uint8Array): string {
  return decodeTextFileBytes(bytes)
}
