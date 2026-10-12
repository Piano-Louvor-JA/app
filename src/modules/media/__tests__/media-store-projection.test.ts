// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMediaStore } from '../stores/useMediaStore'
import { readMediaRuntimeFromStorage } from '../services/media-runtime'

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => null,
  isDesktopApp: () => false,
}))

const closeProjectionModule = vi.fn()
const openProjectionModule = vi.fn().mockResolvedValue(true)
const isProjectionModuleOpen = vi.fn(() => false)

vi.mock('@shared/composables/useProjectionWindow', () => ({
  openProjectionModule: (...args: unknown[]) => openProjectionModule(...args),
  isProjectionModuleOpen: (...args: unknown[]) => isProjectionModuleOpen(...args),
  closeProjectionModule: (...args: unknown[]) => closeProjectionModule(...args),
  hasSelectedExtendedProjectionTargets: vi.fn().mockResolvedValue(false),
}))

vi.mock('@modules/settings/services/palco-session', () => ({
  palcoSession: {
    slots: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../services/media-catalog', () => ({
  loadMediaTrack: vi.fn().mockResolvedValue({
    id: 2,
    name: 'Faixa 2',
    durationLabel: '03:00',
    audioUrl: '/musics/2.mp3',
    instrumentalUrl: null,
    coverUrl: null,
    coverPosition: null,
    albums: [],
    categories: [],
    lyrics: [
      {
        order: 0,
        lyric: 'Linha 2',
        showSlide: true,
        time: '00:00',
        instrumentalTime: '00:00',
        imageUrl: null,
        imagePosition: null,
        isCover: false,
      },
    ],
  }),
  resolveAlbumSubtitle: vi.fn(() => 'Álbum Teste'),
}))

vi.mock('../services/media-audio', () => ({
  attachMediaAudioListeners: vi.fn(),
  detachMediaAudioListeners: vi.fn(),
  fadeInMediaAudio: vi.fn().mockResolvedValue(true),
  fadeOutMediaAudio: vi.fn().mockResolvedValue(undefined),
  fadeVolumeMediaAudio: vi.fn().mockResolvedValue(undefined),
  formatMediaClock: vi.fn(() => '00:00'),
  getMediaAudioElement: vi.fn(() => ({
    volume: 1,
    paused: true,
    currentTime: 0,
    duration: 100,
    readyState: 4,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(true),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
  })),
  pauseMediaAudio: vi.fn(),
  playMediaAudio: vi.fn().mockResolvedValue(true),
  resolveMusicAudioUrl: vi.fn().mockResolvedValue({
    ok: true,
    url: 'https://example.com/audio2.mp3',
    source: 'remote',
  }),
  resolveSlideImageUrl: vi.fn().mockResolvedValue(null),
  stopAllMediaAudio: vi.fn(),
  switchMediaAudioElement: vi.fn(),
}))

describe('useMediaStore — controle de projeção e ocultação de conteúdo', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    closeProjectionModule.mockClear()
    openProjectionModule.mockClear()
    isProjectionModuleOpen.mockReset()
    isProjectionModuleOpen.mockReturnValue(false)
  })

  it('clearProjection define isProjecting como falso e publica runtime inativo sem fechar a janela', () => {
    const store = useMediaStore()
    store.session = {
      musicId: 10,
      albumId: 1,
      mode: 'audio',
      title: 'Hino Teste',
      subtitle: 'Álbum Teste',
      coverUrl: null,
      audioUrl: 'https://example.com/audio.mp3',
      hasInstrumental: false,
      slides: [
        {
          order: 0,
          lyric: 'Linha 1\nLinha 2',
          showSlide: true,
          time: '00:00',
          instrumentalTime: '00:00',
          imageUrl: 'https://example.com/slide1.jpg',
          imagePosition: null,
          isCover: false,
        },
      ],
      slideTimesSec: [0],
    }
    store.isProjecting = true

    store.clearProjection()

    expect(store.isProjecting).toBe(false)
    const runtime = readMediaRuntimeFromStorage()
    expect(runtime.active).toBe(false)
    expect(runtime.imageUrl).toBe('https://example.com/slide1.jpg')
    expect(runtime.title).toBe('Hino Teste')
  })

  it('toggleProjection após ocultar volta a mostrar o conteúdo sem reabrir a janela', async () => {
    isProjectionModuleOpen.mockReturnValue(true)
    const store = useMediaStore()
    store.session = {
      musicId: 10,
      albumId: 1,
      mode: 'audio',
      title: 'Hino Teste',
      subtitle: 'Álbum Teste',
      coverUrl: null,
      audioUrl: 'https://example.com/audio.mp3',
      hasInstrumental: false,
      slides: [
        {
          order: 0,
          lyric: 'Linha 1',
          showSlide: true,
          time: '00:00',
          instrumentalTime: '00:00',
          imageUrl: 'https://example.com/slide1.jpg',
          imagePosition: null,
          isCover: false,
        },
      ],
      slideTimesSec: [0],
    }
    store.isProjecting = true
    store.clearProjection()
    expect(store.isProjecting).toBe(false)
    expect(readMediaRuntimeFromStorage().active).toBe(false)

    await store.toggleProjection()

    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(closeProjectionModule).not.toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
    const runtime = readMediaRuntimeFromStorage()
    expect(runtime.active).toBe(true)
    expect(runtime.lyric).toBe('Linha 1')
  })

  it('close fecha a janela cabeada quando o player encerra com projeção ativa', () => {
    isProjectionModuleOpen.mockReturnValue(true)
    const store = useMediaStore()
    store.session = {
      musicId: 10,
      albumId: 1,
      mode: 'audio',
      title: 'Hino Teste',
      subtitle: 'Álbum Teste',
      coverUrl: null,
      audioUrl: 'https://example.com/audio.mp3',
      hasInstrumental: false,
      slides: [
        {
          order: 0,
          lyric: 'Linha 1',
          showSlide: true,
          time: '00:00',
          instrumentalTime: '00:00',
          imageUrl: null,
          imagePosition: null,
          isCover: false,
        },
      ],
      slideTimesSec: [0],
    }
    store.isProjecting = true

    store.close()

    expect(closeProjectionModule).toHaveBeenCalledTimes(1)
    expect(store.isProjecting).toBe(false)
    expect(store.session).toBeNull()
  })

  it('playQueueItem mantém a fila e não fecha a janela de projeção', async () => {
    isProjectionModuleOpen.mockReturnValue(true)
    const store = useMediaStore()
    const queue = [
      { musicId: 1, albumId: 1, title: 'Faixa 1' },
      { musicId: 2, albumId: 1, title: 'Faixa 2' },
    ]
    store.queue = queue
    store.queueIndex = 0
    store.isProjecting = true
    store.session = {
      musicId: 1,
      albumId: 1,
      mode: 'audio',
      title: 'Faixa 1',
      subtitle: 'Álbum Teste',
      coverUrl: null,
      audioUrl: 'https://example.com/audio1.mp3',
      hasInstrumental: false,
      slides: [
        {
          order: 0,
          lyric: 'Linha 1',
          showSlide: true,
          time: '00:00',
          instrumentalTime: '00:00',
          imageUrl: null,
          imagePosition: null,
          isCover: false,
        },
      ],
      slideTimesSec: [0],
    }

    await store.playQueueItem(queue[1])

    expect(store.queue).toHaveLength(2)
    expect(store.queueIndex).toBe(1)
    expect(closeProjectionModule).not.toHaveBeenCalled()
    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
    expect(store.session?.musicId).toBe(2)
  })

  it('playQueue na primeira faixa chama startProjection (abre a janela)', async () => {
    const store = useMediaStore()
    const queue = [
      { musicId: 1, albumId: 1, title: 'Faixa 1' },
      { musicId: 2, albumId: 1, title: 'Faixa 2' },
    ]

    await store.playQueue(queue, 0)

    expect(openProjectionModule).toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
    expect(store.queue).toHaveLength(2)
    expect(store.session?.musicId).toBe(1)
  })

  it('publica a próxima frase e o progresso no runtime de projeção', () => {
    const store = useMediaStore()
    store.session = {
      musicId: 10,
      albumId: 1,
      mode: 'audio',
      title: 'Hino Teste',
      subtitle: 'Álbum Teste',
      coverUrl: null,
      audioUrl: 'https://example.com/audio.mp3',
      hasInstrumental: false,
      slides: [
        {
          order: 0,
          lyric: 'Frase atual',
          showSlide: true,
          time: '00:00',
          instrumentalTime: '00:00',
          imageUrl: null,
          imagePosition: null,
          isCover: false,
        },
        {
          order: 1,
          lyric: 'Frase seguinte',
          showSlide: true,
          time: '00:10',
          instrumentalTime: '00:10',
          imageUrl: null,
          imagePosition: null,
          isCover: false,
        },
      ],
      slideTimesSec: [0, 10],
    }
    store.isProjecting = true
    store.slideIndex = 0
    store.currentTimeSec = 5
    store.durationSec = 20
    store.publishProjectionState()

    const runtime = readMediaRuntimeFromStorage()
    expect(runtime.lyric).toBe('Frase atual')
    expect(runtime.nextLyric).toBe('Frase seguinte')
    expect(runtime.slideProgressRatio).toBeCloseTo(0.5)
    expect(runtime.progressRatio).toBeCloseTo(0.25)
  })
  it('troca manual de letras sem cues preserva posição do áudio', async () => {
    const store = useMediaStore()
    store.session = {
      musicId: -1, albumId: null, mode: 'audio', title: 'Import', subtitle: '',
      coverUrl: null, audioUrl: 'https://example.com/audio.mp3', hasInstrumental: false,
      slides: [0, 1, 2].map(order => ({ order, lyric: `Linha ${order}`, showSlide: true,
        time: '00:00', instrumentalTime: '00:00', imageUrl: null, imagePosition: null,
        isCover: order === 0 })),
      slideTimesSec: [0, 0, 0],
    }
    store.currentTimeSec = 42
    await store.goToSlide(2)
    expect(store.slideIndex).toBe(2)
    expect(store.currentTimeSec).toBe(42)
  })

})
