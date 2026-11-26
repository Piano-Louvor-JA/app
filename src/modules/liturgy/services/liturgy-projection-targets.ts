import {
  listExtendedDisplays,
  listSystemDisplays,
} from '@modules/settings/services/display-service'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'

/** Telas de projeção configuradas que existem e não são a do operador. */
export async function resolveTargetMonitorIds(): Promise<number[]> {
  const settings = loadProjectionSettings()
  const displays = await listSystemDisplays()
  const extendedIds = new Set(
    listExtendedDisplays(displays).map((display) => display.id),
  )
  return settings.targetDisplayIds.filter((id) => extendedIds.has(id))
}
