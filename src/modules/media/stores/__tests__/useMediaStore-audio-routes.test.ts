// @vitest-environment jsdom
/**
 * Cobertura useMediaStore — gaps REAIS residuais (task t_86847917).
 * As linhas 274-311/361/411-419/461 são bug de remap v8 (executadas não
 * contadas) — NÃO atacadas aqui. Este arquivo cobre:
 *   play(): rota TV (volume 0 + clock), no_audio (mudo sem fade), normal (fade-in)
 *   pause(): rota TV, no_audio / volume<=0, normal (fade-out)
 *   setAudioRoute tv→pc retoma playback; switchMode + project
 * Áudio real é mockado no nível dos services (media-audio) — o store
 * orquestra, o elemento Audio do jsdom não toca nada de verdade.
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
  audioMocks.playMediaAudio.mockClear()
  audioMocks.pauseMediaAudio.mockClear()
  audioMocks.fadeInMediaAudio.mockClear()
  audioMocks.fadeVolumeMediaAudio.mockClear()
  audioMocks.playMediaAudio.mockResolvedValue(true)
  audioMocks.fadeInMediaAudio.mockResolvedValue(true)
  localStorage.removeItem('louvorja-audio-route')
})

/** Sessão com áudio remoto (catálogo oficial mockado — shape MediaTrackRecord). */
function mockRemoteTrack() {
  loadMediaTrackMock.mockResolvedValue({
    id: 42,
    name: 'Hino Sacra',
    durationLabel: '3:00',
    audioUrl: '/musics/hino.mp3',
    instrumentalUrl: null,
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

describe('useMediaStore.play — rotas de áudio', () => {
  it('sem sessão com audioUrl: play não faz nada', async () => {
    const store = useMediaStore()
    await store.play()
    expect(audioMocks.playMediaAudio).not.toHaveBeenCalled()
    expect(audioMocks.fadeInMediaAudio).not.toHaveBeenCalled()
  })

  it('rota PC normal: play faz fade-in no volume corrente', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    const vol = store.volume
    audioMocks.fadeInMediaAudio.mockClear()

    await store.play()

    expect(audioMocks.fadeInMediaAudio).toHaveBeenCalledWith(
      expect.any(HTMLAudioElement),
      vol,
    )
    expect(store.status).toBe('playing')
    store.close()
  })

  it('rota PC com play falhando: status paused', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    audioMocks.fadeInMediaAudio.mockResolvedValue(false)

    await store.play()
    expect(store.status).toBe('paused')
    store.close()
  })

  it('modo no_audio: play retoma fluxo mudo sem fade', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    await store.switchMode('no_audio')
    audioMocks.playMediaAudio.mockClear()
    audioMocks.fadeInMediaAudio.mockClear()

    await store.play()

    expect(audioMocks.fadeInMediaAudio).not.toHaveBeenCalled()
    expect(audioMocks.playMediaAudio).toHaveBeenCalled()
    const audio = audioMocks.playMediaAudio.mock.calls[0][0] as HTMLAudioElement
    expect(audio.volume).toBe(0)
    expect(store.status).toBe('playing')
    store.close()
  })

  it('modo no_audio com play falhando: status paused', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    await store.switchMode('no_audio')
    audioMocks.playMediaAudio.mockResolvedValue(false)

    await store.play()
    expect(store.status).toBe('paused')
    store.close()
  })

  it('rota TV: áudio local mutado como relógio, sem fade', async () => {
    mockRemoteTrack()
    localStorage.setItem('louvorja-audio-route', 'tv')
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    audioMocks.playMediaAudio.mockClear()
    audioMocks.fadeInMediaAudio.mockClear()

    await store.play()

    expect(audioMocks.fadeInMediaAudio).not.toHaveBeenCalled()
    expect(audioMocks.playMediaAudio).toHaveBeenCalled()
    const audio = audioMocks.playMediaAudio.mock.calls[0][0] as HTMLAudioElement
    expect(audio.volume).toBe(0)
    expect(store.status).toBe('playing')
    store.close()
  })

  it('rota TV com play falhando: status paused', async () => {
    mockRemoteTrack()
    localStorage.setItem('louvorja-audio-route', 'tv')
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    audioMocks.playMediaAudio.mockResolvedValue(false)

    await store.play()
    expect(store.status).toBe('paused')
    store.close()
  })
})

