import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALERT_PRESETS, playAlertTone, pauseAllAlerts, resumeAllAlerts, stopAllAlerts,
  setLiveVolume, registerStopHook, getPresetDurationMs, getAvailablePresets,
  saveCustomTone, loadCustomTones, clearCustomTone, getCustomAudio, LEGACY_CUSTOM_TONES_KEY,
} from '../alert-tone'

class AudioStub extends EventTarget {
  static created: AudioStub[] = []
  preload = ''
  volume = 1
  currentTime = 0
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  constructor(public src: string) { super(); AudioStub.created.push(this) }
}
afterEach(() => { stopAllAlerts(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('alertas — reprodução e controle ao vivo', () => {
  it('pré-carrega um MP3, reutiliza o cache e remove áudio encerrado dos controles', async () => {
    vi.stubGlobal('Audio', AudioStub)
    const first = playAlertTone('abertura_es', undefined, undefined, { volume: 0.5 })
    const audio = AudioStub.created.at(-1)!
    expect(audio.src).toBe(ALERT_PRESETS.abertura_es.url)
    expect(audio.preload).toBe('auto')
    audio.dispatchEvent(new Event('canplaythrough'))
    await first
    expect(audio.volume).toBe(0.5)
    const count = AudioStub.created.length
    await playAlertTone('abertura_es')
    expect(AudioStub.created).toHaveLength(count)
    audio.dispatchEvent(new Event('ended'))
    setLiveVolume(0.2)
    expect(audio.volume).toBe(1)
  })

  it('propaga falha de carregamento sem tocar áudio incompleto', async () => {
    vi.stubGlobal('Audio', AudioStub)
    const promise = playAlertTone('5min_es')
    const failure = expect(promise).rejects.toThrow('Failed to load')
    AudioStub.created.at(-1)!.dispatchEvent(new Event('error'))
    await failure
    expect(AudioStub.created.at(-1)!.play).not.toHaveBeenCalled()
  })

  it('pausa sem rebobinar, retoma e limita o volume nos extremos', async () => {
    const audio = new AudioStub('custom')
    await playAlertTone('custom', undefined, audio as unknown as HTMLAudioElement)
    audio.currentTime = 12
    const hook = vi.fn()
    const remove = registerStopHook(hook)
    pauseAllAlerts()
    expect(audio.pause).toHaveBeenCalledOnce()
    expect(audio.currentTime).toBe(12)
    expect(hook).toHaveBeenCalledOnce()
    resumeAllAlerts()
    expect(audio.play).toHaveBeenCalledTimes(2)
    setLiveVolume(3)
    expect(audio.volume).toBe(1)
    setLiveVolume(-2)
    expect(audio.volume).toBe(0)
    remove()
    stopAllAlerts()
    expect(audio.currentTime).toBe(0)
    expect(hook).toHaveBeenCalledOnce()
  })

  it('retomar tolera autoplay bloqueado e parar tolera rebobinar indisponível', async () => {
    const audio = new AudioStub('custom')
    await playAlertTone('custom', undefined, audio as unknown as HTMLAudioElement)
    audio.play.mockRejectedValue(new Error('autoplay'))
    resumeAllAlerts()
    await Promise.resolve()
    Object.defineProperty(audio, 'currentTime', { set() { throw new Error('unavailable') } })
    expect(() => stopAllAlerts()).not.toThrow()
  })

  it('não toca sem áudio custom ou sem contexto para os sintetizados', async () => {
    await expect(playAlertTone('custom')).resolves.toBeUndefined()
    await expect(playAlertTone('beep')).resolves.toBeUndefined()
  })

  it('informa duração dos presets e usa metadados do áudio personalizado', () => {
    expect(getPresetDurationMs('none')).toBe(0)
    expect(getPresetDurationMs('custom')).toBe(60_000)
    expect(getPresetDurationMs('custom', { duration: 2.5 } as HTMLAudioElement)).toBe(2500)
    expect(getPresetDurationMs('beep')).toBe(150)
    expect(getPresetDurationMs('abertura_es')).toBe(30_400)
    expect(getPresetDurationMs('5min_es')).toBe(18_000)
    expect(getPresetDurationMs('1min_es')).toBe(65_500)
    expect(getAvailablePresets().map(p => p.key)).toEqual(expect.arrayContaining(['none', 'custom', 'chime', 'gong']))
  })

  it('persiste alertas personalizados por marco, reutiliza áudio e remove somente o escolhido', () => {
    vi.stubGlobal('Audio', AudioStub)
    saveCustomTone('start', 'data:audio/mp3;base64,AAA')
    saveCustomTone('5min', 'data:audio/mp3;base64,BBB')
    expect(loadCustomTones()).toEqual({ start: 'data:audio/mp3;base64,AAA', '5min': 'data:audio/mp3;base64,BBB' })
    const audio = getCustomAudio('start')
    expect(audio?.preload).toBe('auto')
    expect(getCustomAudio('start')).toBe(audio)
    clearCustomTone('start')
    expect(getCustomAudio('start')).toBeUndefined()
    expect(loadCustomTones()).toEqual({ '5min': 'data:audio/mp3;base64,BBB' })
  })

  it('recupera storage inválido e informa quando a quota impede salvar', () => {
    localStorage.setItem(LEGACY_CUSTOM_TONES_KEY, 'broken')
    expect(loadCustomTones()).toEqual({})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => saveCustomTone('start', 'data:large')).toThrow('TOO_LARGE')
  })
})
