// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { localStorage.clear(); vi.resetModules() })
describe('OBS connections', () => {
  it('salva apelido separado do número OBS e restaura após reload', async () => {
    const config = await import('../obs-connections')
    config.registerObsConnection('7082', 'OBS 2')
    config.setObsNickname('7082', '  Transmissão principal  ')
    vi.resetModules()
    const restored = await import('../obs-connections')
    const connection = restored.obsConnections.value[0]!
    expect(connection.label).toBe('OBS 2')
    expect(connection.nickname).toBe('Transmissão principal')
    expect(restored.obsConnectionName(connection)).toBe('OBS 2 — Transmissão principal')
    restored.setObsNickname('7082', '')
    expect(restored.obsConnectionName(restored.obsConnections.value[0]!)).toBe('OBS 2')
  })
  it('o servidor principal não tem apelido: ignora novos e apaga o salvo', async () => {
    localStorage.setItem('louvorja-obs-connections-v1', JSON.stringify([
      { id: '0', label: 'OBS 1', selected: true, nickname: 'TV Frontal' },
      { id: '7082', label: 'OBS 2', selected: true, nickname: 'Mesa' },
    ]))
    const config = await import('../obs-connections')
    expect(config.obsConnectionName(config.obsConnections.value[0]!)).toBe('OBS')
    expect(config.obsConnections.value[1]).toMatchObject({ nickname: 'Mesa' })
    const stored = JSON.parse(localStorage.getItem('louvorja-obs-connections-v1')!)
    expect(stored[0]).toEqual({ id: '0', label: 'OBS 1', selected: true })
    expect(stored[1].nickname).toBe('Mesa')
    config.setObsNickname('0', 'Palco')
    expect(config.obsConnections.value[0]!.nickname).toBeUndefined()
    config.migratePalcoConnections([{ id: '0', label: 'TV principal' }])
    expect(config.obsConnections.value[0]!.nickname).toBeUndefined()
  })
  it('compartilhar preserva espelhamento principal no mesmo OBS', async () => {
    const config = await import('../obs-connections')
    config.registerObsConnection('7082', 'OBS 2')
    config.assignObsConnection('7082', 'bible', 'share')
    expect(config.obsAssignmentModes.value['7082']).toBe('share')
    expect(config.obsAllowsMirror('7082', 'media')).toBe(true)
    config.assignObsConnection('7082', null)
    expect(config.obsAssignmentModes.value['7082']).toBeUndefined()
  })
  it('não guarda mais a opção de tela preta nas transmissões', async () => {
    const config = await import('../obs-connections')
    expect('obsBlackIdle' in config).toBe(false)
    expect('setObsBlackIdle' in config).toBe(false)
  })
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

it('adopts legacy TV slots once and preserves ports, selection and nicknames after reload', async () => {
  const config = await import('../obs-connections')
  config.registerObsConnection('7082', 'OBS 2')
  config.setObsNickname('7082', 'Mesa')
  config.selectObsConnection('7082', false)
  const slots = [{ id: '0', label: 'TV principal' }, { id: '7082', label: 'OBS 2' }, { id: '7084', label: 'TV Salão' }]
  config.migratePalcoConnections(slots)
  config.migratePalcoConnections(slots)
  expect(config.obsConnections.value).toHaveLength(3)
  expect(config.obsConnections.value.find(item => item.id === '7082')).toMatchObject({ selected: false, nickname: 'Mesa' })
  vi.resetModules()
  const reloaded = await import('../obs-connections')
  expect(reloaded.obsConnections.value.find(item => item.id === '7084')).toMatchObject({ id: '7084', nickname: 'TV Salão' })
})
