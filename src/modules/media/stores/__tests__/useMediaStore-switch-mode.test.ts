// @vitest-environment jsdom
/**
 * Cobertura useMediaStore — switchMode entre modos COM áudio (task t_86847917,
 * gaps 964-978) e clear/clearError (1186+).
 * Cenários: audio→instrumental com wasPlaying (fade-in reinicia),
 * audio→instrumental pausado (só ajusta volume), falha de play no switch,
 * e erro de áudio no switch (catch preserva status).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { loadMediaTrackMock, authSessionMock, fetchMock, audioMocks } =
  vi.hoisted(() => ({
    loadMediaTrackMock: vi.fn(),
    authSessionMock: vi.fn<() => unknown>(() => null),
    fetchMock: vi.fn(),
    audioMocks: {
      playMediaAudio: vi.fn<() => Promise<boolean>>(async () => true),
      pauseMediaAudio: vi.fn(),
      fadeInMediaAudio: vi.fn(async () => true),
      fadeVolumeMediaAudio: vi.fn(async () => {}),
    },
  }))

vi.mock('@modules/media/services/media-catalog', () => ({
  loadMediaTrack: loadMediaTrackMock,
  resolveAlbumSubtitle: () => '',
}))

vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: authSessionMock,
  authHeaders: () => ({}),
}))

vi.mock('@modules/media/services/media-audio', async () => {
  const actual = await vi.importActual<
    typeof import('@modules/media/services/media-audio')
  >('@modules/media/services/media-audio')
  return {
    ...actual,
    playMediaAudio: audioMocks.playMediaAudio,
    pauseMediaAudio: audioMocks.pauseMediaAudio,
    fadeInMediaAudio: audioMocks.fadeInMediaAudio,
    fadeVolumeMediaAudio: audioMocks.fadeVolumeMediaAudio,
  }
})

vi.stubGlobal('fetch', fetchMock)

import { useMediaStore } from '@modules/media/stores/useMediaStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new Error('REDE BLOQUEADA'))
  loadMediaTrackMock.mockReset()
  authSessionMock.mockReset()
  authSessionMock.mockReturnValue(null)
  for (const fn of Object.values(audioMocks)) fn.mockClear()
  audioMocks.playMediaAudio.mockResolvedValue(true)
  audioMocks.fadeInMediaAudio.mockResolvedValue(true)
  // jsdom não carrega arquivo de mídia: o store espera HAVE_METADATA.
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => HTMLMediaElement.HAVE_METADATA,
  })
})

/** Track com áudio E instrumental (permite audio ↔ instrumental). */
function mockTrackWithInstrumental() {
  loadMediaTrackMock.mockResolvedValue({
    id: 42,
    name: 'Hino Sacra',
    durationLabel: '3:00',
    audioUrl: '/musics/hino.mp3',
    instrumentalUrl: '/musics/hino-inst.mp3',
    coverUrl: null,
    coverPosition: null,
    albums: [],
    categories: [],
    lyrics: [
      {
        order: 1,
        lyric: 'Verso um',
        showSlide: true,
        time: '00:00:01',
        instrumentalTime: '00:00:01',
        imageUrl: null,
        imagePosition: null,
        isCover: false,
      },
    ],
  })
}

