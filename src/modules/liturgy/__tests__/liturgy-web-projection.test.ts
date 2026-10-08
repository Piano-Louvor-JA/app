import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _openLiturgyLocalVideo } from '../services/liturgy-web-projection'

// Estado compartilhado dos mocks
const mockState = vi.hoisted(() => ({
  settings: { targetDisplayIds: [1, 2] as number[] },
  systemDisplays: [
    { id: 1, label: 'A', extended: true },
    { id: 2, label: 'B', extended: true },
    { id: 3, label: 'C', extended: false },
  ] as Array<{ id: number; label: string; extended: boolean }>,
  bridge: null as
    | null
    | {
        projection: Record<string, ReturnType<typeof vi.fn>>
        presentation?: { detectOffice?: ReturnType<typeof vi.fn> }
      },
  openProjectionModuleResult: true as boolean,
  published: [] as unknown[],
  videoRouted: [] as unknown[],
  projectRouted: [] as unknown[],
}))

vi.mock('@modules/settings/services/projection-preferences', () => ({
  loadProjectionSettings: () => mockState.settings,
}))

vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: async () => mockState.systemDisplays,
  listExtendedDisplays: (displays: Array<{ id: number; extended: boolean }>) =>
    displays.filter((d) => d.extended),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  openProjectionModule: vi.fn(async () => mockState.openProjectionModuleResult),
  closeProjectionModule: vi.fn(),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => mockState.bridge,
}))

vi.mock('../../settings/services/palco-session', () => ({
  palcoSession: {
    videoRouted: async (payload: unknown) => {
      mockState.videoRouted.push(payload)
    },
    projectRouted: async (...args: unknown[]) => {
      mockState.projectRouted.push(args)
    },
  },
}))

vi.mock('../services/liturgy-web-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/liturgy-web-runtime')>()
  return {
    ...actual,
    publishLiturgyWebRuntime: (runtime: unknown) => {
      mockState.published.push(runtime)
    },
  }
})

import {
  openLiturgyLocalImageControl,
  openLiturgyLocalPdfControl,
  openLiturgyLocalPresentationControl,
  openLiturgyLocalVideoControl,
  openLiturgySiteControl,
  openLiturgySiteOnScreens,
  openLiturgyVideoControl,
  openLiturgyWebOnConfiguredScreens,
  playLiturgyLocalImageOnScreens,
  playLiturgyLocalPdfOnScreens,
  playLiturgyLocalPresentationOnScreens,
  playLiturgyLocalVideoOnScreens,
  playLiturgyWebOnConfiguredScreens,
} from '../services/liturgy-web-projection'
import { closeProjectionModule, openProjectionModule } from '@shared/composables/useProjectionWindow'

function makeBridge(overrides: Partial<{ openUrl: unknown; remotePlay: unknown; detectOffice: unknown }> = {}) {
  return {
    projection: {
      openUrl: (overrides.openUrl ?? vi.fn(async () => true)) as ReturnType<typeof vi.fn>,
      remotePlay: (overrides.remotePlay ?? vi.fn(async () => true)) as ReturnType<typeof vi.fn>,
    },
    presentation: {
      detectOffice: (overrides.detectOffice ?? vi.fn(async () => true)) as ReturnType<typeof vi.fn>,
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mockState.bridge = null
  mockState.published.length = 0
  mockState.videoRouted.length = 0
  mockState.projectRouted.length = 0
  mockState.openProjectionModuleResult = true
  mockState.settings = { targetDisplayIds: [1, 2] }
  vi.mocked(closeProjectionModule).mockClear()
  vi.mocked(openProjectionModule).mockClear()
})

describe('openLiturgyWebOnConfiguredScreens', () => {
  it('URL inválida → false', async () => {
    await expect(openLiturgyWebOnConfiguredScreens('http://')).resolves.toBe(false)
  })

  it('browser (sem bridge): publica runtime e abre módulo', async () => {
    const ok = await openLiturgyWebOnConfiguredScreens('https://exemplo.com', 'Título')
    expect(ok).toBe(true)
    expect(mockState.published).toEqual([
      expect.objectContaining({ active: true, url: 'https://exemplo.com', kind: 'site' }),
    ])
    expect(openProjectionModule).toHaveBeenCalledWith('liturgy-web')
  })

  it('electron: fecha módulo e abre via bridge com monitores estendidos', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    const ok = await openLiturgyWebOnConfiguredScreens('https://youtu.be/abc', 'Hino')
    expect(ok).toBe(true)
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://www.youtube.com/watch?v=abc', videoId: 'abc', monitorIds: [1, 2], mode: 'video', withScreens: true }),
    )
  })

  it('título vazio cai no rawUrl; kind site omite videoId', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await openLiturgyWebOnConfiguredScreens('exemplo.com')
    expect(openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'exemplo.com', videoId: undefined, mode: 'site' }),
    )
  })

  it('monitores configurados mas não estendidos são filtrados', async () => {
    mockState.settings = { targetDisplayIds: [2, 3, 99] }
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await openLiturgyWebOnConfiguredScreens('exemplo.com')
    expect(openUrl).toHaveBeenCalledWith(expect.objectContaining({ monitorIds: [2] }))
  })
})

