// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de stage-settings-runtime.ts — leitura effective (override >
 * global > default), subscribe BroadcastChannel/storage, notify.
 */

import {
  readEffectiveStageSettings,
  subscribeStageSettings,
  notifyStageSettingsChanged,
} from '../stage-settings-runtime'
import { STAGE_MODULE_SCOPES } from '../../types/stage-settings'

// escopo bible é escopo válido (STAGE_MODULE_SCOPES)
const SCOPE = 'bible'

beforeEach(() => {
  localStorage.removeItem('user_data')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readEffectiveStageSettings', () => {
  it('escopo desconhecido -> defaults', () => {
    const s = readEffectiveStageSettings('nao-existe')
    expect(s.fontSize).toBeGreaterThan(0)
    expect(s.textColor).toBeDefined()
  })

  it('sem user_data -> defaults', () => {
    const s = readEffectiveStageSettings(SCOPE)
    expect(s.fontSize).toBeGreaterThan(0)
  })

  it('override do escopo vence global', () => {
    localStorage.setItem(
      'user_data',
      JSON.stringify({
        'stage.settings.global': { size: 100 },
        ['stage.settings.' + SCOPE]: { size: 150 },
      }),
    )
    expect(readEffectiveStageSettings(SCOPE).fontSize).toBe(150)
    // 'global' não é escopo de módulo -> defaults defensivos
    expect(readEffectiveStageSettings('global').fontSize).toBe(96)
  })

  it('sem override: cai no global', () => {
    localStorage.setItem(
      'user_data',
      JSON.stringify({ 'stage.settings.global': { size: 110 } }),
    )
    expect(readEffectiveStageSettings(SCOPE).fontSize).toBe(110)
  })

  it('user_data inválido -> defaults; stored não-objeto -> global/default', () => {
    localStorage.setItem('user_data', 'não-json')
    expect(readEffectiveStageSettings(SCOPE).fontSize).toBeGreaterThan(0)
    localStorage.setItem('user_data', JSON.stringify({ 'stage.settings.hymns': 'lixo' }))
    expect(readEffectiveStageSettings(SCOPE).fontSize).toBeGreaterThan(0)
  })
})

describe('subscribe/notify', () => {
  it('subscribe: callback em message e storage; unsubscribe encerra', () => {
    const cb = vi.fn()
    const unsub = subscribeStageSettings(cb)
    // storage event
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'user_data' }),
    )
    expect(cb).toHaveBeenCalledTimes(1)
    // storage de outra chave ignora
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra' }))
    expect(cb).toHaveBeenCalledTimes(1)
    // BroadcastChannel message (jsdom suporta)
    const ch = new BroadcastChannel('louvorja-stage-settings')
    ch.postMessage('changed')
    ch.close()
    unsub()
    // após unsub, storage não chama mais
    window.dispatchEvent(new StorageEvent('storage', { key: 'user_data' }))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('notifyStageSettingsChanged: não lança com BroadcastChannel', () => {
    expect(() => notifyStageSettingsChanged()).not.toThrow()
  })

  it('subscribe sem BroadcastChannel (ambiente limitado): cai no storage-only', () => {
    const OriginalBC = globalThis.BroadcastChannel
    // @ts-expect-error simular ambiente sem BC
    delete globalThis.BroadcastChannel
    const cb = vi.fn()
    const unsub = subscribeStageSettings(cb)
    window.dispatchEvent(new StorageEvent('storage', { key: 'user_data' }))
    expect(cb).toHaveBeenCalledTimes(1)
    unsub() // channel null: só remove storage listener
    expect(() => unsub()).not.toThrow()
    globalThis.BroadcastChannel = OriginalBC
  })
})
