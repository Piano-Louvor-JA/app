import { exec } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { startLibreOfficeMirror } from './presentation-libreoffice-mirror.mjs'
import {
  readWorkspaceRecord,
  writeWorkspaceRecord,
} from '../workspace.mjs'

const execAsync = promisify(exec)

/**
 * Abre a apresentação no aplicativo externo escolhido pelo usuário
 * (LibreOffice Impress ou Microsoft PowerPoint), em modo slideshow.
 *
 * Contrato de produto (app#176, feedback Rafael 12/09): engine explícito
 * no item da liturgia = ABRE O PROGRAMA por fora (fidelidade 100%, o
 * aplicativo cuida da própria tela cheia). 'auto' = conversão interna
 * do app (PDF/PNGs) que alimenta a projeção multi-tela.
 */

const POWERPOINT_CANDIDATES = [
  'C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\POWERPNT.EXE',
  'C:\\Program Files\\Microsoft Office\\Office16\\POWERPNT.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office16\\POWERPNT.EXE',
  'C:\\Program Files\\Microsoft Office\\root\\Office15\\POWERPNT.EXE',
  'C:\\Program Files\\Microsoft Office\\Office15\\POWERPNT.EXE',
  '/Applications/Microsoft PowerPoint.app/Contents/MacOS/Microsoft PowerPoint',
]

const SOFFICE_CANDIDATES = [
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/lib/libreoffice/program/soffice',
  '/snap/bin/libreoffice',
  '/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
]

const ONLYOFFICE_CANDIDATES = [
  'onlyoffice-desktopeditors',
  'DesktopEditors',
  'onlyoffice',
  '/usr/bin/onlyoffice-desktopeditors',
  '/usr/bin/desktopeditors',
  '/opt/onlyoffice/desktopeditors/DesktopEditors',
  '/opt/onlyoffice/desktopeditors/editors_startup.sh',
  '/snap/bin/onlyoffice-desktopeditors',
  '/var/lib/flatpak/exports/bin/org.onlyoffice.desktopeditors',
  'C:\\Program Files\\ONLYOFFICE\\DesktopEditors\\DesktopEditors.exe',
  '/Applications/ONLYOFFICE.app/Contents/MacOS/ONLYOFFICE',
]

const WPS_CANDIDATES = [
  'wpp',
  'wps',
  'wps-office',
  'wpsoffice',
  '/usr/bin/wpp',
  '/usr/bin/wps',
  '/usr/bin/wps-office',
  '/usr/bin/wpsoffice',
  '/opt/kingsoft/wps-office/office6/wpp',
  '/opt/kingsoft/wps-office/office6/wps',
  '/opt/wps-office/office6/wpp',
  '/opt/wps-office/office6/wps',
  '/snap/bin/wps-office',
  '/snap/bin/wpp',
  '/var/lib/flatpak/exports/bin/com.wps.Office',
  'C:\\Program Files (x86)\\WPS Office\\ksolaunch.exe',
  'C:\\Program Files\\WPS Office\\ksolaunch.exe',
]

const KEYNOTE_CANDIDATES = ['/Applications/Keynote.app/Contents/MacOS/Keynote']

const CALLIGRA_CANDIDATES = [
  'calligrastage',
  '/usr/bin/calligrastage',
  '/usr/local/bin/calligrastage',
]

/** Apps conhecidos além do modo Automático. */
export const KNOWN_PRESENTATION_APPS = [
  {
    id: 'powerpoint',
    label: 'Microsoft PowerPoint',
    candidates: ['POWERPNT.EXE', 'powerpnt', ...POWERPOINT_CANDIDATES],
    hints: ['powerpoint', 'powerpnt'],
  },
  {
    id: 'libreoffice',
    label: 'LibreOffice',
    candidates: SOFFICE_CANDIDATES,
    hints: ['libreoffice', 'soffice', 'impress'],
  },
  {
    id: 'onlyoffice',
    label: 'ONLYOFFICE',
    candidates: ONLYOFFICE_CANDIDATES,
    hints: ['onlyoffice', 'desktopeditors'],
  },
  {
    id: 'wps',
    label: 'WPS Office',
    candidates: WPS_CANDIDATES,
    hints: ['wps-office', 'wpsoffice', 'wpp', 'kingsoft'],
  },
  {
    id: 'keynote',
    label: 'Keynote',
    candidates: KEYNOTE_CANDIDATES,
    hints: ['keynote'],
  },
  {
    id: 'calligra',
    label: 'Calligra Stage',
    candidates: CALLIGRA_CANDIDATES,
    hints: ['calligrastage', 'calligra'],
  },
]