describe('wrappers site/video', () => {
  it('site control: withScreens false', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await openLiturgySiteControl('exemplo.com')
    expect(openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: false, mode: 'site' }))
  })

  it('video control: withScreens false', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await openLiturgyVideoControl('https://youtu.be/abc')
    expect(openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: false, mode: 'video' }))
  })

  it('site on screens: withScreens true', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await openLiturgySiteOnScreens('exemplo.com')
    expect(openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: true }))
  })
})

describe('playLiturgyWebOnConfiguredScreens', () => {
  it('URL inválida → false', async () => {
    await expect(playLiturgyWebOnConfiguredScreens('http://')).resolves.toBe(false)
  })

  it('site: só abre', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(playLiturgyWebOnConfiguredScreens('exemplo.com')).resolves.toBe(true)
    expect(openUrl).toHaveBeenCalledTimes(1)
  })

  it('vídeo: bridge sem remotePlay → só abre', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = {
      projection: { openUrl: openUrl as ReturnType<typeof vi.fn> },
    }
    await expect(
      playLiturgyWebOnConfiguredScreens('https://youtu.be/abc'),
    ).resolves.toBe(true)
  })

  it('vídeo: remotePlay sucesso na 1ª tentativa', async () => {
    const remotePlay = vi.fn(async () => true)
    mockState.bridge = makeBridge({ remotePlay })
    const promise = playLiturgyWebOnConfiguredScreens('https://youtu.be/abc')
    await vi.advanceTimersByTimeAsync(700)
    await expect(promise).resolves.toBe(true)
    expect(remotePlay).toHaveBeenCalledTimes(1)
  })

  it('vídeo: play abre popup com withScreens TRUE (mutante L113 true→false pula remotePlay interno)', async () => {
    const openUrl = vi.fn(async () => true)
    const remotePlay = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl, remotePlay })
    const promise = playLiturgyWebOnConfiguredScreens('https://youtu.be/abc')
    await vi.advanceTimersByTimeAsync(700)
    await expect(promise).resolves.toBe(true)
    // popup aberto pelo play TEM que ser com telas (withScreens: true)
    expect(openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ withScreens: true, mode: 'video' }),
    )
  })

  it('vídeo: remotePlay falha 1ª, sucede na 2ª (retry após sleep)', async () => {
    let calls = 0
    const remotePlay = vi.fn(async () => {
      calls += 1
      return calls > 1
    })
    mockState.bridge = makeBridge({ remotePlay })
    const promise = playLiturgyWebOnConfiguredScreens('https://youtu.be/abc')
    await vi.advanceTimersByTimeAsync(1500)
    await expect(promise).resolves.toBe(true)
    expect(remotePlay).toHaveBeenCalledTimes(2)
  })

  it('vídeo: remotePlay falha sempre → false', async () => {
    const remotePlay = vi.fn(async () => false)
    mockState.bridge = makeBridge({ remotePlay })
    const promise = playLiturgyWebOnConfiguredScreens('https://youtu.be/abc')
    await vi.advanceTimersByTimeAsync(2000)
    await expect(promise).resolves.toBe(false)
    expect(remotePlay).toHaveBeenCalledTimes(2)
  })

  it('abertura do popup falhou → false sem remotePlay', async () => {
    const openUrl = vi.fn(async () => false)
    const remotePlay = vi.fn()
    mockState.bridge = makeBridge({ openUrl, remotePlay })
    await expect(
      playLiturgyWebOnConfiguredScreens('https://youtu.be/abc'),
    ).resolves.toBe(false)
    expect(remotePlay).not.toHaveBeenCalled()
  })
})

