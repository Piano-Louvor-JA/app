import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SABBATH_SCHOOL_AUDIO_STORAGE_KEY,
  SABBATH_SCHOOL_VIDEO_AUDIO_STORAGE_KEY,
  readAudioPreferences,
  readVideoAudioPreferences,
  saveAudioPreferences,
  saveVideoAudioPreferences,
} from '../audio-preferences'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('preferências de áudio do cronômetro', () => {
  it('lembra mudo e volume entre sessões', () => {
    saveAudioPreferences({ muted: true, volume: 0.4 })
    expect(readAudioPreferences()).toEqual({ muted: true, volume: 0.4 })
  })

  it('não quebra quando o armazenamento está bloqueado', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => saveAudioPreferences({ muted: true, volume: 0.4 })).not.toThrow()
  })

  it.each([
    [null, { muted: false, volume: 1 }],
    ['broken', { muted: false, volume: 1 }],
    ['{}', { muted: false, volume: 1 }],
    ['{"volume":2}', { muted: false, volume: 1 }],
    ['{"volume":-1,"muted":true}', { muted: true, volume: 0 }],
  ])('recupera valores seguros para %s', (stored, expected) => {
    if (stored !== null) localStorage.setItem(SABBATH_SCHOOL_AUDIO_STORAGE_KEY, stored)
    expect(readAudioPreferences()).toEqual(expected)
  })

  it('o vídeo personalizado tem mudo e volume próprios, separados das narrações', () => {
    saveAudioPreferences({ muted: true, volume: 0.2 })
    expect(readVideoAudioPreferences()).toEqual({ muted: false, volume: 1 })
    saveVideoAudioPreferences({ muted: false, volume: 0.7 })
    expect(readVideoAudioPreferences()).toEqual({ muted: false, volume: 0.7 })
    expect(readAudioPreferences()).toEqual({ muted: true, volume: 0.2 })
    localStorage.setItem(SABBATH_SCHOOL_VIDEO_AUDIO_STORAGE_KEY, '{"volume":3}')
    expect(readVideoAudioPreferences()).toEqual({ muted: false, volume: 1 })
  })
})
