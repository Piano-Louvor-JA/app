/**
 * Configuração da Transmissão (SPEC-06): rede, token, portas e aparência do
 * overlay. Funções puras — o palco-server injeta caminhos e interfaces.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const DEFAULT_TRANSMISSION = Object.freeze({ bind: 'all', requireToken: true })

export const MIN_PORT = 1024
export const MAX_PORT = 65534

export const DEFAULT_OVERLAY_STYLE = Object.freeze({
  layout: 'lower-third',
  theme: 'dark',
  position: 'bottom',
  textScale: 100,
  showHeading: true,
  accentColor: '#FFD54A',
  bandOpacity: 60,
})

const LAYOUTS = ['lower-third', 'fullscreen']
const THEMES = ['dark', 'light', 'transparent']
const POSITIONS = ['bottom', 'top']
const VIRTUAL_ADAPTER = /docker|veth|br-|virbr|vbox|virtualbox|vmware|vmnet|hyper-v|vethernet|wsl|tailscale|zerotier|utun|hamachi/i

export function isIPv4(value) {
  if (typeof value !== 'string') return false
  const parts = value.split('.')
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function normalizeBind(value) {
  return value === 'local' || isIPv4(value) ? value : 'all'
}

export function readTransmissionConfig(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return { bind: normalizeBind(raw?.bind), requireToken: raw?.requireToken !== false }
  } catch {
    return { ...DEFAULT_TRANSMISSION }
  }
}

export function saveTransmissionConfig(file, state) {
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  const next = { bind: normalizeBind(state?.bind), requireToken: state?.requireToken !== false }
  writeFileSync(temp, JSON.stringify(next), 'utf8')
  renameSync(temp, file)
  return next
}

function privateRank(address) {
  if (address.startsWith('192.168.')) return 0
  if (address.startsWith('10.')) return 1
  const [a, b] = address.split('.').map(Number)
  if (a === 172 && b >= 16 && b <= 31) return 2
  return 3
}

/** IPv4 externos, adaptadores físicos de rede privada primeiro e virtuais por último. */
export function rankInterfaces(interfaces) {
  const found = []
  for (const [name, entries] of Object.entries(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      const ipv4 = entry?.family === 'IPv4' || entry?.family === 4
      if (!ipv4 || entry.internal || !isIPv4(entry.address)) continue
      found.push({ name, address: entry.address, virtual: VIRTUAL_ADAPTER.test(name) })
    }
  }
  return found
    .map((item, order) => ({ item, order }))
    .sort((a, b) =>
      Number(a.item.virtual) - Number(b.item.virtual) ||
      privateRank(a.item.address) - privateRank(b.item.address) ||
      a.order - b.order)
    .map(({ item }) => item)
}

export function listenHostFor(bind) {
  if (bind === 'local') return '127.0.0.1'
  return isIPv4(bind) ? bind : '0.0.0.0'
}

/** Endereço de escuta e host usado nos links, com queda para "todas as redes". */
export function resolveBind(bind, ranked) {
  const best = ranked[0]?.address ?? '127.0.0.1'
  if (bind === 'local') return { bind, listenHost: '127.0.0.1', linkHost: '127.0.0.1', missing: false }
  if (isIPv4(bind)) {
    if (ranked.some(item => item.address === bind)) return { bind, listenHost: bind, linkHost: bind, missing: false }
    return { bind: 'all', listenHost: '0.0.0.0', linkHost: best, missing: true }
  }
  return { bind: 'all', listenHost: '0.0.0.0', linkHost: best, missing: false }
}

/** Porta HTTP de uma conexão; o WS usa sempre a seguinte. */
export function validatePort(httpPort, takenHttpPorts) {
  if (!Number.isInteger(httpPort) || httpPort < MIN_PORT || httpPort > MAX_PORT) return { ok: false, reason: 'range' }
  const clash = takenHttpPorts.some(taken => Math.abs(taken - httpPort) <= 1)
  return clash ? { ok: false, reason: 'collision' } : { ok: true }
}

/** Próximo par livre a partir de `from`, em passos de 2; `busy` = portas ocupadas por outros programas. */
export function suggestPort(from, takenHttpPorts, busy = []) {
  for (let port = Math.max(from, MIN_PORT); port <= MAX_PORT; port += 2) {
    if (busy.includes(port) || busy.includes(port + 1)) continue
    if (validatePort(port, takenHttpPorts).ok) return port
  }
  return null
}

export function normalizeOverlayStyle(input) {
  const source = input && typeof input === 'object' ? input : {}
  const scale = Number(source.textScale)
  const band = Number(source.bandOpacity)
  return {
    layout: LAYOUTS.includes(source.layout) ? source.layout : DEFAULT_OVERLAY_STYLE.layout,
    theme: THEMES.includes(source.theme) ? source.theme : DEFAULT_OVERLAY_STYLE.theme,
    position: POSITIONS.includes(source.position) ? source.position : DEFAULT_OVERLAY_STYLE.position,
    textScale: typeof source.textScale === 'number' && Number.isFinite(scale)
      ? Math.min(160, Math.max(70, Math.round(scale / 10) * 10))
      : DEFAULT_OVERLAY_STYLE.textScale,
    showHeading: typeof source.showHeading === 'boolean' ? source.showHeading : DEFAULT_OVERLAY_STYLE.showHeading,
    accentColor: typeof source.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.accentColor)
      ? source.accentColor.toUpperCase()
      : DEFAULT_OVERLAY_STYLE.accentColor,
    bandOpacity: typeof source.bandOpacity === 'number' && Number.isFinite(band)
      ? Math.min(100, Math.max(0, Math.round(band / 5) * 5))
      : DEFAULT_OVERLAY_STYLE.bandOpacity,
  }
}