describe('useMediaStore.pause — rotas de áudio', () => {
  it('sem sessão com audioUrl: pause não faz nada', async () => {
    const store = useMediaStore()
    await store.pause()
    expect(audioMocks.pauseMediaAudio).not.toHaveBeenCalled()
  })

  it('rota TV: pausa direta o elemento local (relógio)', async () => {
    mockRemoteTrack()
    localStorage.setItem('louvorja-audio-route', 'tv')
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    audioMocks.pauseMediaAudio.mockClear()

    await store.pause()

    expect(store.status).toBe('paused')
    expect(audioMocks.pauseMediaAudio).toHaveBeenCalled()
    expect(audioMocks.fadeVolumeMediaAudio).not.toHaveBeenCalled()
    store.close()
  })

  it('modo no_audio: pausa direta sem fade', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    await store.switchMode('no_audio')
    // o switchMode em si silencia com fade — limpar antes de pausar
    audioMocks.fadeVolumeMediaAudio.mockClear()
    audioMocks.pauseMediaAudio.mockClear()

    await store.pause()

    expect(audioMocks.pauseMediaAudio).toHaveBeenCalled()
    expect(audioMocks.fadeVolumeMediaAudio).not.toHaveBeenCalled()
    store.close()
  })

  it('volume já em 0: pausa direta sem fade', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    const { getMediaAudioElement } = await import(
      '@modules/media/services/media-audio'
    )
    getMediaAudioElement().volume = 0
    audioMocks.pauseMediaAudio.mockClear()

    await store.pause()

    expect(audioMocks.pauseMediaAudio).toHaveBeenCalled()
    expect(audioMocks.fadeVolumeMediaAudio).not.toHaveBeenCalled()
    store.close()
  })

  it('volume audível: fade-out antes de pausar', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    const { getMediaAudioElement } = await import(
      '@modules/media/services/media-audio'
    )
    getMediaAudioElement().volume = 0.8
    audioMocks.pauseMediaAudio.mockClear()

    await store.pause()

    expect(audioMocks.fadeVolumeMediaAudio).toHaveBeenCalledWith(
      expect.any(HTMLAudioElement),
      0,
    )
    expect(audioMocks.pauseMediaAudio).toHaveBeenCalled()
    expect(store.status).toBe('paused')
    store.close()
  })
})

describe('useMediaStore.setAudioRoute', () => {
  it('mesma rota: não faz nada', async () => {
    const store = useMediaStore()
    await store.setAudioRoute('pc')
    expect(store.audioRoute).toBe('pc')
  })

  it('pc → tv persiste e muta o áudio local', async () => {
    mockRemoteTrack()
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })

    await store.setAudioRoute('tv')

    expect(store.audioRoute).toBe('tv')
    expect(localStorage.getItem('louvorja-audio-route')).toBe('tv')
    // O elemento fica no módulo (slots a/b), não no DOM do documento
    const { getMediaAudioElement } = await import(
      '@modules/media/services/media-audio'
    )
    expect(getMediaAudioElement().volume).toBe(0)
    store.close()
  })

  it('tv → pc retoma o playback local (play())', async () => {
    mockRemoteTrack()
    localStorage.setItem('louvorja-audio-route', 'tv')
    const store = useMediaStore()
    await store.open({ musicId: 42, mode: 'audio', project: false })
    audioMocks.fadeInMediaAudio.mockClear()

    await store.setAudioRoute('pc')

    expect(store.audioRoute).toBe('pc')
    expect(audioMocks.fadeInMediaAudio).toHaveBeenCalled()
    store.close()
  })

  it('setAudioOnTv liga/desliga', async () => {
    const store = useMediaStore()
    await store.setAudioOnTv(true)
    expect(store.audioRoute).toBe('tv')
    await store.setAudioOnTv(false)
    expect(store.audioRoute).toBe('pc')
  })
})
