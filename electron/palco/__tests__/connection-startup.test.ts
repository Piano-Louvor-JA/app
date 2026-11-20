// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
const env = vi.hoisted(() => ({ root: '', handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({ app: { getPath: () => env.root }, ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => env.handlers.set(name, fn) } }))
// @ts-ignore Native runtime module.
import { readConnectionStartup, saveConnectionStartup } from '../connection-startup.mjs'
// @ts-ignore Native runtime module.
import { attachPalcoServer, getPalcoManager, PalcoSlot } from '../../palco-server.mjs'
env.root = mkdtempSync(path.join(tmpdir(), 'piano-connections-'))
afterAll(() => { vi.restoreAllMocks(); rmSync(env.root, { recursive: true, force: true }) })
it('roundtrips the opt-in and clears restoration when disabled', () => {
  const file = path.join(env.root, 'roundtrip.json')
  expect(readConnectionStartup(file)).toEqual({ enabled: true, activeIds: [] })
  saveConnectionStartup(file, { enabled: true, activeIds: ['0', '7082'] })
  expect(readConnectionStartup(file)).toEqual({ enabled: true, activeIds: ['0', '7082'] })
  saveConnectionStartup(file, { enabled: false, activeIds: ['0', '7082'] })
  expect(readConnectionStartup(file)).toEqual({ enabled: false, activeIds: [] })
})
it('restores enabled sources at boot and persists explicit start, stop and removal', async () => {
  const file = path.join(env.root, 'palco-connections-startup.json')
  saveConnectionStartup(file, { enabled: true, activeIds: ['0'] })
  vi.spyOn(PalcoSlot.prototype, 'prepare').mockResolvedValue(undefined)
  const start = vi.spyOn(PalcoSlot.prototype, 'start').mockResolvedValue(true)
  vi.spyOn(PalcoSlot.prototype, 'stop').mockResolvedValue(undefined)
  vi.spyOn(PalcoSlot.prototype, 'dispose').mockResolvedValue(undefined)
  attachPalcoServer(() => null)
  expect(start).toHaveBeenCalledOnce()
  const slot = getPalcoManager().createSlot('Fonte 2')
  await env.handlers.get('palco:start')!({}, { slotId: slot.id })
  expect(readConnectionStartup(file).activeIds).toEqual(['0', slot.id])
  await env.handlers.get('palco:stop')!({}, { slotId: '0' })
  expect(readConnectionStartup(file).activeIds).toEqual([slot.id])
  env.handlers.get('palco:slot-remove')!({}, { id: slot.id })
  expect(readConnectionStartup(file).activeIds).toEqual([])
  env.handlers.get('palco:persistence-set')!({}, { enabled: false })
  expect(readConnectionStartup(file).enabled).toBe(false)
})
