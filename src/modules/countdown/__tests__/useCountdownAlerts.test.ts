import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCountdownAlerts } from '../composables/useCountdownAlerts'
import { createAlertEngine } from '../services/timer-alert-engine'
import { playAlertTone } from '../services/alert-tone'

vi.mock('../services/alert-tone')
vi.mock('../services/timer-alert-engine')

const mockPlayAlertTone = vi.mocked(playAlertTone)
const mockCreateAlertEngine = vi.mocked(createAlertEngine)

describe('useCountdownAlerts', () => {
  let engineMock: ReturnType<typeof createAlertEngine>
  let ctxMock: AudioContext

  beforeEach(() => {
    vi.useFakeTimers()
    engineMock = {
      tick: vi.fn().mockReturnValue([]),
      reset: vi.fn(),
    }
    mockCreateAlertEngine.mockReturnValue(engineMock)
    mockPlayAlertTone.mockResolvedValue(undefined)

    ctxMock = {
      currentTime: 0,
      destination: {},
      createOscillator: () => ({
        type: '',
        frequency: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
    } as unknown as AudioContext
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('cria engine com os marcos passados', () => {
    const marks = [
      { id: 'open', atMs: 0 },
      { id: '5min', atMs: 5 * 60_000 },
      { id: '1min', atMs: 60_000 },
      { id: 'end', atMs: 10 * 60_000 },
    ]
    useCountdownAlerts({ marks, audioContext: ctxMock })
    expect(mockCreateAlertEngine).toHaveBeenCalledWith(marks)
  })

  it('tick dispara engine e toca som para cada marco', () => {
    const marks = [{ id: 'open', atMs: 0 }, { id: 'end', atMs: 1000 }]
    const { tick } = useCountdownAlerts({ marks, audioContext: ctxMock })
    engineMock.tick.mockReturnValue([marks[0]])
    tick(0)
    expect(engineMock.tick).toHaveBeenCalledWith(0)
    expect(mockPlayAlertTone).toHaveBeenCalledWith('beep', ctxMock, undefined)
  })

  it('reset chama engine.reset', () => {
    const { reset } = useCountdownAlerts({ marks: [{ id: 'x', atMs: 0 }], audioContext: ctxMock })
    reset()
    expect(engineMock.reset).toHaveBeenCalled()
  })

  it('sem AudioContext mas com customAudio: toca custom', () => {
    const customAudio = { play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLAudioElement
    const { tick } = useCountdownAlerts({ marks: [{ id: 'open', atMs: 0 }], customAudio })
    engineMock.tick.mockReturnValue([{ id: 'open', atMs: 0 }])
    tick(0)
    expect(mockPlayAlertTone).toHaveBeenCalledWith('beep', undefined, customAudio)
  })

  it('sem nenhum áudio: engine conta mas nada toca', () => {
    const { tick } = useCountdownAlerts({ marks: [{ id: 'open', atMs: 0 }] })
    engineMock.tick.mockReturnValue([{ id: 'open', atMs: 0 }])
    tick(0)
    expect(engineMock.tick).toHaveBeenCalled()
    expect(mockPlayAlertTone).not.toHaveBeenCalled()
  })
})
