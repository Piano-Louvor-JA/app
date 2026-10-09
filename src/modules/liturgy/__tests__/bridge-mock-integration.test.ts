import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mock localStorage ANTES de qualquer import que use browser-storage
const mockStorage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => mockStorage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage.set(key, value) }),
    removeItem: vi.fn((key: string) => { mockStorage.delete(key) }),
    clear: vi.fn(() => { mockStorage.clear() }),
  },
  writable: true,
})

// Mock do window.louvorja ANTES de importar os módulos que usam getDesktopBridge
const createMockBridge = (overrides: Partial<{
  externalPlayer: { play: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }
  projection: { openUrl: ReturnType<typeof vi.fn>; closeUrl: ReturnType<typeof vi.fn>; externalAlive: ReturnType<typeof vi.fn> }
  isElectron: boolean
  platform: string
}> = {}) => {
  const externalPlayer = {
    play: vi.fn().mockResolvedValue({ ok: true, player: 'vlc' }),
    get: vi.fn().mockResolvedValue('vlc'),
    pause: vi.fn().mockResolvedValue({ ok: true }),
    detect: vi.fn().mockResolvedValue([]),
    listCustom: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue(true),
    removeCustom: vi.fn().mockResolvedValue({ player: 'vlc', customPlayers: [] }),
    ...overrides.externalPlayer,
  }

  const projection = {
    openUrl: vi.fn().mockResolvedValue(true),
    closeUrl: vi.fn().mockResolvedValue(true),
    externalAlive: vi.fn().mockResolvedValue(false),
    getSourceMediaId: vi.fn().mockResolvedValue(null),
    publishPlaybackSync: vi.fn(),
    onPlaybackSync: vi.fn(() => vi.fn()),
    onCloseRequested: vi.fn(() => vi.fn()),
    onMediaNavigate: vi.fn(() => vi.fn()),
    remotePlay: vi.fn().mockResolvedValue(true),
    remotePause: vi.fn().mockResolvedValue(true),
    remoteSeek: vi.fn().mockResolvedValue(true),
    remoteToggleMute: vi.fn().mockResolvedValue({ muted: false, volume: 1 }),
    remoteSetVolume: vi.fn().mockResolvedValue({ muted: false, volume: 1 }),
    getPlaybackState: vi.fn().mockResolvedValue(null),
    getNavigationState: vi.fn().mockResolvedValue(null),
    remoteGoBack: vi.fn().mockResolvedValue(true),
    remoteGoForward: vi.fn().mockResolvedValue(true),
    remoteReload: vi.fn().mockResolvedValue(true),
    toggleSiteScreens: vi.fn().mockResolvedValue(true),
    toggleVideoScreens: vi.fn().mockResolvedValue(true),
    remoteImageNext: vi.fn().mockResolvedValue(null),
    remoteImagePrev: vi.fn().mockResolvedValue(null),
    getImageSlideState: vi.fn().mockResolvedValue(null),
    remotePdfNext: vi.fn().mockResolvedValue(null),
    remotePdfPrev: vi.fn().mockResolvedValue(null),
    getPdfPageState: vi.fn().mockResolvedValue(null),
    remotePptNext: vi.fn().mockResolvedValue(null),
    remotePptPrev: vi.fn().mockResolvedValue(null),
    getPptSlideState: vi.fn().mockResolvedValue(null),
    getSiteTargetMonitors: vi.fn().mockResolvedValue([]),
    setSiteTargetMonitors: vi.fn().mockResolvedValue(true),
    getVideoTargetMonitors: vi.fn().mockResolvedValue([]),
    setVideoTargetMonitors: vi.fn().mockResolvedValue(true),
    setSiteControlPanelOpen: vi.fn().mockResolvedValue(true),
    onSiteTargetsChanged: vi.fn(() => vi.fn()),
    onVideoTargetsChanged: vi.fn(() => vi.fn()),
    ...overrides.projection,
  }

  return {
    platform: overrides.platform ?? 'linux',
    isElectron: overrides.isElectron ?? true,
    externalPlayer,
    projection,
    workspace: {
      readBinaryFile: vi.fn().mockResolvedValue(null),
      getRecord: vi.fn().mockResolvedValue(null),
      saveRecord: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(true),
    },
    catalog: {
      downloadDatabase: vi.fn().mockResolvedValue(true),
      extractDatabase: vi.fn().mockResolvedValue(true),
      onDownloadProgress: vi.fn(() => vi.fn()),
      onExtractProgress: vi.fn(() => vi.fn()),
    },
    media: {
      download: vi.fn().mockResolvedValue(true),
      check: vi.fn().mockResolvedValue(false),
      delete: vi.fn().mockResolvedValue(true),
      probeDuration: vi.fn().mockResolvedValue(0),
    },
    displays: { list: vi.fn().mockResolvedValue([]), identify: vi.fn().mockResolvedValue(true), onChanged: vi.fn(() => vi.fn()) },
    dialog: { openFile: vi.fn().mockResolvedValue(null) },
    remote: {
      onCommand: vi.fn(() => vi.fn()),
      onStateRequest: vi.fn(() => vi.fn()),
      sendAck: vi.fn(),
      sendState: vi.fn(),
      pairingInfo: vi.fn().mockResolvedValue({ host: '', port: 0, token: '', connectUrl: '', qrDataUrl: '', clientCount: 0 }),
      onClients: vi.fn(() => vi.fn()),
    },
    window: { control: vi.fn().mockResolvedValue(true), onMaximizedState: vi.fn(() => vi.fn()) },
    zoom: { getFactor: vi.fn(() => 1), setFactor: vi.fn(() => 1), zoomIn: vi.fn(() => 1), zoomOut: vi.fn(() => 1), onChanged: vi.fn(() => vi.fn()) },
    random: { ensureDefaultAudio: vi.fn().mockResolvedValue({ ok: true }), importAudio: vi.fn().mockResolvedValue({ ok: true }), deleteAudio: vi.fn().mockResolvedValue({ ok: true }) },
  }
}

