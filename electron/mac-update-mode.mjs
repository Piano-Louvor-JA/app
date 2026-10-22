import { spawnSync } from 'node:child_process'

/** Squirrel.Mac exige Developer ID; ad-hoc não permite instalação automática. */
export function needsManualMacUpdate(platform = process.platform, run = spawnSync) {
  if (platform !== 'darwin') return false
  try {
    const result = run('/usr/bin/codesign', ['--display', '--verbose=2', process.execPath], {
      encoding: 'utf8', timeout: 5000,
    })
    return result.status !== 0 || !/^Authority=Developer ID Application:/m.test(result.stderr || '')
  } catch { return true }
}

export function macInstallerUrl(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) return null
  return `https://github.com/Piano-Louvor-JA/app/releases/download/v${version}/LouvorJA-PIANO-${version}-universal.dmg`
}
