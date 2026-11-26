import { beforeEach, describe, expect, it } from 'vitest'

import {
  getOrCreateInstallId,
  isTelemetryEnabled,
  setTelemetryEnabled,
} from '../telemetry-preferences'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Telemetria de dispositivos (Fase 3): id anônimo e interruptor, locais. */
describe('telemetry-preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('gera um UUID v4 na primeira vez e devolve o mesmo depois (sobrevive a reload)', () => {
    const first = getOrCreateInstallId()
    expect(first).toMatch(UUID_V4)
    expect(getOrCreateInstallId()).toBe(first)
    const stored = JSON.parse(localStorage.getItem('user_data') ?? '{}')
    expect(stored['telemetry.installId']).toBe(first)
  })

  it('id gravado inválido é trocado por um novo', () => {
    localStorage.setItem('user_data', JSON.stringify({ 'telemetry.installId': 'lixo' }))
    expect(getOrCreateInstallId()).toMatch(UUID_V4)
  })

  it('estatísticas ligadas por padrão; desligar persiste', () => {
    expect(isTelemetryEnabled()).toBe(true)
    setTelemetryEnabled(false)
    expect(isTelemetryEnabled()).toBe(false)
    expect(JSON.parse(localStorage.getItem('user_data') ?? '{}')['telemetry.enabled']).toBe(false)
    setTelemetryEnabled(true)
    expect(isTelemetryEnabled()).toBe(true)
  })
})
