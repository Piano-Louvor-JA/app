// @vitest-environment node
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
it('persists the audio destination and restores it after a new player session', () => {
  const source = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
  const code = source.slice(source.indexOf('let audioOutputMode ='), source.indexOf('/** Caption visibility'))
  const folder = mkdtempSync(path.join(tmpdir(), 'piano-audio-'))
  try {
    const file = path.join(folder, 'preference.json')
    const make = () => {
      const muted = vi.fn()
      const context = { currentSourceAudioOnly: false, sourceWindow: { isDestroyed: () => false, webContents: { setAudioMuted: muted } },
        readWorkspaceRecord: () => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } },
        writeWorkspaceRecord: (_, record) => { writeFileSync(file, JSON.stringify(record)); return true } }
      runInNewContext(code.replace(/export /g, ''), context)
      return { context, muted }
    }
    const first = make()
    expect(first.context.getAudioOutputMode()).toBe('player')
    expect(first.context.setAudioOutputMode('connections')).toBe('connections')
    expect(first.muted).toHaveBeenLastCalledWith(true)
    const restored = make()
    expect(restored.context.getAudioOutputMode()).toBe('connections')
    restored.context.setAudioOutputMode('both')
    expect(restored.muted).toHaveBeenLastCalledWith(false)
    expect(make().context.getAudioOutputMode()).toBe('both')
    expect(restored.context.setAudioOutputMode('invalid')).toBeNull()
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
it('captures only the player from the trusted control bar and preserves its local audio', () => {
  const source = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
  let handler
  const frame = { processId: 1, routingId: 2 }, sourceFrame = {}
  const context = {
    currentSourceAudioOnly: false, session: { defaultSession: { setDisplayMediaRequestHandler: fn => { handler = fn }, setPermissionRequestHandler() {} } },
    sourceWindow: { isDestroyed: () => false, webContents: { mainFrame: sourceFrame } },
    controlBarView: { webContents: { isDestroyed: () => false, mainFrame: frame } },
  }
  runInNewContext(source.slice(source.indexOf('export function registerProjectionCapturePermissions()')).replace('export ', ''), context)
  context.registerProjectionCapturePermissions()
  const callback = vi.fn()
  handler({ frame, audioRequested: true }, callback)
  expect(callback).toHaveBeenLastCalledWith({ video: sourceFrame, audio: sourceFrame, enableLocalEcho: true })
  handler({ frame: { processId: 9, routingId: 9 }, audioRequested: true }, callback)
  expect(callback).toHaveBeenLastCalledWith({})
})
