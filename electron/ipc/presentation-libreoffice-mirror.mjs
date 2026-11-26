import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Slideshow do LibreOffice espelhado nos monitores da plateia.
 *
 * O LibreOffice projeta em UM monitor só. O app abre o Impress num perfil
 * próprio (instância separada, monitor forçado por `Impress/Misc/Display`)
 * no 1º monitor de projeção e repete esse monitor, por captura de tela,
 * nos demais. Ver `.planning/libreoffice-espelho/SPEC.md`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREEN_MIRROR_HTML = path.join(__dirname, '../player/screen-mirror-player.html')

/** @type {import('node:child_process').ChildProcess | null} */
let currentChild = null
/** @type {import('electron').BrowserWindow[]} */
let mirrorWindows = []

/**
 * `display_id` da captura casa com o monitor do Electron: igual ao id ou,
 * no Linux/X11, aos 32 bits baixos dele (o Electron usa id de 64 bits).
 * @param {string | undefined} captureDisplayId
 * @param {number} displayId
 */
export function sameDisplay(captureDisplayId, displayId) {
  if (!captureDisplayId) return false
  return captureDisplayId === String(displayId) || captureDisplayId === String(displayId % 2 ** 32)
}

/**
 * Valor de `org.openoffice.Office.Impress/Misc/Display` para o monitor
 * pedido: `N>0` = tela real `N-1` (0 = externo padrão do LibreOffice).
 *
 * A numeração do LibreOffice segue a do sistema: no Linux é a ordem dos
 * monitores do RandR (a mesma das fontes de captura, que NÃO é a ordem de
 * `screen.getAllDisplays()`); no Windows/macOS é a ordem do Electron.
 * @param {{ platform: string, displays: Array<{ id: number }>, sources: Array<{ display_id?: string }>, displayId: number }} options
 * @returns {number}
 */
export function libreOfficeScreenNumber({ platform, displays, sources, displayId }) {
  if (platform === 'linux') {
    const index = sources.findIndex((source) => sameDisplay(source.display_id, displayId))
    // Sem casar, a ordem do Electron poderia apontar a tela do operador:
    // deixa o LibreOffice escolher o externo padrão.
    return index >= 0 ? index + 1 : 0
  }
  const index = displays.findIndex((display) => display.id === displayId)
  return index < 0 ? 0 : index + 1
}

/**
 * `registrymodifications.xcu` do perfil próprio do app: monitor do
 * slideshow, console do apresentador em janela e sem dica do dia.
 * @param {{ display: number }} options
 * @returns {string}
 */
export function buildLibreOfficeProfileXcu({ display }) {
  const value = Number.isInteger(display) ? display : 0
  const item = (nodePath, prop, val) =>
    `<item oor:path="${nodePath}"><prop oor:name="${prop}" oor:op="fuse"><value>${val}</value></prop></item>`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    item('/org.openoffice.Office.Impress/Misc', 'Display', value),
    // Console do apresentador em janela comum (minimizável) na tela do
    // operador, não em tela cheia tomando o monitor (LibreOffice 24.2+).
    item('/org.openoffice.Office.Impress/Misc/Start', 'PresenterScreenFullScreen', 'false'),
    item('/org.openoffice.Office.Common/Misc', 'ShowTipOfTheDay', 'false'),
    '</oor:items>',
    '',
  ].join('\n')
}

/**
 * Argumentos do soffice: perfil próprio + slideshow direto.
 * @param {{ profileDir: string, filePath: string }} options
 * @returns {string[]}
 */
export function buildLibreOfficeShowArgs({ profileDir, filePath }) {
  return [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    '--show',
    '--norestore',
    '--nologo',
    filePath,
  ]
}

/**
 * Monitores de projeção válidos (existem e não são o do operador), na ordem
 * pedida.
 * @template {{ id: number }} D
 * @param {D[]} displays
 * @param {number} primaryId
 * @param {unknown} monitorIds
 * @returns {D[]}
 */
export function resolveAudienceDisplays(displays, primaryId, monitorIds) {
  if (!Array.isArray(monitorIds)) return []
  /** @type {D[]} */
  const targets = []
  for (const id of monitorIds) {
    if (typeof id !== 'number' || id === primaryId) continue
    const display = displays.find((item) => item.id === id)
    if (display && !targets.includes(display)) targets.push(display)
  }
  return targets
}

