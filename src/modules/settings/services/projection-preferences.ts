import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

import {
  DEFAULT_PROJECTION_SETTINGS,
  type LyricFontWeight,
  type LyricVerticalAlign,
  type MonitorArrangementSlot,
  type ProjectionSettings,
} from '../types/projection'

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number')
}

function asArrangement(value: unknown): MonitorArrangementSlot[] {
  if (!Array.isArray(value)) return []
  const slots: MonitorArrangementSlot[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const displayId = row.displayId
    const x = row.x
    const y = row.y
    if (typeof displayId !== 'number' || !Number.isFinite(displayId)) continue
    if (typeof x !== 'number' || !Number.isFinite(x)) continue
    if (typeof y !== 'number' || !Number.isFinite(y)) continue
    slots.push({ displayId, x, y })
  }
  return slots
}

function asAlign(value: unknown): LyricVerticalAlign {
  if (value === 'top' || value === 'center' || value === 'bottom') return value
  // Compatibilidade com legado (Cima/Centro/Baixo)
  if (value === 'Cima') return 'top'
  if (value === 'Centro') return 'center'
  if (value === 'Baixo') return 'bottom'
  return DEFAULT_PROJECTION_SETTINGS.lyricAlign
}

function asFontWeight(value: unknown): LyricFontWeight {
  if (
    value === '400' ||
    value === '600' ||
    value === '700' ||
    value === '900'
  ) {
    return value
  }
  return DEFAULT_PROJECTION_SETTINGS.fontWeight
}

export function normalizeProjectionSettings(raw: unknown): ProjectionSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PROJECTION_SETTINGS }
  }

  const source = raw as Record<string, unknown>

  return {
    targetDisplayIds: asNumberArray(source.targetDisplayIds),
    declinedDisplayIds: asNumberArray(source.declinedDisplayIds),
    monitorArrangement: asArrangement(source.monitorArrangement),
    openFullscreenOnPrimary: asBoolean(
      source.openFullscreenOnPrimary,
      DEFAULT_PROJECTION_SETTINGS.openFullscreenOnPrimary,
    ),
    disablePrimaryWhenExtended: asBoolean(
      source.disablePrimaryWhenExtended,
      DEFAULT_PROJECTION_SETTINGS.disablePrimaryWhenExtended,
    ),
    autoMinimizePlayer: asBoolean(
      source.autoMinimizePlayer,
      DEFAULT_PROJECTION_SETTINGS.autoMinimizePlayer,
    ),
    openReturnScreen: asBoolean(
      source.openReturnScreen,
      DEFAULT_PROJECTION_SETTINGS.openReturnScreen,
    ),
    returnDisplayId:
      typeof source.returnDisplayId === 'number' && Number.isFinite(source.returnDisplayId)
        ? source.returnDisplayId
        : null,
    lyricAlign: asAlign(source.lyricAlign),
    showSongTitle: asBoolean(
      source.showSongTitle,
      DEFAULT_PROJECTION_SETTINGS.showSongTitle,
    ),
    customTextFormat: asBoolean(
      source.customTextFormat,
      DEFAULT_PROJECTION_SETTINGS.customTextFormat,
    ),
    customBackground: asBoolean(
      source.customBackground,
      DEFAULT_PROJECTION_SETTINGS.customBackground,
    ),
    fontSizePercent: Math.min(
      200,
      Math.max(
        50,
        asNumber(source.fontSizePercent, DEFAULT_PROJECTION_SETTINGS.fontSizePercent),
      ),
    ),
    fontColor: asString(source.fontColor, DEFAULT_PROJECTION_SETTINGS.fontColor),
    fontWeight: asFontWeight(source.fontWeight),
    backgroundColor: asString(
      source.backgroundColor,
      DEFAULT_PROJECTION_SETTINGS.backgroundColor,
    ),
    backgroundImage:
      typeof source.backgroundImage === 'string' ? source.backgroundImage : null,
    backgroundOpacity: Math.min(
      100,
      Math.max(
        0,
        asNumber(
          source.backgroundOpacity,
          DEFAULT_PROJECTION_SETTINGS.backgroundOpacity,
        ),
      ),
    ),
  }
}

export function loadProjectionSettings(): ProjectionSettings {
  const stored = getUserPreference<unknown>(
    USER_PREFERENCE_KEYS.projectionSettings,
    null,
  )
  return normalizeProjectionSettings(stored)
}

export function saveProjectionSettings(settings: ProjectionSettings): void {
  setUserPreference(USER_PREFERENCE_KEYS.projectionSettings, settings)
}

/**
 * Monitores estendidos novos entram selecionados, salvo se o operador já
 * os tiver desmarcado (declinedDisplayIds).
 */
