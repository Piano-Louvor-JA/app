// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  COUNTDOWN_AUDIO_HOST_KEY,
  claimAudioHost,
  myAudioHostId,
  releaseAudioHost,
} from '../audio-control'

function setLocation(search: string, pathname = '/') {
  window.history.replaceState({}, '', `${pathname}${search}`)
}

afterEach(() => {
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