describe('bridge mock integration — mata mutantes OptionalChaining/MethodExpression do bridge', () => {
  let originalWindow: Window & typeof globalThis
  let mockBridge: ReturnType<typeof createMockBridge>

  beforeEach(() => {
    originalWindow = global.window
    mockStorage.clear()
    vi.clearAllMocks()
    // @ts-expect-error - vitest permite sobrescrever globalThis.window
    global.window = {
      ...originalWindow,
      louvorja: undefined,
      navigator: { userAgent: 'Electron', userAgentData: undefined },
      localStorage: globalThis.localStorage,
    } as Window & typeof globalThis
  })

  afterEach(() => {
    global.window = originalWindow
  })

  // Helper: injeta bridge mockado no window ANTES de importar
  async function withMockBridge<T>(fn: () => Promise<T>): Promise<T> {
    mockBridge = createMockBridge()
    // @ts-expect-error
    global.window.louvorja = mockBridge
    return fn()
  }

  describe('liturgy-actions — executeLiturgyItem type audio/video via externalPlayer', () => {
    it('executeLiturgyItem type audio com filePath chama bridge.externalPlayer.play', async () => {
      await withMockBridge(async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const item = { type: 'audio', filePath: '/tmp/music.mp3', name: 'Hino 1', musicMode: 'audio' }
        const result = await executeLiturgyItem(item as any)
        expect(result.ok).toBe(true)
        expect(mockBridge.externalPlayer.play).toHaveBeenCalledWith(
          '/tmp/music.mp3',
          expect.any(String),
        )
      })
    })

    it('executeLiturgyItem type audio sem filePath nem objectUrl retorna erro', async () => {
      await withMockBridge(async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const item = { type: 'audio', name: 'Hino 2' }
        const result = await executeLiturgyItem(item as any)
        expect(result.ok).toBe(false)
        expect(result.messageKey).toBe('liturgy.messages.videoSelectFile')
      })
    })

    it('executeLiturgyItem type video cai no openLiturgyLocalVideoControl', async () => {
      await withMockBridge(async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const item = { type: 'video', filePath: '/tmp/video.mp4', name: 'Vídeo' }
        const result = await executeLiturgyItem(item as any)
        expect(result.ok).toBe(true)
      })
    })

    it('executeLiturgyItem type audio sem bridge retorna erro', async () => {
      // @ts-expect-error
      global.window.louvorja = null
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const item = { type: 'audio', filePath: '/tmp/x.mp3' }
      const result = await executeLiturgyItem(item as any)
      expect(result.ok).toBe(false)
      expect(result.error || result.messageKey).toBeDefined()
    })
  })

  describe('liturgy-web-projection — funções internas que usam bridge.projection', () => {
    it('_openLiturgyLocalVideo chama bridge.projection.openUrl', async () => {
      await withMockBridge(async () => {
        const { _openLiturgyLocalVideo } = await import('../services/liturgy-web-projection')
        await _openLiturgyLocalVideo('/tmp/video.mp4', 'Vídeo', undefined)
        expect(mockBridge.projection.openUrl).toHaveBeenCalledWith(
          expect.objectContaining({ filePath: '/tmp/video.mp4', mode: 'video' }),
        )
      })
    })

    it('openLiturgyLocalVideoControl chama bridge.projection.openUrl', async () => {
      await withMockBridge(async () => {
        const { openLiturgyLocalVideoControl } = await import('../services/liturgy-web-projection')
        await openLiturgyLocalVideoControl('/tmp/video.mp4', 'Vídeo', undefined)
        expect(mockBridge.projection.openUrl).toHaveBeenCalled()
      })
    })

    it('playLiturgyLocalVideoOnScreens chama bridge.projection.openUrl', async () => {
      await withMockBridge(async () => {
        const { playLiturgyLocalVideoOnScreens } = await import('../services/liturgy-web-projection')
        await playLiturgyLocalVideoOnScreens('/tmp/video.mp4', 'Vídeo')
        expect(mockBridge.projection.openUrl).toHaveBeenCalled()
      })
    })

    it('openLiturgyLocalImageControl chama bridge.projection.openUrl', async () => {
      await withMockBridge(async () => {
        const { openLiturgyLocalImageControl } = await import('../services/liturgy-web-projection')
        await openLiturgyLocalImageControl(['/tmp/img.jpg'], 'Imagem')
        expect(mockBridge.projection.openUrl).toHaveBeenCalledWith(
          expect.objectContaining({ mode: 'image' }),
        )
      })
    })

    it('openLiturgyLocalPdfControl chama bridge.projection.openUrl', async () => {
      await withMockBridge(async () => {
        const { openLiturgyLocalPdfControl } = await import('../services/liturgy-web-projection')
        await openLiturgyLocalPdfControl('/tmp/doc.pdf', 'PDF')
        expect(mockBridge.projection.openUrl).toHaveBeenCalledWith(
          expect.objectContaining({ mode: 'pdf' }),
        )
      })
    })

    it('openLiturgyLocalPresentationControl chama bridge.projection.openUrl', async () => {
      await withMockBridge(async () => {
        const { openLiturgyLocalPresentationControl } = await import('../services/liturgy-web-projection')
        await openLiturgyLocalPresentationControl('/tmp/deck.pptx', 'Apresentação')
        expect(mockBridge.projection.openUrl).toHaveBeenCalledWith(
          expect.objectContaining({ mode: 'presentation' }),
        )
      })
    })

    it('sem bridge projection.openUrl retorna false', async () => {
      // @ts-expect-error
      global.window.louvorja = { ...createMockBridge(), projection: undefined }
      const { _openLiturgyLocalVideo } = await import('../services/liturgy-web-projection')
      const result = await _openLiturgyLocalVideo('/tmp/x.mp4', 'X', undefined)
      expect(result).toBe(false)
    })
  })

  describe('desktop-bridge helpers — isElectronShell/isDesktopApp/isWindowsDesktop', () => {
    it('isElectronShell true quando bridge.isElectron=true', async () => {
      await withMockBridge(async () => {
        const { isElectronShell } = await import('../../../shared/services/desktop-bridge')
        expect(isElectronShell()).toBe(true)
      })
    })

    it('isDesktopApp true quando bridge.isElectron=true', async () => {
      await withMockBridge(async () => {
        const { isDesktopApp } = await import('../../../shared/services/desktop-bridge')
        expect(isDesktopApp()).toBe(true)
      })
    })

    it('isWindowsDesktop true quando bridge.platform=win32', async () => {
      await withMockBridge(async () => {
        // @ts-expect-error
        global.window.louvorja = createMockBridge({ platform: 'win32' })
        const { isWindowsDesktop } = await import('../../../shared/services/desktop-bridge')
        expect(isWindowsDesktop()).toBe(true)
      })
    })

    it('isWindowsDesktop false em linux', async () => {
      await withMockBridge(async () => {
        const { isWindowsDesktop } = await import('../../../shared/services/desktop-bridge')
        expect(isWindowsDesktop()).toBe(false)
      })
    })
  })
})