export function reconcileTargetDisplays(
  settings: ProjectionSettings,
  extendedDisplayIds: number[],
): ProjectionSettings {
  const declined = new Set(settings.declinedDisplayIds)
  const current = new Set(settings.targetDisplayIds)
  let changed = false

  for (const id of extendedDisplayIds) {
    if (!current.has(id) && !declined.has(id)) {
      current.add(id)
      changed = true
    }
  }

  const nextTargets = [...current].filter((id) => extendedDisplayIds.includes(id))
  const nextDeclined = settings.declinedDisplayIds.filter((id) =>
    extendedDisplayIds.includes(id),
  )

  if (
    !changed &&
    nextTargets.length === settings.targetDisplayIds.length &&
    nextDeclined.length === settings.declinedDisplayIds.length
  ) {
    return settings
  }

  return {
    ...settings,
    targetDisplayIds: nextTargets,
    declinedDisplayIds: nextDeclined,
  }
}

export function toggleTargetDisplay(
  settings: ProjectionSettings,
  displayId: number,
): ProjectionSettings {
  const selected = settings.targetDisplayIds.includes(displayId)

  if (selected) {
    return {
      ...settings,
      targetDisplayIds: settings.targetDisplayIds.filter((id) => id !== displayId),
      declinedDisplayIds: settings.declinedDisplayIds.includes(displayId)
        ? settings.declinedDisplayIds
        : [...settings.declinedDisplayIds, displayId],
    }
  }

  return {
    ...settings,
    targetDisplayIds: [...settings.targetDisplayIds, displayId],
    declinedDisplayIds: settings.declinedDisplayIds.filter((id) => id !== displayId),
  }
}

export function setReturnDisplayId(
  settings: ProjectionSettings,
  displayId: number | null,
): ProjectionSettings {
  if (displayId == null) {
    return { ...settings, returnDisplayId: null }
  }

  return {
    ...settings,
    returnDisplayId: displayId,
    targetDisplayIds: settings.targetDisplayIds.includes(displayId)
      ? settings.targetDisplayIds
      : [...settings.targetDisplayIds, displayId],
    declinedDisplayIds: settings.declinedDisplayIds.filter((id) => id !== displayId),
  }
}

export function pickDefaultReturnDisplayId(
  settings: ProjectionSettings,
  displays: ReadonlyArray<{ id: number; isPrimary: boolean }>,
): number | null {
  if (displays.length === 0) return null

  const audience = new Set(settings.targetDisplayIds)
  const extended = displays.filter((display) => !display.isPrimary)
  const freeExtended = extended.find((display) => !audience.has(display.id))
  if (freeExtended) return freeExtended.id
  if (extended[0]) return extended[0].id

  const primary = displays.find((display) => display.isPrimary)
  /* v8 ignore next 1 -- length===0 já retornou acima; displays[0] sempre existe aqui */
  return primary?.id ?? displays[0]?.id ?? null
}

/** Liga o retorno e escolhe um monitor se ainda não houver um válido. */
export function enableReturnScreen(
  settings: ProjectionSettings,
  displays: ReadonlyArray<{ id: number; isPrimary: boolean }>,
): ProjectionSettings {
  const next = { ...settings, openReturnScreen: true }
  const currentId = next.returnDisplayId
  if (currentId != null && displays.some((display) => display.id === currentId)) {
    return setReturnDisplayId(next, currentId)
  }

  const picked = pickDefaultReturnDisplayId(next, displays)
  if (picked == null) {
    return { ...next, returnDisplayId: null }
  }

  return setReturnDisplayId(next, picked)
}

export function resolveReturnMonitorId(
  settings: ProjectionSettings,
  displayIds: number[],
): number | null {
  if (!settings.openReturnScreen) return null
  const id = settings.returnDisplayId
  if (id == null) return null
  return displayIds.includes(id) ? id : null
}

/**
 * Retorno só fica aberto se o monitor estiver marcado na seleção atual.
 * Desmarcar em "Selecionar telas" fecha a janela.
 */
export function resolveSelectedReturnMonitorId(
  settings: ProjectionSettings,
  displayIds: number[],
  selectedIds: number[],
): number | null {
  const returnId = resolveReturnMonitorId(settings, displayIds)
  if (returnId == null) return null
  return selectedIds.includes(returnId) ? returnId : null
}

/** Remove o monitor de retorno se ele não existir mais. */
export function pruneReturnDisplay(
  settings: ProjectionSettings,
  displayIds: number[],
): ProjectionSettings {
  if (settings.returnDisplayId == null) return settings
  if (displayIds.includes(settings.returnDisplayId)) return settings
  return {
    ...settings,
    returnDisplayId: null,
    openReturnScreen: false,
  }
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('invalid image result'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}