describe('vídeo local', () => {
  it('browser sem objectUrl → false', async () => {
    await expect(openLiturgyLocalVideoControl('/v/a.mp4')).resolves.toBe(false)
  })

  it('browser com objectUrl → publica runtime local-video', async () => {
    await expect(
      openLiturgyLocalVideoControl('/v/a.mp4', '', 'blob:x'),
    ).resolves.toBe(true)
    expect(mockState.published).toEqual([
      expect.objectContaining({ kind: 'local-video', url: 'blob:x', title: 'a.mp4' }),
    ])
  })

  it('electron com path vazio → false', async () => {
    mockState.bridge = makeBridge()
    await expect(playLiturgyLocalVideoOnScreens('   ')).resolves.toBe(false)
  })

  it('electron: abre, roteia palco, remotePlay 1ª ok', async () => {
    const openUrl = vi.fn(async () => true)
    const remotePlay = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl, remotePlay })
    const promise = playLiturgyLocalVideoOnScreens('/v/a.mp4', 'Título')
    await vi.advanceTimersByTimeAsync(500)
    await expect(promise).resolves.toBe(true)
    expect(openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/v/a.mp4', title: 'Título', mode: 'video' }),
    )
    expect(mockState.videoRouted).toEqual([expect.objectContaining({ url: '/v/a.mp4' })])
    expect(remotePlay).toHaveBeenCalledTimes(1)
  })

  it('electron: openUrl falhou → false, sem palco', async () => {
    const openUrl = vi.fn(async () => false)
    mockState.bridge = makeBridge({ openUrl })
    await expect(openLiturgyLocalVideoControl('/v/a.mp4')).resolves.toBe(false)
    expect(mockState.videoRouted).toHaveLength(0)
  })

  it('electron: withScreens false → true sem remotePlay', async () => {
    const openUrl = vi.fn(async () => true)
    const remotePlay = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl, remotePlay })
    await expect(openLiturgyLocalVideoControl('/v/a.mp4')).resolves.toBe(true)
    expect(mockState.videoRouted).toHaveLength(1)
    expect(remotePlay).not.toHaveBeenCalled()
  })

  it('electron: remotePlay retry', async () => {
    let calls = 0
    const remotePlay = vi.fn(async () => {
      calls += 1
      return calls > 1
    })
    mockState.bridge = makeBridge({ remotePlay })
    const promise = playLiturgyLocalVideoOnScreens('/v/a.mp4')
    await vi.advanceTimersByTimeAsync(1500)
    await expect(promise).resolves.toBe(true)
    expect(remotePlay).toHaveBeenCalledTimes(2)
  })
})

describe('imagens locais', () => {
  it('lista vazia → false', async () => {
    await expect(openLiturgyLocalImageControl([])).resolves.toBe(false)
    await expect(playLiturgyLocalImageOnScreens(['   ', ''])).resolves.toBe(false)
  })

  it('browser sem bridge → false', async () => {
    await expect(openLiturgyLocalImageControl(['/i/a.png'])).resolves.toBe(false)
  })

  it('electron: abre com paths limpos e título do 1º arquivo', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(
      playLiturgyLocalImageOnScreens(['/i/a.png', ' /i/b.png '], ''),
    ).resolves.toBe(true)
    expect(openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ filePaths: ['/i/a.png', '/i/b.png'], title: 'a.png', mode: 'image', withScreens: true }),
    )
  })
})

describe('PDF local', () => {
  it('path vazio ou browser sem bridge → false', async () => {
    await expect(openLiturgyLocalPdfControl('')).resolves.toBe(false)
    await expect(playLiturgyLocalPdfOnScreens('/x.pdf')).resolves.toBe(false)
  })

  it('electron ok → roteia título no palco', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(openLiturgyLocalPdfControl('/x.pdf', 'Boletim')).resolves.toBe(true)
    expect(openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/x.pdf', title: 'Boletim', mode: 'pdf', withScreens: false }),
    )
    expect(mockState.projectRouted).toEqual([
      ['liturgy', 'liturgy', { text: 'Boletim' }],
    ])
  })

  it('electron openUrl falhou → false sem palco', async () => {
    const openUrl = vi.fn(async () => false)
    mockState.bridge = makeBridge({ openUrl })
    await expect(playLiturgyLocalPdfOnScreens('/x.pdf')).resolves.toBe(false)
    expect(mockState.projectRouted).toHaveLength(0)
  })

  it('título vazio cai no nome do arquivo', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(playLiturgyLocalPdfOnScreens('/docs/boletim.pdf')).resolves.toBe(true)
    expect(openUrl).toHaveBeenCalledWith(expect.objectContaining({ title: 'boletim.pdf' }))
  })
})

