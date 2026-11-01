import { ref } from 'vue'

export type ObsConnection = { id: string; label: string; selected: boolean }
export type ObsModule = 'bible' | 'clock' | 'timer' | 'countdown' | 'random'
export const OBS_CONNECTIONS_KEY = 'louvorja-obs-connections-v1'
function read(): ObsConnection[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OBS_CONNECTIONS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string')
      .map((item) => ({ id: item.id, label: item.label, selected: item.selected !== false }))
  } catch { return [] }
}
export const obsConnections = ref<ObsConnection[]>(read())
export const obsAssignments = ref<Record<string, ObsModule>>({})
export function notifyObsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('obs-connections-changed'))
}
function save() {
  localStorage.setItem(OBS_CONNECTIONS_KEY, JSON.stringify(obsConnections.value))
  notifyObsChanged()
}
export function registerObsConnection(id: string, label: string) {
  if (obsConnections.value.some((item) => item.id === id)) return
  obsConnections.value = [...obsConnections.value, { id, label, selected: true }]
  save()
}
export function unregisterObsConnection(id: string) {
  obsConnections.value = obsConnections.value.filter((item) => item.id !== id)
  const assignments = { ...obsAssignments.value }
  delete assignments[id]
  obsAssignments.value = assignments
  save()
}
export function selectObsConnection(id: string, selected: boolean) {
  obsConnections.value = obsConnections.value.map((item) => item.id === id ? { ...item, selected } : item)
  save()
}
export function assignObsConnection(id: string, module: ObsModule | null) {
  const next = { ...obsAssignments.value }
  if (module) next[id] = module
  else delete next[id]
  obsAssignments.value = next
  notifyObsChanged()
}
export function clearObsModule(module: string) {
  for (const [id, assigned] of Object.entries(obsAssignments.value)) {
    if (assigned === module) assignObsConnection(id, null)
  }
}
export function obsAllowsMirror(id: string, module?: string) {
  const connection = obsConnections.value.find((item) => item.id === id)
  if (!connection) return true
  const assigned = obsAssignments.value[id]
  if (assigned) return assigned === (module === 'hymns' ? 'media' : module)
  return connection.selected
}
