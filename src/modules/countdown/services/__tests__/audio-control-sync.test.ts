import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COUNTDOWN_AUDIO_STORAGE_KEY, publishAudioControl, readAudioControl,
  subscribeAudioControl,
} from '../audio-control'

const control = { muted: true, volume: 0.4, stopTick: 3, paused: true }
class Channel {
  static instances: Channel[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()
  constructor(public name: string) { Channel.instances.push(this) }
}

beforeEach(() => {
  localStorage.clear()
  Channel.instances = []
  vi.stubGlobal('BroadcastChannel', Channel)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('controle de áudio entre janelas', () => {
  it('persiste e transmite o estado; uma janela reaberta recupera todos os campos', () => {
    publishAudioControl(control)
    expect(readAudioControl()).toEqual(control)
    expect(Channel.instances[0]?.postMessage).toHaveBeenCalledWith(control)
    expect(Channel.instances[0]?.close).toHaveBeenCalledOnce()
  })

  it('continua transmitindo quando o armazenamento não está disponível', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    publishAudioControl(control)
    expect(Channel.instances[0]?.postMessage).toHaveBeenCalledWith(control)
  })

  it('mantém o estado persistido quando BroadcastChannel não está disponível', () => {
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('unsupported') } })
    publishAudioControl(control)
    expect(readAudioControl()).toEqual(control)
  })

  it.each([
    [null, { muted: false, volume: 1, stopTick: 0, paused: false }],
    ['broken', { muted: false, volume: 1, stopTick: 0, paused: false }],
    ['{}', { muted: false, volume: 1, stopTick: 0, paused: false }],
    ['{"volume":2}', { muted: false, volume: 1, stopTick: 0, paused: false }],
    ['{"volume":-1}', { muted: false, volume: 0, stopTick: 0, paused: false }],
  ])('recupera valores seguros para %s', (stored, expected) => {
    if (stored !== null) localStorage.setItem(COUNTDOWN_AUDIO_STORAGE_KEY, stored)
    expect(readAudioControl()).toEqual(expected)
  })

  it('recebe mensagens e eventos de storage, ignora dados inválidos e remove assinaturas', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeAudioControl(handler)
    const channel = Channel.instances[0]!
    channel.onmessage?.({ data: control })
    channel.onmessage?.({ data: null })
    channel.onmessage?.({ data: 'invalid' })
    const dispatch = (key: string, newValue: string | null) => window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
    dispatch('other', JSON.stringify(control))
    dispatch(COUNTDOWN_AUDIO_STORAGE_KEY, null)
    dispatch(COUNTDOWN_AUDIO_STORAGE_KEY, 'broken')
    dispatch(COUNTDOWN_AUDIO_STORAGE_KEY, JSON.stringify(control))
    expect(handler.mock.calls).toEqual([[control], [control]])
    unsubscribe()
    dispatch(COUNTDOWN_AUDIO_STORAGE_KEY, JSON.stringify(control))
    expect(handler).toHaveBeenCalledTimes(2)
    expect(channel.close).toHaveBeenCalledOnce()
  })

  it('assina pelo storage mesmo sem BroadcastChannel e pode cancelar', () => {
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('unsupported') } })
    const handler = vi.fn()
    const unsubscribe = subscribeAudioControl(handler)
    window.dispatchEvent(new StorageEvent('storage', { key: COUNTDOWN_AUDIO_STORAGE_KEY, newValue: JSON.stringify(control) }))
    expect(handler).toHaveBeenCalledWith(control)
    unsubscribe()
  })
})
