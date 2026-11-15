// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const handlers = vi.hoisted(() => new Map())
vi.mock('electron', () => ({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) } }))
import { normalizeScreenContext, registerScreenContextIpc } from '../ipc/screen-context.mjs'

function mainWindow(execute) {
  return { isDestroyed: () => false, webContents: { isDestroyed: () => false, executeJavaScript: execute } }
}

describe('seletor de telas dos players: contexto da janela principal', () => {
  it('normaliza o que a janela principal devolve', () => {
    expect(normalizeScreenContext(null)).toEqual({ returnDisplayId: null, remotes: [] })
    expect(normalizeScreenContext({ returnDisplayId: 7, remotes: [{ id: '0', name: 'OBS', selected: false }, { id: 1 }, null] }))
      .toEqual({ returnDisplayId: 7, remotes: [{ id: '0', name: 'OBS', selected: false }] })
  })

  it('pergunta à janela principal e devolve a marca do player; sem janela, responde vazio', async () => {
    const calls = []
    let win = mainWindow(async (code) => {
      calls.push(code)
      return code.includes('__pianoScreenContext') ? { returnDisplayId: 4, remotes: [{ id: '0', name: 'OBS', selected: true }] } : true
    })
    registerScreenContextIpc(() => win)
    expect(await handlers.get('projection:screen-context')()).toEqual({ returnDisplayId: 4, remotes: [{ id: '0', name: 'OBS', selected: true }] })
    expect(await handlers.get('projection:set-remote-selected')({}, { id: '0', selected: false })).toBe(true)
    expect(calls.at(-1)).toContain('__pianoSetRemoteSelected("0", false)')
    // id é serializado: não injeta código
    await handlers.get('projection:set-remote-selected')({}, { id: '"); alert(1); ("', selected: true })
    expect(calls.at(-1)).toContain(JSON.stringify('"); alert(1); ("'))
    expect(await handlers.get('projection:set-remote-selected')({}, { id: '0', selected: 'sim' })).toBe(false)
    win = null
    expect(await handlers.get('projection:screen-context')()).toEqual({ returnDisplayId: null, remotes: [] })
    expect(await handlers.get('projection:set-remote-selected')({}, { id: '0', selected: true })).toBe(false)
  })
})
