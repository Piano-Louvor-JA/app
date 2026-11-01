// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { localStorage.clear(); vi.resetModules() })
describe('OBS connections', () => {
  it('salva conexões e seleção e recupera após reload', async () => {
    const config = await import('../obs-connections')
    config.registerObsConnection('7082', 'OBS 2')
    config.selectObsConnection('7082', false)
    vi.resetModules()
    const restored = await import('../obs-connections')
    expect(restored.obsConnections.value).toEqual([{ id: '7082', label: 'OBS 2', selected: false }])
    expect(restored.obsAllowsMirror('7082')).toBe(false)
    expect(restored.obsAllowsMirror('0')).toBe(true)
  })
  it('atribuição independente não altera outras conexões e é removida ao encerrar', async () => {
    const config = await import('../obs-connections')
    config.registerObsConnection('7082', 'OBS 2')
    config.registerObsConnection('7084', 'OBS 3')
    config.assignObsConnection('7082', 'bible')
    expect(config.obsAllowsMirror('7082', 'random')).toBe(false)
    expect(config.obsAllowsMirror('7082', 'bible')).toBe(true)
    expect(config.obsAllowsMirror('7084', 'random')).toBe(true)
    config.clearObsModule('bible')
    expect(config.obsAssignments.value).toEqual({})
    expect(config.obsAllowsMirror('7082', 'random')).toBe(true)
  })
})
