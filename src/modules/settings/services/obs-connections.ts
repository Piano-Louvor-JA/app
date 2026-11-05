import { ref } from 'vue'

export type ObsConnection = { id: string; label: string; selected: boolean; nickname?: string }
export type ObsModule = 'bible' | 'clock' | 'timer' | 'countdown' | 'random'
export const OBS_CONNECTIONS_KEY = 'louvorja-obs-connections-v1'
function read(): ObsConnection[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OBS_CONNECTIONS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string')
      .map((item) => ({ id: item.id, label: item.label, selected: item.selected !== false, ...(typeof item.nickname === 'string' && item.nickname.trim() ? { nickname: item.nickname.trim().slice(0, 60) } : {}) }))
  } catch { return [] }
}
export const obsConnections = ref<ObsConnection[]>(read())
export const obsAssignmentModes = ref<Record<string, 'overlay' | 'share'>>({})
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
  delete obsAssignmentModes.value[id]
  delete assignments[id]
  obsAssignments.value = assignments
  save()
}
export function selectObsConnection(id: string, selected: boolean) {
  obsConnections.value = obsConnections.value.map((item) => item.id === id ? { ...item, selected } : item)
  save()
}
export function assignObsConnection(id: string, module: ObsModule | null, mode: 'overlay' | 'share' = 'overlay') {
  if (module) obsAssignmentModes.value[id] = mode
  else delete obsAssignmentModes.value[id]
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
  if (assigned && obsAssignmentModes.value[id] === 'share') return true
  if (assigned) return assigned === (module === 'hymns' ? 'media' : module)
  return connection.selected
}

export function obsConnectionName(connection: { label: string; nickname?: string }) {
  return connection.nickname ? `${connection.label} — ${connection.nickname}` : connection.label
}
export function setObsNickname(id: string, nickname: string) {
  if (id === '0') registerObsConnection('0', 'OBS 1')
  obsConnections.value = obsConnections.value.map((connection) => connection.id === id
    ? { ...connection, nickname: nickname.trim().slice(0, 60) }
    : connection)
  save()
}

/** Adopt existing Palco slots without recreating ports, routes or nicknames. */
export function migratePalcoConnections(slots: ReadonlyArray<{ id: string; label: string }>) {
  let changed = false
  const next = [...obsConnections.value]
  for (const slot of slots) {
    if (typeof slot.id !== 'string' || typeof slot.label !== 'string') continue
    if (next.some(connection => connection.id === slot.id)) continue
    const number = slot.id === '0' ? 1 : Math.max(1, ...next.map(item => Number(item.label.match(/\d+$/)?.[0]) || 1)) + 1
    // "Principal" é o rótulo interno do slot 0 no main, não um apelido do operador.
    const internalLabel = /^OBS\s*\d+$/.test(slot.label) || (slot.id === '0' && slot.label === 'Principal')
    next.push({ id: slot.id, label: `OBS ${number}`, selected: true,
      ...(!internalLabel ? { nickname: slot.label.slice(0, 60) } : {}) })
    changed = true
  }
  if (changed) { obsConnections.value = next; save() }
}
