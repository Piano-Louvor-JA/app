import { readFileSync } from 'node:fs'
import nodeOs from 'node:os'
import { ipcMain } from 'electron'

/**
 * Sistema operacional legível para a telemetria de dispositivos
 * (app/.planning/telemetria-dispositivos, Fase 3). O preload roda em
 * sandbox e não tem o módulo `os`, então o renderer pergunta por aqui.
 */

function safe(fn, fallback = '') {
  try {
    return String(fn() ?? fallback)
  } catch {
    return fallback
  }
}

/** PRETTY_NAME do /etc/os-release (ex.: "Ubuntu 26.04 LTS"). */
function linuxPrettyName(readOsRelease) {
  try {
    const match = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(readOsRelease())
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

/**
 * @param {{
 *   os?: { release(): string, version(): string },
 *   platform?: string,
 *   arch?: string,
 *   readOsRelease?: () => string,
 * }} [deps]
 */
export function readSystemInfo(deps = {}) {
  const os = deps.os ?? nodeOs
  const platform = deps.platform ?? process.platform
  const arch = deps.arch ?? process.arch
  const readOsRelease = deps.readOsRelease ?? (() => readFileSync('/etc/os-release', 'utf-8'))
  const release = safe(() => os.release())

  let name
  if (platform === 'win32') {
    name = safe(() => os.version(), 'Windows') || 'Windows'
    // O Windows 11 ainda se apresenta como "Windows 10" no os.version();
    // o build 22000+ é que identifica o 11.
    const build = Number(release.split('.')[2])
    if (build >= 22000) name = name.replace(/Windows 10/, 'Windows 11')
  } else if (platform === 'darwin') {
    name = 'macOS'
  } else if (platform === 'linux') {
    name = linuxPrettyName(readOsRelease) || 'Linux'
  } else {
    name = platform
  }

  return { platform, name, release, arch }
}

export function registerSystemInfoIpc() {
  ipcMain.handle('system:info', () => readSystemInfo())
}
