import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'

export function readConnectionStartup(file) {
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'))
    return { enabled: state.enabled !== false, activeIds: Array.isArray(state.activeIds) ? [...new Set(state.activeIds.filter(id => typeof id === 'string'))] : [] }
  } catch { return { enabled: true, activeIds: [] } }
}
export function saveConnectionStartup(file, state) {
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify({ enabled: state.enabled === true, activeIds: state.enabled ? state.activeIds : [] }), 'utf8')
  renameSync(temp, file)
}
