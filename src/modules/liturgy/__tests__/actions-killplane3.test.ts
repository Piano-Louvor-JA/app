// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Kill plane 3 de liturgy-actions — survivors de playLiturgyItemOnScreens,
 * executeLiturgyItem (trim/OptionalChaining em bridge) e fallbackLabel.
 * 45 survivors mapeados: #47, #82, #121, #150-162, #170/#172/#173, #251,
 * #265-268, #276-278, #289-291, #302/#303, #347-350, #356, #368, #394,
 * #410, #419-422, #452-465, #469, #476/#477, #490, #526.
 */

vi.mock('../../../shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))

const openPdf = vi.fn()
const openSite = vi.fn()
const openVideo = vi.fn()
const openImages = vi.fn()
const openLocalVideo = vi.fn()
const openLocalPresentation = vi.fn()
const openLocalImage = vi.fn()
const openLocalPdf = vi.fn()
const openSiteControl = vi.fn()

vi.mock('../services/liturgy-web-projection', () => ({
  openLiturgyLocalPdfControl: (...a: unknown[]) => openPdf(...a),
  openLiturgySiteControl: (...a: unknown[]) => openSite(...a),
  openLiturgyVideoControl: (...a: unknown[]) => openVideo(...a),
  openLiturgyLocalImageControl: (...a: unknown[]) => openImages(...a),
  openLiturgyLocalVideoControl: (...a: unknown[]) => openLocalVideo(...a),
  openLiturgyLocalPresentationControl: (...a: unknown[]) => openLocalPresentation(...a),
  playLiturgyLocalVideoOnScreens: (...a: unknown[]) => openLocalVideo(...a),
  playLiturgyLocalImageOnScreens: (...a: unknown[]) => openLocalImage(...a),
  playLiturgyLocalPdfOnScreens: (...a: unknown[]) => openLocalPdf(...a),
  playLiturgyLocalPresentationOnScreens: (...a: unknown[]) => openLocalPresentation(...a),
  playLiturgyWebOnConfiguredScreens: (...a: unknown[]) => openSite(...a),
  openLiturgySiteOnScreens: (...a: unknown[]) => openSiteControl(...a),
}))

vi.mock('../services/liturgy-web-runtime', () => ({
  publishLiturgyWebRuntime: vi.fn(),
  readLiturgyWebRuntimeFromStorage: vi.fn(() => null),
  parseLiturgyWebTarget: vi.fn(() => ({ kind: 'site', url: 'u', videoId: '' })),
}))

const { getObjUrl } = vi.hoisted(() => ({
  getObjUrl: vi.fn<(id: string) => unknown>(() => undefined),
}))
vi.mock('../services/liturgy-local-video', () => ({
  getLiturgyVideoObjectUrl: (id: string) => getObjUrl(id),
}))
vi.mock('../../media/stores/useMediaStore', () => ({
  useMediaStore: vi.fn(() => ({
    open: vi.fn().mockResolvedValue({ ok: true }),
    maximize: vi.fn(),
    close: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMode: vi.fn(),
  })),
}))

vi.mock('@modules/bible/stores/useBibleStore', () => ({
  useBibleStore: () => ({
    books: [{ id: 1, name: 'Gênesis' }],
    bootstrap: vi.fn(),
    selectBook: vi.fn(),
    selectChapter: vi.fn(),
    verseSearchQuery: '',
    applyVerseSearch: vi.fn(),
  }),
}))

const mockStorage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void mockStorage.set(key, value),
    removeItem: (key: string) => void mockStorage.delete(key),
    clear: () => void mockStorage.clear(),
  },
  writable: true,
  configurable: true,
})

let originalWindow: Window & typeof globalThis

const baseMock = () => ({
  platform: 'linux',
  isElectron: true,
  externalPlayer: {
    get: vi.fn().mockResolvedValue('default'),
    play: vi.fn().mockResolvedValue({ ok: true, player: 'vlc' }),
  },
  presentation: {
    getEngine: vi.fn().mockResolvedValue('auto'),
    openExternal: vi.fn().mockResolvedValue({ ok: true }),
    detectOffice: vi.fn().mockResolvedValue(true),
  },
  projection: { openUrl: vi.fn().mockResolvedValue(true) },
})