describe('apresentação local', () => {
  it('path vazio ou browser sem bridge → false', async () => {
    await expect(openLiturgyLocalPresentationControl('')).resolves.toBe(false)
    await expect(playLiturgyLocalPresentationOnScreens('/x.pptx')).resolves.toBe(false)
  })

  it('sem Office e engine padrão → false cedo', async () => {
    const detectOffice = vi.fn(async () => false)
    const openUrl = vi.fn()
    mockState.bridge = makeBridge({ openUrl, detectOffice })
    await expect(playLiturgyLocalPresentationOnScreens('/x.pptx')).resolves.toBe(false)
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('sem Office mas engine powerpoint → segue', async () => {
    const detectOffice = vi.fn(async () => false)
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl, detectOffice })
    await expect(
      playLiturgyLocalPresentationOnScreens('/x.pptx', 'Slide', 'powerpoint'),
    ).resolves.toBe(true)
    expect(openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'presentation', presentationEngine: 'powerpoint' }),
    )
  })

  it('sem Office e engine custom → segue; roteia palco', async () => {
    const detectOffice = vi.fn(async () => false)
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl, detectOffice })
    await expect(
      openLiturgyLocalPresentationControl('/x.odp', '', 'custom'),
    ).resolves.toBe(true)
    expect(mockState.projectRouted).toHaveLength(1)
  })

  it('detectOffice ausente no bridge → segue sem checar', async () => {
    mockState.bridge = {
      projection: { openUrl: vi.fn(async () => true) as ReturnType<typeof vi.fn> },
    }
    await expect(playLiturgyLocalPresentationOnScreens('/x.pptx')).resolves.toBe(true)
  })

  it('presentation existe mas detectOffice ausente → segue sem checar (mutante L310 remove ?. do método)', async () => {
    mockState.bridge = {
      projection: { openUrl: vi.fn(async () => true) as ReturnType<typeof vi.fn> },
      presentation: {},
    }
    await expect(playLiturgyLocalPresentationOnScreens('/x.pptx')).resolves.toBe(true)
  })

  it('engine sem office definido e office presente → sem presentationEngine no payload', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(openLiturgyLocalPresentationControl('/x.pptx')).resolves.toBe(true)
    const payload = openUrl.mock.calls[0]![0] as Record<string, unknown>
    expect('presentationEngine' in payload).toBe(false)
  })

  it('openUrl falhou → false sem palco', async () => {
    const openUrl = vi.fn(async () => false)
    mockState.bridge = makeBridge({ openUrl })
    await expect(playLiturgyLocalPresentationOnScreens('/x.pptx')).resolves.toBe(false)
    expect(mockState.projectRouted).toHaveLength(0)
  })

  it('images fallback: title vazio + paths terminam em / → label "Imagens"', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(
      playLiturgyLocalImageOnScreens(['/a/', '/b/'], ''),
    ).resolves.toBe(true)
  })

  it('pdf fallback: title vazio + path termina em / → label "PDF"', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(
      playLiturgyLocalPdfOnScreens('/a/', ''),
    ).resolves.toBe(true)
  })

  it('presentation fallback: title vazio + path termina em / → label "Apresentação"', async () => {
    const openUrl = vi.fn(async () => true)
    const detectOffice = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl, detectOffice })
    await expect(
      playLiturgyLocalPresentationOnScreens('/a/', ''),
    ).resolves.toBe(true)
  })

  it('local video control: objectUrl omitted (default undefined)', async () => {
    const openUrl = vi.fn(async () => true)
    mockState.bridge = makeBridge({ openUrl })
    await expect(
      openLiturgyLocalVideoControl('/x.mp4', ''),
    ).resolves.toBe(true)
  })

  it('local video browser path: sem bridge.openUrl, com objectUrl → publica runtime e abre popup', async () => {
    mockState.bridge = { projection: {} } // sem openUrl → browser path
    mockState.openProjectionModuleResult = true
    await expect(
      _openLiturgyLocalVideo('/x.mp4', 'Meu vídeo', false, 'blob:http://localhost/abc'),
    ).resolves.toBe(true)
    expect(mockState.published).toHaveLength(1)
    expect(openProjectionModule).toHaveBeenCalledWith('liturgy-web')
  })

  it('local video browser path: sem objectUrl → false (nada para projetar)', async () => {
    mockState.bridge = { projection: {} }
    await expect(
      _openLiturgyLocalVideo('/x.mp4', '', false, undefined),
    ).resolves.toBe(false)
    expect(mockState.published).toHaveLength(0)
  })

  it('_openLiturgyLocalVideo: title default (omitido) cai em fallback do path', async () => {
    mockState.bridge = { projection: {} }
    await expect(
      // omitindo title e objectUrl → title default '' + browser path sem objectUrl
      (_openLiturgyLocalVideo as (...a: unknown[]) => Promise<boolean>)('/x.mp4'),
    ).resolves.toBe(false)
    expect(mockState.published).toHaveLength(0)
  })
})