export const EXTERNAL_PRESENTATION_ENGINES = [
  'powerpoint',
  'libreoffice',
  'onlyoffice',
  'wps',
  'keynote',
  'calligra',
  'custom',
]

function whichSync(command) {
  const pathEnv = process.env.PATH || ''
  const parts = pathEnv.split(path.delimiter)
  const extensions = process.platform === 'win32' ? ['.exe', '', '.bat', '.cmd'] : ['']
  for (const dir of parts) {
    for (const ext of extensions) {
      const full = path.join(dir, command + ext)
      try {
        if (existsSync(full)) return full
      } catch {
        // continue
      }
    }
  }
  return null
}

function findBinary(candidates) {
  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    const found = whichSync(candidate)
    if (found) return found
  }
  return null
}

async function resolveOnPath(command) {
  if (!command) return null
  const cmd =
    process.platform === 'win32' ? `where "${command}"` : `command -v "${command}"`
  try {
    const { stdout } = await execAsync(cmd, { timeout: 2500 })
    const hit = stdout.trim().split(/\r?\n/).find(Boolean)
    return hit && existsSync(hit) ? hit : hit || null
  } catch {
    return null
  }
}

function extraSearchDirs() {
  const home = homedir()
  return [
    '/usr/bin',
    '/usr/local/bin',
    '/snap/bin',
    path.join(home, '.local/bin'),
    path.join(home, '.local/share/flatpak/exports/bin'),
    '/var/lib/flatpak/exports/bin',
    '/opt/onlyoffice/desktopeditors',
    '/opt/kingsoft/wps-office/office6',
    '/opt/wps-office/office6',
  ]
}

function scanDirsForHints(hints) {
  for (const dir of extraSearchDirs()) {
    if (!existsSync(dir)) continue
    let names
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const lower = name.toLowerCase()
      if (hints.some((hint) => lower.includes(hint))) {
        const full = path.join(dir, name)
        if (existsSync(full)) return full
      }
    }
  }
  return null
}

