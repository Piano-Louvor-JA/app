// EDID parser (stdlib-first) — fabricante/modelo dos monitores p/ diagnóstico.
// Sem deps: Linux /sys/class/drm/*/edid; Windows registry DISPLAY; parse puro.
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/** Bytes 8-9: ID fabricante (3 letras, 5 bits cada, big-endian). */
export function edidManufacturer(buf) {
  if (!buf || buf.length < 10) return null
  const letters = []
  for (let shift = 2; shift >= 0; shift -= 1) {
    const code = (buf.readUInt16BE(8) >> (shift * 5)) & 0x1f
    if (code < 1 || code > 26) return null
    letters.push(String.fromCharCode(64 + code))
  }
  return letters.join('')
}

/** Descriptor 0xFC (offset 54/72/90/108): nome legível do monitor. */
export function edidName(buf) {
  if (!buf || buf.length < 72) return null
  for (const base of [54, 72, 90, 108]) {
    if (base + 18 > buf.length) continue
    if (buf[base] === 0 && buf[base + 1] === 0 && buf[base + 2] === 0 && buf[base + 3] === 0xfc) {
      const text = buf.subarray(base + 5, base + 18).toString('ascii')
      const name = text.replace(/[\r\n\0]/g, '').trim()
      if (name) return name
    }
  }
  return null
}

/**
 * Parse de um bloco EDID (>=128 bytes) → dados de diagnóstico.
 * Retorna null se o buffer não parecer EDID válido.
 */
export function parseEdid(buf) {
  if (!buf || buf.length < 128) return null
  const manufacturer = edidManufacturer(buf)
  if (!manufacturer) return null
  return {
    manufacturer,
    productCode: buf.readUInt16LE(10).toString(16).toUpperCase().padStart(4, '0'),
    name: edidName(buf),
  }
}

/** Linux: lê /sys/class/drm/<connector>/edid (binário). */
export function collectEdidLinux(sysClassDrm = '/sys/class/drm') {
  const out = []
  let entries = []
  try { entries = readdirSync(sysClassDrm) } catch { return out }
  for (const entry of entries) {
    // cardX-CONNECTOR (HDMI-A-1, eDP-1...); ignora cardX sem conector.
    if (!entry.includes('-')) continue
    try {
      const buf = readFileSync(path.join(sysClassDrm, entry, 'edid'))
      const parsed = parseEdid(buf)
      if (parsed) out.push({ connector: entry, ...parsed })
    } catch { /* sem EDID (desconectado) */ }
  }
  return out
}

/** Windows: registry DISPLAY\<ven>\<dev>\Device Parameters\EDID via reg.exe. */
export function collectEdidWindows() {
  const out = []
  let currentKey = ''
  try {
    const stdout = execFileSync(
      'reg',
      ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY', '/s', '/f', 'EDID', '/t', 'REG_BINARY'],
      { timeout: 8000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    )
    const lines = stdout.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(/^HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\(.+)$/i)
      if (m) currentKey = m[1]
      const hex = lines[i].match(/EDID\s+REG_BINARY\s+([0-9a-f]+)/i)
      if (hex) {
        const buf = Buffer.from(hex[1], 'hex')
        const parsed = parseEdid(buf)
        if (parsed) out.push({ connector: currentKey, ...parsed })
      }
    }
  } catch { /* reg indisponível/timeout → lista vazia */ }
  return out
}

/** Facade multi-plataforma. macOS: [] (ioreg fora de escopo; reporta vazio). */
export function collectEdidMonitors() {
  if (process.platform === 'linux') return collectEdidLinux()
  if (process.platform === 'win32') return collectEdidWindows()
  return []
}