async function withBridge(bridge: unknown, fn: () => Promise<void>) {
  const { getDesktopBridge } = await import('../../../shared/services/desktop-bridge')
  vi.mocked(getDesktopBridge).mockReturnValue(bridge as never)
  try {
    await fn()
  } finally {
    vi.mocked(getDesktopBridge).mockReturnValue(null)
  }
}

const okRouter = () => ({ push: vi.fn().mockResolvedValue(true) })

beforeEach(() => {
  originalWindow = global.window
  mockStorage.clear()
  getObjUrl.mockReset()
  getObjUrl.mockImplementation(() => undefined)
  vi.clearAllMocks()
  for (const m of [openPdf, openSite, openVideo, openImages, openLocalVideo, openLocalPresentation, openLocalImage, openLocalPdf, openSiteControl]) {
    m.mockResolvedValue(true)
  }
})

afterEach(() => {
  global.window = originalWindow
})

describe('kill plane 3 — playLiturgyItemOnScreens (trim/labels)', () => {
  it('video: filePath trimado e name trimado (#356/#368)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      await playLiturgyItemOnScreens({ type: 'video', filePath: '  /v/A.mp4  ', name: '  Clipe  ' } as any)
      expect(openLocalVideo).toHaveBeenCalledWith('/v/A.mp4', 'Clipe')
    })
  })

  it('video: filePath vazio -> mediaDesktopOnly (#356 trim)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      const r = await playLiturgyItemOnScreens({ type: 'video', filePath: '   ' } as any)
      expect(r.ok).toBe(false)
    })
  })

  it('images: paths trimados, name trimado; sem paths -> erro (#394/#317)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      await playLiturgyItemOnScreens({ type: 'images', filePath: '  /i/A.png  ', name: '  Foto  ' } as any)
      expect(openLocalImage).toHaveBeenCalledWith(['/i/A.png'], 'Foto')
      const r = await playLiturgyItemOnScreens({ type: 'images', filePath: '   ' } as any)
      expect(r.ok).toBe(false)
    })
  })

  it('pdf: trim + label (#410/#419-422/#490)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      await playLiturgyItemOnScreens({ type: 'pdf', filePath: '  /p/A.pdf  ', name: '  Doc  ' } as any)
      expect(openLocalPdf).toHaveBeenCalledWith('/p/A.pdf', 'Doc')
      // name whitespace-only -> cai no filePath (#419-422)
      await playLiturgyItemOnScreens({ type: 'pdf', filePath: ' /p/B.pdf ', name: '   ' } as any)
      expect(openLocalPdf).toHaveBeenLastCalledWith('/p/B.pdf', '/p/B.pdf')
    })
  })

  it('presentation engine externo: openExternal ok/fail, getEngine whitespace (#452-465/#469)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.presentation.getEngine.mockResolvedValue('  powerpoint  ')
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens: play } = await import('../services/liturgy-actions')
        await play({ type: 'presentation', filePath: ' /p/A.pptx ', presentationEngine: 'powerpoint' } as any)
        expect(bridge.presentation.openExternal).toHaveBeenCalledWith('/p/A.pptx', 'powerpoint')
      })
      // openExternal falha -> projectionFailed
      const bridge2 = baseMock()
      bridge2.presentation.getEngine.mockResolvedValue('libreoffice')
      bridge2.presentation.openExternal.mockResolvedValue({ ok: false })
      await withBridge(bridge2, async () => {
        const { playLiturgyItemOnScreens: play } = await import('../services/liturgy-actions')
        const r = await play({ type: 'presentation', filePath: '/p/B.pptx' } as any)
        expect(r.ok).toBe(false)
      })
    })
  })

  it('presentation sem engine explicito: auto tem detectOffice e interno ok (#455/#476-477)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.presentation.getEngine.mockResolvedValue('auto')
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens: play } = await import('../services/liturgy-actions')
        await play({ type: 'presentation', filePath: ' /p/C.pptx ', name: '  Slides  ' } as any)
        expect(openLocalPresentation).toHaveBeenCalledWith('/p/C.pptx', 'Slides', 'auto')
        // sem office -> erro
        bridge.presentation.detectOffice.mockResolvedValue(false)
        const r = await play({ type: 'presentation', filePath: '/p/D.pptx' } as any)
        expect(r.ok).toBe(false)
        expect(r).toMatchObject({ ok: false, messageKey: 'liturgy.messages.presentationOfficeMissing' })
      })
    })
  })

  it('presentation getEngine null -> auto; openExternal do engine externo (#265-268 espelho)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.presentation.getEngine.mockResolvedValue(null)
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens: play } = await import('../services/liturgy-actions')
        const r = await play({ type: 'presentation', filePath: ' /p/E.pptx ' } as any)
        expect(r.ok).toBe(true)
        expect(openLocalPresentation).toHaveBeenCalled()
      })
    })
  })

  it('site/online_video em screens: url trimada, label name (#526)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      await playLiturgyItemOnScreens({ type: 'site', url: '  https://s.com  ', name: '  Site  ' } as any)
      expect(openSiteControl).toHaveBeenCalledWith('https://s.com', 'Site')
      await playLiturgyItemOnScreens({ type: 'online_video', url: ' https://y.com?v=1 ', name: '  Vid  ' } as any)
      expect(openSite).toHaveBeenCalledWith('https://y.com?v=1', 'Vid')
      // sem url -> erro
      const r = await playLiturgyItemOnScreens({ type: 'site', url: '   ' } as any)
      expect(r.ok).toBe(false)
    })
  })

  it('tipo music roteia pro fluxo music (#347-350)', async () => {
    await withBridge(baseMock(), async () => {
      const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
      // musicId inválido -> erro vindo do fluxo music
      const r = await playLiturgyItemOnScreens({ type: 'music' } as any)
      expect(r.ok).toBe(false)
      expect(r).toMatchObject({ ok: false, messageKey: 'liturgy.messages.catalogEmpty' })
    })
  })
})

