import { app, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { isPositionReliable, placeMainWindow } from './window-placement.mjs'

const DEFAULT_WIDTH = 1440
const DEFAULT_HEIGHT = 900

function stateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

/**
 * @typedef {{ x: number, y: number, width: number, height: number, isMaximized?: boolean, positionSource?: 'x11' }} WindowState
 */

/** x/y do getBounds() são reais neste processo? (falso no Wayland nativo) */
function positionReliableNow() {
  return isPositionReliable({
    platform: process.platform,
    ozonePlatform: app.commandLine.getSwitchValue('ozone-platform'),
    env: process.env,
  })
}

/**
 * Linux: só confia em x/y gravados com o marcador `positionSource: 'x11'`.
 * Estados antigos foram gravados no Wayland nativo, com posição falsa.
 * @param {WindowState} saved
 */
function savedPositionTrusted(saved) {
  if (!positionReliableNow()) return false
  if (process.platform !== 'linux') return true
  return saved.positionSource === 'x11'
}

/** @returns {WindowState | null} */
function readState() {
  try {
    const raw = fs.readFileSync(stateFilePath(), 'utf8')
    const data = JSON.parse(raw)
    if (
      typeof data?.x !== 'number' ||
      typeof data?.y !== 'number' ||
      typeof data?.width !== 'number' ||
      typeof data?.height !== 'number'
    ) {
      return null
    }
    return {
      x: Math.round(data.x),
      y: Math.round(data.y),
      width: Math.round(data.width),
      height: Math.round(data.height),
      isMaximized: Boolean(data.isMaximized),
      ...(data.positionSource === 'x11' ? { positionSource: 'x11' } : {}),
    }
  } catch {
    return null
  }
}

/** @param {WindowState} state */
function writeState(state) {
  const { positionSource: _ignored, ...rest } = state
  const record =
    process.platform === 'linux' && positionReliableNow() ? { ...rest, positionSource: 'x11' } : rest
  try {
    fs.writeFileSync(stateFilePath(), JSON.stringify(record, null, 2), 'utf8')
  } catch (error) {
    console.error('[window-state] falha ao salvar', error)
  }
}

/**
 * Carrega bounds salvos (ou defaults) para criar a BrowserWindow.
 * A janela sempre cabe inteira num monitor; sem posição confiável, abre
 * centrada no monitor principal.
 * @returns {{ x?: number, y?: number, width: number, height: number, isMaximized: boolean }}
 */
export function loadWindowState() {
  const saved = readState()
  return placeMainWindow({
    saved,
    displays: screen.getAllDisplays(),
    primary: screen.getPrimaryDisplay(),
    trustPosition: saved ? savedPositionTrusted(saved) : false,
    defaults: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
  })
}

/**
 * Persiste posição/tamanho/maximizado e reage a move/resize/close.
 * @param {import('electron').BrowserWindow} win
 * @param {{ isMaximized?: boolean }} initial
 */
export function trackWindowState(win, initial = {}) {
  /** @type {WindowState} */
  let state = {
    x: win.getBounds().x,
    y: win.getBounds().y,
    width: win.getBounds().width,
    height: win.getBounds().height,
    isMaximized: Boolean(initial.isMaximized),
  }

  const persist = () => {
    if (win.isDestroyed()) return

    const maximized = win.isMaximized()
    const fullScreen = win.isFullScreen()

    if (!maximized && !fullScreen && !win.isMinimized()) {
      const bounds = win.getBounds()
      state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false,
      }
    } else {
      state = {
        ...state,
        isMaximized: maximized,
      }
    }

    writeState(state)
  }

  // Debounce leve para move/resize contínuos
  let timer = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, 200)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', persist)
  win.on('unmaximize', persist)
  win.on('close', persist)

  // maximize é aplicado em main.mjs no ready-to-show
}
