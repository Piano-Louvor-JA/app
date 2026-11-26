import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const sendMock = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../heartbeat', () => ({ sendHeartbeat: sendMock }))

import { useHomeLocation } from '@modules/home/composables/useHomeLocation'

import {
  HEARTBEAT_INTERVAL_MS,
  LOCATION_DEBOUNCE_MS,
  isHeartbeatLoopRunning,
  startHeartbeatLoop,
  stopHeartbeatLoopForTests,
} from '../heartbeat-loop'

function setWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => value })
}

describe('heartbeat-loop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sendMock.mockClear()
    setWebdriver(false)
  })

  afterEach(() => {
    stopHeartbeatLoopForTests()
    vi.useRealTimers()
    setWebdriver(false)
  })

  it('envia ao iniciar e a cada 5 min (o timer não depende da janela estar visível)', async () => {
    startHeartbeatLoop()
    expect(sendMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(sendMock).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(sendMock).toHaveBeenCalledTimes(3)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  it('iniciar duas vezes não duplica o loop', async () => {
    startHeartbeatLoop()
    startHeartbeatLoop()
    expect(isHeartbeatLoopRunning()).toBe(true)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('mudança de distrito/igreja envia logo (com debounce enquanto digita)', async () => {
    startHeartbeatLoop()
    sendMock.mockClear()
    const { setDistrict, setChurch } = useHomeLocation()
    setDistrict('Bertioga')
    await nextTick()
    setChurch('Rio da Praia')
    await nextTick()
    await vi.advanceTimersByTimeAsync(LOCATION_DEBOUNCE_MS - 1)
    expect(sendMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('navegador automatizado (E2E) não envia', () => {
    setWebdriver(true)
    startHeartbeatLoop()
    expect(isHeartbeatLoopRunning()).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('falha no envio não quebra o loop', async () => {
    sendMock.mockRejectedValueOnce(new Error('x'))
    startHeartbeatLoop()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(sendMock).toHaveBeenCalledTimes(2)
  })
})
