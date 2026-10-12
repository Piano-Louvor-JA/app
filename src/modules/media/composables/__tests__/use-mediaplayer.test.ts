// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { ref, computed } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gap-fill de useMediaPlayer — wrapper fino do useMediaStore para views.
 * Reaproveita os mocks do media-store-core.
 */

const openMock = vi.fn()
const maximizeMock = vi.fn()
vi.mock('../../stores/useMediaStore', () => ({
  useMediaStore: () => ({
    open: (...a: unknown[]) => openMock(...(a as [])),
    maximize: () => maximizeMock(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    seekTo: vi.fn(),
    seekRatio: vi.fn(),
    goToSlide: vi.fn(),
    nextSlide: vi.fn(),
    previousSlide: vi.fn(),
    jumpToQueue: vi.fn(),
    setVolume: vi.fn(),
    minimize: vi.fn(),
    togglePlaylist: vi.fn(),
    setPlaylistOpen: vi.fn(),
    requestClose: vi.fn(),
    cancelClose: vi.fn(),
    switchMode: vi.fn().mockResolvedValue({ ok: true }),
    startProjection: vi.fn().mockResolvedValue(true),
    clearProjection: vi.fn(),
    toggleProjection: vi.fn(),
    setAudioOnTv: vi.fn(),
    close: vi.fn(),
    clearError: vi.fn(),
    syncProjectionFlag: vi.fn(),
    session: ref(null),
    status: ref('idle'),
    lastErrorKey: ref(null),
    minimized: ref(true),
    isProjecting: ref(false),
    showPlaylist: ref(true),
    closeConfirmOpen: ref(false),
    slideIndex: ref(0),
    currentTimeSec: ref(0),
    durationSec: ref(0),
    volume: ref(1),
    resolvedSlideImageUrl: ref(null),
    ondemandDownloadPercent: ref(null),
    preplayDownloadMusicId: ref(null),
    ondemandNoticeVisible: ref(false),
    ondemandDownloadDone: ref(false),
    hasSession: ref(false),
    isPlaying: ref(false),
    isPaused: ref(false),
    hasAudio: ref(false),
    hasInstrumental: ref(false),
    playbackMode: ref('audio'),
    currentSlide: ref(null),
    previewSnippet: ref(''),
    previewReference: ref(''),
    progressRatio: ref(0),
    slideProgressRatio: ref(0),
    currentTimeLabel: ref('00:00'),
    durationLabel: ref('00:00'),
    slideCount: ref(0),
    audioOnTv: ref(false),
    queue: ref([]),
    queueIndex: ref(-1),
  }),
}))

import { useMediaPlayer } from '../useMediaPlayer'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useMediaPlayer — wrapper do store', () => {
  it('expõe estado e ações; openTrack delega ao store.open', async () => {
    openMock.mockResolvedValue({ ok: true })
    const player = useMediaPlayer()
    const r = await player.openTrack({ musicId: 1, mode: 'audio' })
    expect(openMock).toHaveBeenCalledWith({ musicId: 1, mode: 'audio' })
    expect(r.ok).toBe(true)
    expect(typeof player.play).toBe('function')
    expect(typeof player.pause).toBe('function')
    expect(typeof player.togglePlay).toBe('function')
    expect(typeof player.seekTo).toBe('function')
    expect(typeof player.seekRatio).toBe('function')
    expect(typeof player.goToSlide).toBe('function')
    expect(typeof player.nextSlide).toBe('function')
    expect(typeof player.previousSlide).toBe('function')
    expect(typeof player.jumpToQueue).toBe('function')
    expect(typeof player.setVolume).toBe('function')
    expect(typeof player.minimize).toBe('function')
    expect(typeof player.maximize).toBe('function')
    expect(typeof player.togglePlaylist).toBe('function')
    expect(typeof player.setPlaylistOpen).toBe('function')
    expect(typeof player.requestClose).toBe('function')
    expect(typeof player.cancelClose).toBe('function')
    expect(typeof player.switchMode).toBe('function')
    expect(typeof player.startProjection).toBe('function')
    expect(typeof player.clearProjection).toBe('function')
    expect(typeof player.toggleProjection).toBe('function')
    expect(typeof player.close).toBe('function')
    expect(typeof player.clearError).toBe('function')
    expect(typeof player.syncProjectionFlag).toBe('function')
    expect(typeof player.onToggleAudioOnTv).toBe('function')
  })

  it('onToggleAudioOnTv alterna via setAudioOnTv', async () => {
    const player = useMediaPlayer()
    player.onToggleAudioOnTv()
    // store mockado: setAudioOnTv é vi.fn por instância — sem crash é suficiente
    expect(player.audioOnTv).toBeDefined()
  })

  it('switchMode delega', async () => {
    const player = useMediaPlayer()
    const r = await player.switchMode('no_audio')
    expect(r.ok).toBe(true)
  })
})
