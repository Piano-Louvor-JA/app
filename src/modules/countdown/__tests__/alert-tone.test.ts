import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  playAlertTone,
  stopAllAlerts,
  ALERT_PRESETS,
} from '../services/alert-tone'

// F2: limpa o estado global de áudios ativos entre testes
afterEach(() => stopAllAlerts())

function makeCtx(lastPlayed: number[] = []) {
  const ctx = {
    currentTime: 100,
    destination: {},
    createOscillator: () => ({
      type: '',
      frequency: { value: 0, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  }
  return { ctx, lastPlayed }
}

describe('alert-tone', () => {
  it('tem presets padrao incluindo escola sabatina', () => {
    expect(Object.keys(ALERT_PRESETS)).toContain('beep')
    expect(Object.keys(ALERT_PRESETS)).toContain('chime')
    expect(Object.keys(ALERT_PRESETS)).toContain('gong')
  })

  it('playAlertTone nao lanca quando AudioContext existe e toca oscilador', () => {
    const played: string[] = []
    const ctx = {
      currentTime: 100,
      destination: {},
      createOscillator: () => {
        const osc = {
          type: '',
          frequency: { value: 0, setValueAtTime: vi.fn() },
          connect: () => played.push('osc'),
          start: vi.fn(),
          stop: vi.fn(),
        }
        return osc
      },
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }),
    }
    expect(() => playAlertTone('beep', ctx as unknown as AudioContext)).not.toThrow()
    expect(played).toContain('osc')
  })

  it('playAlertTone com audio custom (HTMLAudioElement) usa play()', async () => {
    const played = vi.fn().mockResolvedValue(undefined)
    const audio = {
      play: played,
      volume: 1,
      addEventListener: vi.fn(),
    } as unknown as HTMLAudioElement
    await playAlertTone('custom', undefined, audio)
    expect(played).toHaveBeenCalled()
  })

  it('F2: volume do operador é aplicado no elemento de áudio', async () => {
    const played = vi.fn().mockResolvedValue(undefined)
    const audio = {
      play: played,
      volume: 1,
      addEventListener: vi.fn(),
    } as unknown as HTMLAudioElement
    await playAlertTone('custom', undefined, audio, { volume: 0.4 })
    expect(audio.volume).toBe(0.4)
    expect(played).toHaveBeenCalled()
  })

  it('F2: stopAllAlerts pausa áudios ativos e limpa hooks', async () => {
    const paused = vi.fn()
    const played = vi.fn().mockResolvedValue(undefined)
    let endedHandler: (() => void) | undefined
    const audio = {
      play: played,
      pause: paused,
      volume: 1,
      currentTime: 0,
      addEventListener: vi.fn((_: string, handler: () => void) => { endedHandler = handler }),
    } as unknown as HTMLAudioElement
    await playAlertTone('custom', undefined, audio)
    stopAllAlerts()
    expect(paused).toHaveBeenCalled()
  })
  it('nao lanca se play() rejeita (autoplay bloqueado)', async () => {
    const played = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const audio = { play: played } as unknown as HTMLAudioElement
    await expect(playAlertTone('custom', undefined, audio)).resolves.toBeUndefined()
  })
})
