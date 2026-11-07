import { ref } from 'vue'

/** Conexões adicionais servem a outros dispositivos: espelho da TV ou retorno de palco. */
export type ObsKind = 'mirror' | 'return'
export type ObsConnection = { id: string; label: string; selected: boolean; nickname?: string; kind?: ObsKind }
export type ObsModule = 'bible' | 'clock' | 'timer' | 'countdown' | 'random' | 'announcements-carousel'
export const OBS_CONNECTIONS_KEY = 'louvorja-obs-connections-v1'
/** O servidor principal (slot 0) já tem nome próprio na tela e não recebe apelido. */
const MAIN_ID = '0'
let droppedMainNickname = false
function read(): ObsConnection[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OBS_CONNECTIONS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string')
      .map((item) => {
        const nickname = typeof item.nickname === 'string' ? item.nickname.trim().slice(0, 60) : ''
        if (nickname && item.id === MAIN_ID) droppedMainNickname = true
        const kind = item.id !== MAIN_ID && (item.kind === 'mirror' || item.kind === 'return') ? item.kind as ObsKind : undefined
        return {
          id: item.id, label: item.label, selected: item.selected !== false,
          ...(nickname && item.id !== MAIN_ID ? { nickname } : {}),
          ...(kind ? { kind } : {}),
        }
      })
  } catch { return [] }
}
export const obsConnections = ref<ObsConnection[]>(read())
if (droppedMainNickname) localStorage.setItem(OBS_CONNECTIONS_KEY, JSON.stringify(obsConnections.value))
export const obsAssignmentModes = ref<Record<string, 'overlay' | 'share'>>({})
export const obsAssignments = ref<Record<string, ObsModule>>({})
export function notifyObsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('obs-connections-changed'))
}
function save() {
  localStorage.setItem(OBS_CONNECTIONS_KEY, JSON.stringify(obsConnections.value))
  notifyObsChanged()
}
export function registerObsConnection(id: string, label: string, details?: { nickname?: string; kind?: ObsKind }) {
  if (obsConnections.value.some((item) => item.id === id)) return
  const nickname = details?.nickname?.trim().slice(0, 60)
  obsConnections.value = [...obsConnections.value, {
    id, label, selected: true,
    ...(details ? { ...(nickname ? { nickname } : {}), kind: details.kind ?? 'mirror' } : {}),
  }]
  save()
}
export function setObsKind(id: string, kind: ObsKind) {
  if (id === MAIN_ID) return
  obsConnections.value = obsConnections.value.map((connection) => connection.id === id ? { ...connection, kind } : connection)
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

export function obsConnectionName(connection: { id?: string; label: string; nickname?: string }) {
  if (connection.id === MAIN_ID) return 'OBS'
  return connection.nickname || connection.label
}
/** O nome é obrigatório: um nome vazio mantém o anterior. */
export function setObsNickname(id: string, nickname: string) {
  const name = nickname.trim().slice(0, 60)
  if (id === MAIN_ID || !name) return
  obsConnections.value = obsConnections.value.map((connection) => connection.id === id
    ? { ...connection, nickname: name }
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
    const internalLabel = /^OBS\s*\d+$/.test(slot.label) || slot.id === MAIN_ID
    next.push({ id: slot.id, label: `OBS ${number}`, selected: true,
      ...(!internalLabel ? { nickname: slot.label.slice(0, 60) } : {}) })
    changed = true
  }
  if (changed) { obsConnections.value = next; save() }
}