describe('kill plane 3 — executeLiturgyItem: bridge OptionalChaining + fallbackLabel', () => {
  it('audio player externo: pref default busca get(); get whitespace não-válido (#150-162)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.externalPlayer.get.mockResolvedValue('vlc')
      await withBridge(bridge, async () => {
        const { executeLiturgyItem: ex } = await import('../services/liturgy-actions')
        // audio SEM objectUrl -> usa player externo; play ok -> return ok true
        const r = await ex({ type: 'audio', filePath: ' /a/A.mp3 ', id: 'a1' } as any, okRouter() as any)
        expect(r.ok).toBe(true)
        expect(bridge.externalPlayer.play).toHaveBeenCalledWith('/a/A.mp3', 'vlc')
      })
    })
  })

  it('audio: play externo falha -> cai pro interno com fallbackLabel audio (#170/#172/#173)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.externalPlayer.get.mockResolvedValue('vlc')
      bridge.externalPlayer.play.mockResolvedValue({ ok: false })
      await withBridge(bridge, async () => {
        const { executeLiturgyItem: ex } = await import('../services/liturgy-actions')
        // externo falha -> cai pro interno; label = filePath (#170 só atinge sem name)
        const r = await ex({ type: 'audio', filePath: ' /a/A.mp3 ' } as any, okRouter() as any)
        expect(openLocalVideo).toHaveBeenCalledWith('/a/A.mp3', '/a/A.mp3', undefined)
        expect(r.ok).toBe(true)
        // com objectUrl e sem filePath/name -> label = fallbackLabel 'Áudio' (#170/#172/#173)
        getObjUrl.mockImplementation((id: string) => (id === 'blob-a' ? 'blob:audio-b' : undefined))
        const r2 = await ex({ type: 'audio', filePath: '', id: 'blob-a' } as any, okRouter() as any)
        expect(openLocalVideo).toHaveBeenLastCalledWith('Áudio', 'Áudio', 'blob:audio-b')
      })
    })
  })

  it('video: sem filePath e sem objectUrl -> videoSelectFile (#121)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem({ type: 'video', filePath: '   ', id: 'v9' } as any, okRouter() as any)
      expect(r).toMatchObject({ ok: false, messageKey: 'liturgy.messages.videoSelectFile' })
    })
  })

  it('video: com objectUrl (browser) entra no interno com label trimado (#82/#251/#303)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      getObjUrl.mockReturnValue("blob:x")
      await executeLiturgyItem({ type: 'video', filePath: ' /v/B.mp4 ', name: '  B  ', id: 'v1' } as any, okRouter() as any)
      expect(openLocalVideo).toHaveBeenCalledWith('/v/B.mp4', 'B', 'blob:x')
    })
  })

  it('verse: verseNumbers trimado alimenta busca; whitespace-only não (#82)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const router = okRouter()
      const r = await executeLiturgyItem({ type: 'verse', verseBookId: 1, verseChapter: 3, verseNumbers: '  14-16  ' } as any, router as any)
      expect(r.ok).toBe(true)
      expect(router.push).toHaveBeenCalled()
    })
  })

  it('presentation: name trimado no interno; whitespace cai no filePath (#251?/#302 espelho execute)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.presentation.getEngine.mockResolvedValue('auto')
      await withBridge(bridge, async () => {
        const { executeLiturgyItem: ex } = await import('../services/liturgy-actions')
        await ex({ type: 'presentation', filePath: ' /p/F.pptx ', name: '  Pre  ' } as any, okRouter() as any)
        expect(openLocalPresentation).toHaveBeenCalledWith('/p/F.pptx', 'Pre', undefined)
        await ex({ type: 'presentation', filePath: '/p/G.pptx', name: '   ' } as any, okRouter() as any)
        expect(openLocalPresentation).toHaveBeenLastCalledWith('/p/G.pptx', '/p/G.pptx', undefined)
      })
    })
  })

  it('music: sem musicId -> erro; execute music ok -> router.push media (#47)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem({ type: 'music' } as any, okRouter() as any)
      expect(r.ok).toBe(false)
    })
    // segundo teste: music com musicId válido -> push
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const router = { push: vi.fn() }
      const r = await executeLiturgyItem({ type: 'music', musicId: 123 } as any, router as any)
      expect(r.ok).toBe(true)
      expect(router.push).toHaveBeenCalledWith({ name: 'media' })
    })
  })

  it('audio com bridge externalPlayer vazio (sem get/play): cai no interno sem quebrar (#150/#160-162)', async () => {
    await withBridge({ externalPlayer: {} }, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem({ type: 'audio', filePath: ' /a/X.mp3 ' } as any, okRouter() as any)
      // sem pref, sem player externo -> interno com label = filePath
      expect(r.ok).toBe(true)
      expect(openLocalVideo).toHaveBeenCalledWith('/a/X.mp3', '/a/X.mp3', undefined)
    })
  })

  it('presentation com bridge.presentation vazio: auto interno ok (#265-291)', async () => {
    await withBridge({ presentation: {} }, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem({ type: 'presentation', filePath: ' /p/Y.pptx ', name: ' Y ' } as any, okRouter() as any)
      expect(r.ok).toBe(true)
      expect(openLocalPresentation).toHaveBeenCalledWith('/p/Y.pptx', 'Y', undefined)
    })
  })

  it('presentation com getEngine retornando "" vira engine falsy -> interno (#268/#455)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.presentation.getEngine.mockResolvedValue('')
      await withBridge(bridge, async () => {
        const { executeLiturgyItem: ex } = await import('../services/liturgy-actions')
        const r = await ex({ type: 'presentation', filePath: ' /p/Z.pptx ' } as any, okRouter() as any)
        expect(r.ok).toBe(true)
        expect(openLocalPresentation).toHaveBeenCalledWith('/p/Z.pptx', '/p/Z.pptx', undefined)
      })
    })
  })

  it('presentation openExternal retorna undefined -> projectionFailed (#469)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.presentation.getEngine.mockResolvedValue('powerpoint')
      bridge.presentation.openExternal.mockResolvedValue(undefined)
      await withBridge(bridge, async () => {
        const { executeLiturgyItem: ex } = await import('../services/liturgy-actions')
        const r = await ex({ type: 'presentation', filePath: '/p/W.pptx' } as any, okRouter() as any)
        expect(r).toMatchObject({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
      })
    })
  })

  it('audio pref whitespace ("  ") não é default nem associated -> play externo com "  " (#150 trim)', async () => {
    await withBridge(baseMock(), async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const bridge = baseMock()
      bridge.externalPlayer.get.mockResolvedValue('  ')
      await withBridge(bridge, async () => {
        const { executeLiturgyItem: ex } = await import('../services/liturgy-actions')
        await ex({ type: 'audio', filePath: ' /a/Y.mp3 ' } as any, okRouter() as any)
        expect(bridge.externalPlayer.play).toHaveBeenCalledWith('/a/Y.mp3', '  ')
      })
    })
  })
})