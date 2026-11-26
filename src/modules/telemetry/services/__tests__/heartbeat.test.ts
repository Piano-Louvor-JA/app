import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bases = vi.hoisted(() => ({
  value: ['https://api-stg.pianolouvorja.com.br/json_db', 'https://api.louvorja.com.br/json_db'],
}))
vi.mock('@shared/services/api-fallback', () => ({
  apiCandidateBases: () => bases.value,
}))

import { saveHomeLocation } from '@modules/home/services/home-preferences'

import { buildHeartbeatBody, heartbeatUrls, sendHeartbeat } from '../heartbeat'
import { setTelemetryEnabled } from '../telemetry-preferences'

type Win = typeof window & { louvorja?: unknown }

function setBridge(bridge: unknown) {
  ;(window as Win).louvorja = bridge
}

describe('heartbeat (telemetria de dispositivos, Fase 3)', () => {
  beforeEach(() => {
    localStorage.clear()
    bases.value = ['https://api-stg.pianolouvorja.com.br/json_db', 'https://api.louvorja.com.br/json_db']
    setBridge({
      isElectron: true,
      platform: 'linux',
      systemInfo: async () => ({ platform: 'linux', name: 'Ubuntu 26.04 LTS', release: '7.0.0', arch: 'x64' }),
    })
  })

  afterEach(() => {
    setBridge(undefined)
  })

  it('URLs: só hosts da API Piano, na ordem da cascata, sem repetir', () => {
    bases.value = [
      'https://api-stg.pianolouvorja.com.br/json_db',
      'https://api-stg.pianolouvorja.com.br/files',
      'https://api.louvorja.com.br/json_db',
      'https://api.pianolouvorja.com.br/json_db',
      'nao-e-url',
    ]
    expect(heartbeatUrls()).toEqual([
      'https://api-stg.pianolouvorja.com.br/v1/telemetry/heartbeat',
      'https://api.pianolouvorja.com.br/v1/telemetry/heartbeat',
    ])
  })

  it('corpo: id da instalação, SO, distrito/igreja (campo apagado usa o último valor)', async () => {
    saveHomeLocation({ district: 'Bertioga', church: 'Rio da Praia' })
    saveHomeLocation({ district: '', church: 'Rio da Praia' })

    const body = await buildHeartbeatBody()
    expect(body.install_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.platform).toMatch(/^desktop-/)
    expect(body.os).toEqual({ name: 'Ubuntu 26.04 LTS', release: '7.0.0', arch: 'x64' })
    expect(body.district).toBe('Bertioga')
    expect(body.church).toBe('Rio da Praia')
    expect(typeof body.timezone).toBe('string')
    expect(typeof body.locale).toBe('string')
    // O mesmo id em todos os envios.
    expect((await buildHeartbeatBody()).install_id).toBe(body.install_id)
  })

  it('sem bridge ou com systemInfo falhando: os = null, distrito/igreja vazios = null', async () => {
    setBridge({ isElectron: true, platform: 'linux', systemInfo: async () => { throw new Error('x') } })
    const body = await buildHeartbeatBody()
    expect(body.os).toBeNull()
    expect(body.district).toBeNull()
    expect(body.church).toBeNull()
    setBridge(undefined)
    expect((await buildHeartbeatBody()).os).toBeNull()
  })

  it('envia POST JSON para a primeira URL e para quando dá certo', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await sendHeartbeat(fetchMock as never)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api-stg.pianolouvorja.com.br/v1/telemetry/heartbeat')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(JSON.parse(String(init.body)).install_id).toBeTruthy()
  })

  it('erro de rede ou 5xx cai no próximo host; 4xx não insiste', async () => {
    bases.value = ['https://api-stg.pianolouvorja.com.br/json_db', 'https://api.pianolouvorja.com.br/json_db']
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await sendHeartbeat(flaky as never)).toBe(true)
    expect(flaky).toHaveBeenCalledTimes(2)

    const serverDown = vi.fn(async () => new Response(null, { status: 503 }))
    expect(await sendHeartbeat(serverDown as never)).toBe(false)
    expect(serverDown).toHaveBeenCalledTimes(2)

    const notFound = vi.fn(async () => new Response(null, { status: 404 }))
    expect(await sendHeartbeat(notFound as never)).toBe(false)
    expect(notFound).toHaveBeenCalledTimes(1)
  })

  it('"Enviar estatísticas de uso" desligado: nenhum envio', async () => {
    setTelemetryEnabled(false)
    const fetchMock = vi.fn()
    expect(await sendHeartbeat(fetchMock as never)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