/**
 * Fonte de captura do monitor pelo `display_id`. Sem casar, não arrisca
 * outra tela (poderia espelhar a tela do operador).
 * @param {Array<{ id: string, display_id?: string }>} sources
 * @param {number} displayId
 * @returns {string | null}
 */
export function pickScreenSourceId(sources, displayId) {
  const match = sources.find((source) => sameDisplay(source.display_id, displayId))
  return match ? match.id : null
}

/** Fecha os espelhos (o LibreOffice segue aberto se ainda estiver). */
export function closeLibreOfficeMirror() {
  for (const win of mirrorWindows) {
    try {
      if (!win.isDestroyed()) win.close()
    } catch {
      /* ignore */
    }
  }
  mirrorWindows = []
}

/**
 * @param {import('electron').Display} display
 * @param {string} sourceId
 */
async function createScreenMirrorWindow(display, sourceId) {
  const { BrowserWindow } = await import('electron')
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    backgroundColor: '#000000',
    show: false,
    frame: false,
    thickFrame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.webContents.setAudioMuted(true)
  const url = new URL(pathToFileURL(SCREEN_MIRROR_HTML).href)
  url.searchParams.set('source', sourceId)
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return
    win.setBounds(display.bounds)
    win.showInactive()
    win.setFullScreen(true)
  })
  await win.loadURL(url.href)
  return win
}

/**
 * Abre o slideshow no 1º monitor de projeção e espelha nos demais.
 * @param {{ soffice: string, filePath: string, monitorIds?: unknown, userDataDir: string }} options
 * @returns {Promise<{ ok: boolean, error?: string, mirrored?: number }>}
 */
export async function startLibreOfficeMirror({ soffice, filePath, monitorIds, userDataDir }) {
  const { desktopCapturer, screen } = await import('electron')
  const displays = screen.getAllDisplays()
  const audience = resolveAudienceDisplays(displays, screen.getPrimaryDisplay().id, monitorIds)
  const showDisplay = audience[0]

  closeLibreOfficeMirror()
  if (currentChild && currentChild.exitCode === null) {
    try {
      currentChild.kill()
    } catch {
      /* ignore */
    }
  }

  /** @type {Array<{ id: string, display_id?: string }>} */
  let sources = []
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    })
  } catch (error) {
    console.error('[libreoffice-mirror] fontes de captura', error)
  }

  const profileDir = path.join(userDataDir, 'libreoffice-profile')
  const userDir = path.join(profileDir, 'user')
  mkdirSync(userDir, { recursive: true })
  writeFileSync(
    path.join(userDir, 'registrymodifications.xcu'),
    buildLibreOfficeProfileXcu({
      display: showDisplay
        ? libreOfficeScreenNumber({
          platform: process.platform,
          displays,
          sources,
          displayId: showDisplay.id,
        })
        : 0,
    }),
    'utf8',
  )

  console.info('[libreoffice-mirror] slideshow em', showDisplay?.label ?? 'padrão', '| espelhos:', Math.max(audience.length - 1, 0))
  const child = spawn(soffice, buildLibreOfficeShowArgs({ profileDir, filePath }), {
    stdio: 'ignore',
    detached: false,
  })
  currentChild = child
  child.on('error', (error) => {
    console.error('[libreoffice-mirror] soffice', error.message)
  })
  // `--show` fecha o arquivo ao fim do slideshow → a instância própria sai.
  child.on('exit', () => {
    if (currentChild === child) {
      currentChild = null
      closeLibreOfficeMirror()
    }
  })

  const copies = audience.slice(1)
  if (!showDisplay || copies.length === 0) return { ok: true, mirrored: 0 }

  const sourceId = pickScreenSourceId(sources, showDisplay.id)
  if (!sourceId) {
    console.error('[libreoffice-mirror] monitor do slideshow sem fonte de captura')
    return { ok: true, mirrored: 0 }
  }
  try {
    for (const display of copies) {
      mirrorWindows.push(await createScreenMirrorWindow(display, sourceId))
    }
  } catch (error) {
    console.error('[libreoffice-mirror] espelho', error)
  }
  return { ok: true, mirrored: mirrorWindows.length }
}