function parseDesktopExec(filePath) {
  try {
    const text = readFileSync(filePath, 'utf8')
    const line = text.split(/\r?\n/).find((row) => row.startsWith('Exec='))
    if (!line) return null
    const raw = line.slice('Exec='.length).trim().replace(/^["']|["']$/g, '')
    const bin = raw.split(/\s+/)[0]?.replace(/^["']|["']$/g, '')
    if (!bin) return null
    return existsSync(bin) ? bin : whichSync(path.basename(bin)) ?? bin
  } catch {
    return null
  }
}

function findFromDesktopFiles(hints) {
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    '/var/lib/snapd/desktop/applications',
    '/var/lib/flatpak/exports/share/applications',
    path.join(homedir(), '.local/share/applications'),
    path.join(homedir(), '.local/share/flatpak/exports/share/applications'),
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    let files
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    const ranked = files
      .filter((file) => file.endsWith('.desktop'))
      .filter((file) => hints.some((hint) => file.toLowerCase().includes(hint)))
      .sort((a, b) => {
        const score = (name) => {
          const lower = name.toLowerCase()
          if (lower.includes('wpp')) return 0
          if (hints.some((hint) => lower.startsWith(hint))) return 1
          return 2
        }
        return score(a) - score(b)
      })
    for (const file of ranked) {
      const execPath = parseDesktopExec(path.join(dir, file))
      if (execPath) return execPath
    }
  }
  return null
}

async function resolvePresentationApp(app) {
  const fromCandidates = findBinary(app.candidates)
  if (fromCandidates) return fromCandidates

  for (const candidate of app.candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) continue
    const fromPath = await resolveOnPath(candidate)
    if (fromPath) return fromPath
  }

  const fromDirs = scanDirsForHints(app.hints)
  if (fromDirs) return fromDirs

  return findFromDesktopFiles(app.hints)
}

export function hasPowerPoint() {
  return Boolean(findBinary(['POWERPNT.EXE', 'powerpnt', ...POWERPOINT_CANDIDATES]))
}

export function hasLibreOffice() {
  return Boolean(findBinary(SOFFICE_CANDIDATES))
}

export function isExternalPresentationEngine(engine) {
  return EXTERNAL_PRESENTATION_ENGINES.includes(String(engine ?? ''))
}

/**
 * Apps de apresentação instalados nesta máquina (além do modo Automático).
 * @returns {Promise<Array<{id: string, label: string}>>}
 */
export async function detectInstalledPresentationEngines() {
  const found = []
  for (const app of KNOWN_PRESENTATION_APPS) {
    const bin = await resolvePresentationApp(app)
    if (bin) found.push({ id: app.id, label: app.label })
  }
  return found
}

/** App externo custom de apresentação salvo pelo usuário (workspace). */
export function getCustomPresentationApp() {
  try {
    const rec = readWorkspaceRecord('presentation-custom-app')
    if (
      typeof rec?.path === 'string' &&
      rec.path.trim() &&
      existsSync(rec.path.trim())
    ) {
      return rec.path.trim()
    }
  } catch {
    // default
  }
  return null
}

export function setCustomPresentationApp(appPath) {
  const clean = String(appPath ?? '').trim()
  if (!clean || !existsSync(clean)) return false
  return writeWorkspaceRecord('presentation-custom-app', { path: clean })
}

/**
 * Argumentos para o app custom já abrir em modo apresentação, quando o
 * executável é reconhecido (LibreOffice `--show`, PowerPoint `/S` no Windows).
 * App desconhecido não recebe argumento extra.
 * @param {string} bin
 * @returns {string} argumentos seguidos de espaço, ou ''
 */
export function slideshowArgsForBinary(bin) {
  const name = path.basename(String(bin ?? '')).toLowerCase()
  if (/^(soffice|libreoffice|simpress)/.test(name)) return '--show --norestore --nologo '
  if (process.platform === 'win32' && name.startsWith('powerpnt')) return '/S '
  return ''
}

/**
 * Abre o arquivo no aplicativo externo, em modo apresentação.
 * @param {string} filePath caminho absoluto do .pptx
 * @param {string} engine
 * @param {{ monitorIds?: unknown }} [options] monitores de projeção (LibreOffice
 *   abre no 1º e o app espelha nos demais)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function openPresentationExternal(filePath, engine, options = {}) {
  const absolute = path.resolve(String(filePath ?? '').trim())
  if (!absolute || !existsSync(absolute)) {
    return { ok: false, error: 'file-missing' }
  }

  if (engine === 'custom') {
    const bin = getCustomPresentationApp()
    if (!bin) return { ok: false, error: 'custom-app-missing' }
    exec(`"${bin}" ${slideshowArgsForBinary(bin)}"${absolute}"`, (err) => {
      if (err) console.error('[external-presentation] custom', err.message)
    })
    return { ok: true }
  }

  if (engine === 'powerpoint') {
    const known = KNOWN_PRESENTATION_APPS.find((app) => app.id === 'powerpoint')
    const bin =
      findBinary(['POWERPNT.EXE', 'powerpnt', ...POWERPOINT_CANDIDATES]) ??
      (known ? await resolvePresentationApp(known) : null)
    if (!bin) return { ok: false, error: 'powerpoint-not-installed' }
    const cmd =
      process.platform === 'win32'
        ? `"${bin}" /S "${absolute}"`
        : `"${bin}" "${absolute}"`
    exec(cmd, (err) => {
      if (err) console.error('[external-presentation] powerpoint', err.message)
    })
    return { ok: true }
  }

  if (engine === 'libreoffice') {
    const known = KNOWN_PRESENTATION_APPS.find((app) => app.id === 'libreoffice')
    const soffice =
      findBinary(SOFFICE_CANDIDATES) ??
      (known ? await resolvePresentationApp(known) : null)
    if (!soffice) return { ok: false, error: 'libreoffice-not-installed' }
    const { app } = await import('electron')
    return startLibreOfficeMirror({
      soffice,
      filePath: absolute,
      monitorIds: options?.monitorIds,
      userDataDir: app.getPath('userData'),
    })
  }

  const app = KNOWN_PRESENTATION_APPS.find((entry) => entry.id === engine)
  if (!app) return { ok: false, error: 'unknown-engine' }
  const bin = await resolvePresentationApp(app)
  if (!bin) return { ok: false, error: `${engine}-not-installed` }
  exec(`"${bin}" "${absolute}"`, (err) => {
    if (err) console.error(`[external-presentation] ${engine}`, err.message)
  })
  return { ok: true }
}
