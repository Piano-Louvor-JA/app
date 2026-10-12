// @vitest-environment jsdom
/**
 * Cobertura de output-registry.ts — registry de saídas multi-telas:
 * load com storage corrompido, syncDetected merge, setModule, moduleFor*,
 * resetAll e persistência.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'louvorja-output-registry-v1'

describe('output-registry', () => {
  let registry: ReturnType<
    typeof import('../output-registry')['useOutputRegistry']
  >

  const loadFresh = async () => {
    vi.resetModules()
    const mod = await import('../output-registry')
    return mod.useOutputRegistry()
  }

  beforeEach(() => {
    localStorage.clear()
  })

  const tv = () => (registry.targets as never as { value: unknown[] }).value
const stored = () => {
  const raw = localStorage.getItem(STORAGE_KEY)
  try { return JSON.parse(raw ?? '[]') as Array<Record<string, unknown>> } catch { return [] }
}

  it('storage vazio -> targets vazio; syncDetected popula online true e module null', async () => {
    registry = await loadFresh()
    expect(tv()).toHaveLength(0)
    registry.syncDetected([
      { id: 'cable-0', kind: 'cable', monitorId: 0, label: 'HDMI' },
      { id: 'slot-0', kind: 'palco-slot', slotId: '0', label: 'TV 1' },
    ])
    expect(stored()).toHaveLength(2)
    expect(stored()[0]).toMatchObject({
      id: 'cable-0',
      online: true,
      module: null,
    })
  })

  it('syncDetected preserva module atribuído anteriormente', async () => {
    registry = await loadFresh()
    registry.syncDetected([
      { id: 'slot-0', kind: 'palco-slot', slotId: '0', label: 'TV 1' },
    ])
    registry.setModule('slot-0', 'bible')
    expect(registry.moduleForSlot('0')).toBe('bible')
    // TV some e volta: atribuição persiste
    registry.syncDetected([
      { id: 'slot-0', kind: 'palco-slot', slotId: '0', label: 'TV 1' },
    ])
    expect(registry.moduleForSlot('0')).toBe('bible')
  })

  it('setModule: id inexistente no-op; mesmo valor no-op (não persiste 2x)', async () => {
    registry = await loadFresh()
    registry.syncDetected([
      { id: 'slot-0', kind: 'palco-slot', slotId: '0', label: 'TV' },
    ])
    registry.setModule('fantasma', 'media') // no-op
    const before = localStorage.getItem(STORAGE_KEY)
    registry.setModule('slot-0', 'media')
    const after = localStorage.getItem(STORAGE_KEY)
    registry.setModule('slot-0', 'media') // mesmo valor: no-op
    expect(localStorage.getItem(STORAGE_KEY)).toBe(after)
    expect(before).not.toBe(after)
  })

  it('moduleForMonitor e moduleForSlot: ausentes -> null', async () => {
    registry = await loadFresh()
    registry.syncDetected([
      { id: 'cable-1', kind: 'cable', monitorId: 1, label: 'HDMI 2' },
    ])
    expect(registry.moduleForMonitor(1)).toBeNull()
    expect(registry.moduleForMonitor(9)).toBeNull()
    expect(registry.moduleForSlot('0')).toBeNull()
  })

  it('resetAll volta tudo para espelho e persiste', async () => {
    registry = await loadFresh()
    registry.syncDetected([
      { id: 'cable-0', kind: 'cable', monitorId: 0, label: 'HDMI' },
      { id: 'slot-0', kind: 'palco-slot', slotId: '0', label: 'TV' },
    ])
    registry.setModule('cable-0', 'pdf')
    registry.setModule('slot-0', 'media')
    registry.resetAll()
    expect(registry.moduleForMonitor(0)).toBeNull()
    expect(registry.moduleForSlot('0')).toBeNull()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0]?.module).toBeNull()
  })

  it('load: JSON inválido / não-array / entradas sem id -> filtrados', async () => {
    localStorage.setItem(STORAGE_KEY, 'não-json')
    registry = await loadFresh()
    expect(stored()).toHaveLength(0)

    localStorage.setItem(STORAGE_KEY, '{"x":1}')
    registry = await loadFresh()
    expect(tv()).toHaveLength(0) // rejeitou não-array

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'ok', kind: 'cable', label: 'x' }, null, { nope: 1 }]),
    )
    registry = await loadFresh()
    expect(tv()).toHaveLength(1)
    expect((tv()[0] as { id: string }).id).toBe('ok')
  })
})