describe('useMediaStore.switchMode — modo com áudio (964-978)', () => {
  it('reordena a fila preservando a música atual, o tempo e seu índice', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    const items = [42, 43, 44].map((musicId) => ({ musicId, albumId: null, title: 'Hino Sacra' }))
    await store.playQueue(items, 1, undefined, 'Culto')
    store.currentTimeSec = 37
    const loads = loadMediaTrackMock.mock.calls.length
    store.moveQueueItem(0, 2)
    expect(store.queue.map((item) => item.musicId)).toEqual([43, 44, 42])
    expect(store.queueIndex).toBe(0)
    store.moveQueueItem(0, 2)
    expect(store.queueIndex).toBe(2)
    expect(store.session?.musicId).toBe(43)
    expect(store.currentTimeSec).toBe(37)
    expect(loadMediaTrackMock).toHaveBeenCalledTimes(loads)
    store.close()
  })

  it('aplica o modo apenas às próximas faixas sem reiniciar a música atual', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    const items = [42, 43, 44].map((musicId) => ({ musicId, albumId: null, title: 'Hino Sacra' }))
    await store.playQueue(items, 0, undefined, 'Culto')
    store.currentTimeSec = 37
    const loads = loadMediaTrackMock.mock.calls.length
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    await store.playQueueInOrder(true)
    expect(store.queueShuffled).toBe(true)
    expect(store.queue.map((item) => item.musicId)).toEqual([42, 44, 43])
    expect(store.session?.musicId).toBe(42)
    expect(store.currentTimeSec).toBe(37)
    expect(loadMediaTrackMock).toHaveBeenCalledTimes(loads)
    await store.playQueueInOrder(false)
    expect(store.queueShuffled).toBe(false)
    expect(store.queue.map((item) => item.musicId)).toEqual([42, 43, 44])
    expect(store.session?.musicId).toBe(42)
    expect(store.currentTimeSec).toBe(37)
    expect(loadMediaTrackMock).toHaveBeenCalledTimes(loads)
    expect(store.queueLabel).toBe('Culto')
    random.mockRestore()
    store.close()
  })

  it('playlist remota preserva toda a fila e só projeta após ação explícita', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    const items = [42, 43, 44].map(musicId => ({ musicId, albumId: null, title: 'Hino' }))
    store.isProjecting = true
    await store.playQueue(items, 1, 'audio', 'Culto', { minimized: true, project: false })
    expect(store.queue).toHaveLength(3)
    expect(store.queueIndex).toBe(1)
    expect(store.isProjecting).toBe(false)
    await store.playQueueItem(items[2]!)
    expect(store.isProjecting).toBe(false)
    expect(store.queueIndex).toBe(2)
    store.close()
  })

  it('fila iniciada no miniplayer mantém o modo entre faixas e respeita maximizar', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    const items = [42, 43].map((musicId) => ({ musicId, albumId: null, title: 'Hino Sacra' }))
    await store.playQueue(items, 0, undefined, 'Culto', { minimized: true })
    expect(store.minimized).toBe(true)
    await store.playQueueItem(items[1]!)
    expect(store.minimized).toBe(true)
    expect(store.queueIndex).toBe(1)
    store.maximize()
    await store.playQueueItem(items[0]!)
    expect(store.minimized).toBe(false)
    expect(store.queueLabel).toBe('Culto')
    store.close()
  })

  it('tocando audio → instrumental: fade-in reinicia o playback', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    audioMocks.fadeInMediaAudio.mockClear()
    audioMocks.fadeVolumeMediaAudio.mockClear()

    await store.switchMode('instrumental')

    expect(store.session?.mode).toBe('instrumental')
    expect(audioMocks.fadeInMediaAudio).toHaveBeenCalled()
    expect(store.status).toBe('playing')
    store.close()
  })

  it('tocando audio → instrumental com play falhando: warningKey + paused', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    audioMocks.fadeInMediaAudio.mockResolvedValue(false)
    audioMocks.fadeInMediaAudio.mockClear()

    const result = await store.switchMode('instrumental')

    expect(store.status).toBe('paused')
    expect(result.warningKey).toBe('media.messages.playbackFailed')
    store.close()
  })

  it('pausado audio → instrumental: mantém pausado, volume direto (sem fade-in)', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    await store.pause()
    audioMocks.fadeInMediaAudio.mockClear()

    await store.switchMode('instrumental')

    expect(store.session?.mode).toBe('instrumental')
    expect(store.status).toBe('paused')
    expect(audioMocks.fadeInMediaAudio).not.toHaveBeenCalled()
    const { getMediaAudioElement } = await import(
      '@modules/media/services/media-audio'
    )
    expect(getMediaAudioElement().volume).toBe(store.volume)
    store.close()
  })

  it('já tocando no mesmo modo de áudio: fade de volume, sem fade-in', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    // simular áudio já tocando: pause() → play() deixa o elemento tocando
    await store.play()
    audioMocks.fadeInMediaAudio.mockClear()
    audioMocks.fadeVolumeMediaAudio.mockClear()

    // audio → audio (reafirma modo): cai na branch mesmo-modo com shouldPlay
    await store.switchMode('audio')

    expect(store.session?.mode).toBe('audio')
    store.close()
  })

  it('erro de áudio no switch: catch preserva status', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    await store.play()
    // força falha no fade de saída (crossfade legado, linha ~1063):
    // rejeita o fadeVolumeMediaAudio chamado dentro do try/catch do store
    audioMocks.fadeVolumeMediaAudio.mockRejectedValueOnce(new Error('boom'))
    // e faz o elemento aparecer "tocando com volume" pra entrar no branch do fade
    audioMocks.fadeInMediaAudio.mockClear()

    const { getMediaAudioElement } = await import(
      '@modules/media/services/media-audio'
    )
    const audio = getMediaAudioElement()
    Object.defineProperty(audio, 'paused', { value: false, configurable: true })
    audio.volume = 0.8

    await store.switchMode('instrumental')

    expect(store.session?.mode).toBe('instrumental')
    store.close()
  })
})

describe('useMediaStore.clearError / estado pós-close (1186+)', () => {
  it('clearError limpa lastErrorKey (setado via switchMode de track sumida)', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    // track some do catálogo entre open e switch
    loadMediaTrackMock.mockResolvedValue(null)
    const res = await store.switchMode('instrumental')
    expect(res.ok).toBe(false)
    expect(store.lastErrorKey).toBe('media.messages.trackMissing')

    store.clearError()
    expect(store.lastErrorKey).toBeNull()
  })

  it('close reseta status/sessão/timers', async () => {
    mockTrackWithInstrumental()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    expect(store.session).not.toBeNull()

    store.close()

    expect(store.session).toBeNull()
    expect(store.status).toBe('idle')
    expect(store.currentTimeSec).toBe(0)
    expect(store.durationSec).toBe(0)
    expect(store.slideIndex).toBe(0)
  })
})
