/**
 * TVs na rede que ainda não conectaram (módulo Palco), paridade com o apk:
 * - TV LG: responde DIAL em :1926 com `urn:lge:device:tv`;
 * - Android TV com o app Palco: escuta o "wake" em :7082.
 * O wake (abrir o Palco na TV) só existe na Android TV.
 */
import { Socket } from 'node:net'

export const DIAL_PORT = 1926
export const WAKE_PORT = 7082

/** '192.168.0.130' → '192.168.0'; null para IP inválido/loopback. */
export function subnetPrefix(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(String(ip ?? ''))
  if (!m || m[1] === '127') return null
  return `${m[1]}.${m[2]}.${m[3]}`
}

/** Lê o nome da TV LG na resposta DIAL; null se não for TV LG. */
export function parseDial(body) {
  if (typeof body !== 'string' || !body.includes('urn:lge:device:tv')) return null
  const m = /<friendlyName>([^<]+)<\/friendlyName>/.exec(body)
  return (m?.[1] ?? 'LG webOS TV').trim()
}

function tcpOpen(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const sock = new Socket()
    const done = (ok) => { sock.destroy(); resolve(ok) }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
    sock.connect(port, ip)
  })
}

async function probeLg(ip, timeoutMs, fetchImpl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`http://${ip}:${DIAL_PORT}/`, { signal: controller.signal })
    if (!res.ok) return null
    const name = parseDial(await res.text())
    return name ? { ip, name, platform: 'webos', canWake: false } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Varre a /24 de `ownIp`. `exclude` = IPs já conectados (não aparecem).
 * Concorrência limitada para não afogar o Wi-Fi da igreja.
 */
export async function discoverTvs(ownIp, {
  exclude = [],
  timeoutMs = 700,
  concurrency = 40,
  fetchImpl = globalThis.fetch,
  tcpImpl = tcpOpen,
} = {}) {
  const prefix = subnetPrefix(ownIp)
  if (!prefix) return []
  const skip = new Set([ownIp, ...exclude])
  const ips = []
  for (let i = 1; i <= 254; i++) {
    const ip = `${prefix}.${i}`
    if (!skip.has(ip)) ips.push(ip)
  }
  const found = []
  let next = 0
  async function worker() {
    while (next < ips.length) {
      const ip = ips[next++]
      const lg = await probeLg(ip, timeoutMs, fetchImpl)
      if (lg) { found.push(lg); continue }
      if (await tcpImpl(ip, WAKE_PORT, timeoutMs)) {
        found.push({ ip, name: 'Android TV', platform: 'androidtv', canWake: true })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ips.length) }, worker))
  return found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))
}

/** Abre o app Palco na Android TV ([ip]:7082). */
export function wakeTv(ip, timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (!subnetPrefix(ip)) { resolve(false); return }
    const sock = new Socket()
    const done = (ok) => { sock.destroy(); resolve(ok) }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => { sock.write('WAKE\n', () => done(true)) })
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
    sock.connect(WAKE_PORT, ip)
  })
}
