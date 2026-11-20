/**
 * Biblioteca de sons personalizados do cronômetro (v2).
 *
 * Persistência 100% local (localStorage, data-URLs) — offline-first:
 * nada depende de rede e nada se perde com reload/segundo plano.
 * Chave: `pianolouvorja:countdown:toneLibrary`.
 * Legado (`pianolouvorja:countdown:customTones`, 1 data-URL por marker)
 * é migrado 1x pela UI/store via `migrateLegacyCustomTones`.
 */

export interface CustomTone {
  id: string
  name: string
  dataUrl: string
  createdAt: number
}

export const TONE_LIBRARY_KEY = 'pianolouvorja:countdown:toneLibrary'

/** Limite por tom: 2MB de data-URL (áudios de alerta são curtos). */
export const TONE_LIBRARY_PER_TONE_MAX_BYTES = 2 * 1024 * 1024
/** Quota total da biblioteca: 10MB (localStorage costuma ter ~5-10MB por origem). */
export const TONE_LIBRARY_MAX_TOTAL_BYTES = 10 * 1024 * 1024

function load(): CustomTone[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TONE_LIBRARY_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (t): t is CustomTone =>
        !!t &&
        typeof t === 'object' &&
        typeof (t as CustomTone).id === 'string' &&
        typeof (t as CustomTone).name === 'string' &&
        typeof (t as CustomTone).dataUrl === 'string' &&
        typeof (t as CustomTone).createdAt === 'number',
    )
  } catch {
    return []
  }
}

function save(tones: CustomTone[]): void {
  try {
    localStorage.setItem(TONE_LIBRARY_KEY, JSON.stringify(tones))
  } catch {
    throw new Error('TOO_LARGE')
  }
}

export function listLibraryTones(): CustomTone[] {
  return load().sort((a, b) => a.createdAt - b.createdAt)
}

export function getLibraryTone(id: string): CustomTone | undefined {
  return load().find((t) => t.id === id)
}

/** Tamanho em bytes de uma data-URL (payload base64 ≈ 4/3 do binário; medimos a string). */
function dataSizeBytes(dataUrl: string): number {
  return dataUrl.length
}

export function addLibraryTone(name: string, dataUrl: string): CustomTone {
  if (dataSizeBytes(dataUrl) > TONE_LIBRARY_PER_TONE_MAX_BYTES) {
    throw new Error('TOO_LARGE')
  }
  const tones = load()
  const totalBytes = tones.reduce((sum, t) => sum + dataSizeBytes(t.dataUrl), 0)
  if (totalBytes + dataSizeBytes(dataUrl) > TONE_LIBRARY_MAX_TOTAL_BYTES) {
    throw new Error('TOO_LARGE')
  }
  const tone: CustomTone = {
    id: `tone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Som sem nome',
    dataUrl,
    createdAt: Date.now(),
  }
  tones.push(tone)
  save(tones)
  return tone
}

export function renameLibraryTone(id: string, name: string): CustomTone | undefined {
  const tones = load()
  const tone = tones.find((t) => t.id === id)
  if (!tone) return undefined
  tone.name = name.trim() || tone.name
  save(tones)
  return tone
}

export function removeLibraryTone(id: string): boolean {
  const tones = load()
  const next = tones.filter((t) => t.id !== id)
  if (next.length === tones.length) return false
  save(next)
  return true
}

/**
 * Migra 1x o formato legado (`customTones`: 1 data-URL por marker) para a
 * biblioteca. Idempotente: se a library já tem tom cujo dataUrl é o mesmo,
 * não duplica. Retorna ids criados por marker legado.
 */
export function migrateLegacyCustomTones(
  legacy: Partial<Record<'start' | '5min' | '1min', string>>,
): Partial<Record<'start' | '5min' | '1min', string>> {
  const tones = load()
  const existingUrls = new Set(tones.map((t) => t.dataUrl))
  const idsByMarker: Partial<Record<'start' | '5min' | '1min', string>> = {}
  for (const marker of ['start', '5min', '1min'] as const) {
    const dataUrl = legacy[marker]
    if (!dataUrl) continue
    const existing = tones.find((t) => t.dataUrl === dataUrl)
    if (existing) {
      idsByMarker[marker] = existing.id
      continue
    }
    try {
      const tone = addLibraryTone(`Som ${marker} (migrado)`, dataUrl)
      idsByMarker[marker] = tone.id
    } catch {
      // quota — deixa o legado onde está, não bloqueia o app
    }
  }
  return idsByMarker
}
