import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: { handle: vi.fn() },
}))

const { mainWindowChromeOptions } = await import('../ipc/window.mjs')

describe('mainWindowChromeOptions (main)', () => {
  it('macOS: mantém os botões nativos (sem frame: false) e os posiciona na titlebar', () => {
    const options = mainWindowChromeOptions('darwin')
    expect(options).toEqual({ titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 10 } })
    expect(options).not.toHaveProperty('frame')
  })

  it.each(['win32', 'linux'])('%s: janela sem frame com a titlebar customizada', (platform) => {
    expect(mainWindowChromeOptions(platform)).toEqual({ frame: false })
  })
})
