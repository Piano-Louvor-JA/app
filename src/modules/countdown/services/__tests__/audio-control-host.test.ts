// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  COUNTDOWN_AUDIO_HOST_KEY,
  claimAudioHost,
  myAudioHostId,
  releaseAudioHost,
  renewAudioHost,
  isOperatorWindow,
  isReturnWindow,
} from '../audio-control'

function setLocation(search: string, pathname = '/') {
  window.history.replaceState({}, '', `${pathname}${search}`)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  window.name = ''
  setLocation('')
})

describe('claimAudioHost', () => {
  it('operador assume quando não há popup viva', () => {
    window.name = 'operator'
    setLocation('')
    expect(claimAudioHost(1_000)).toBe(true)
    expect(myAudioHostId()).toBe('woperator')
    const claim = JSON.parse(localStorage.getItem(COUNTDOWN_AUDIO_HOST_KEY) ?? 'null')
    expect(claim.id).toBe('woperator')
  })

  it('popup de monitor menor toma o claim e a maior não toca', () => {
    setLocation('?module=countdown&monitorId=2', '/popup')
    expect(claimAudioHost(1_000)).toBe(true)

    setLocation('?module=countdown&monitorId=1', '/popup')
    expect(claimAudioHost(1_500)).toBe(true)
    expect(JSON.parse(localStorage.getItem(COUNTDOWN_AUDIO_HOST_KEY) ?? 'null').id).toBe('m1')

    setLocation('?module=countdown&monitorId=2', '/popup')
    expect(claimAudioHost(2_000)).toBe(false)
  })

  it('operador não toca enquanto a popup está viva e assume depois que ela solta', () => {
    setLocation('?module=countdown&monitorId=1', '/popup')
    expect(claimAudioHost(1_000)).toBe(true)

    window.name = 'operator'
    setLocation('')
    expect(claimAudioHost(2_000)).toBe(false)

    setLocation('?module=countdown&monitorId=1', '/popup')
    releaseAudioHost()

    window.name = 'operator'
    setLocation('')
    expect(claimAudioHost(3_000)).toBe(true)
  })

  it('janela de retorno nunca é host', () => {
    setLocation('?layout=return&monitorId=0', '/popup')
    expect(claimAudioHost(1_000)).toBe(false)
    expect(localStorage.getItem(COUNTDOWN_AUDIO_HOST_KEY)).toBeNull()
  })
})


describe('renovação e recuperação da eleição', () => {
  it('usa uma identidade estável mesmo sem monitor ou nome da janela', () => {
    window.name = ''
    const first = myAudioHostId()
    expect(first).toMatch(/^w.+/)
    expect(myAudioHostId()).toBe(first)
  })

  it('renova somente o próprio claim, sem apagar o claim de outra janela', () => {
    window.name = 'operator'
    expect(claimAudioHost(1000)).toBe(true)
    renewAudioHost(2000)
    expect(JSON.parse(localStorage.getItem(COUNTDOWN_AUDIO_HOST_KEY)!)).toEqual({ id: 'woperator', ts: 2000 })
    localStorage.setItem(COUNTDOWN_AUDIO_HOST_KEY, JSON.stringify({ id: 'other', ts: 2500 }))
    renewAudioHost(3000)
    releaseAudioHost()
    expect(JSON.parse(localStorage.getItem(COUNTDOWN_AUDIO_HOST_KEY)!)).toEqual({ id: 'other', ts: 2500 })
    localStorage.clear()
    renewAudioHost(4000)
    releaseAudioHost()
    expect(localStorage.getItem(COUNTDOWN_AUDIO_HOST_KEY)).toBeNull()
  })

  it.each(['broken', '{}', '{"id":1,"ts":0}', '{"id":"m1","ts":"bad"}'])(
    'recupera uma eleição inválida: %s', (raw) => {
      localStorage.setItem(COUNTDOWN_AUDIO_HOST_KEY, raw)
      expect(claimAudioHost(5000)).toBe(true)
    },
  )

  it('assume um claim vencido e tolera falhas de persistência e remoção', () => {
    localStorage.setItem(COUNTDOWN_AUDIO_HOST_KEY, JSON.stringify({ id: 'other', ts: 1000 }))
    expect(claimAudioHost(5000)).toBe(true)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(claimAudioHost(6000)).toBe(true)
    expect(() => renewAudioHost(7000)).not.toThrow()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => releaseAudioHost()).not.toThrow()
  })

  it('não tenta eleger ou acessar uma janela quando não há renderer', () => {
    vi.stubGlobal('window', undefined)
    expect(myAudioHostId()).toBe('op')
    expect(isReturnWindow()).toBe(false)
    expect(isOperatorWindow()).toBe(true)
    expect(claimAudioHost()).toBe(false)
    expect(() => renewAudioHost()).not.toThrow()
    expect(() => releaseAudioHost()).not.toThrow()
  })
})
