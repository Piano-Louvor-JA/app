import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  openLiturgyWebOnConfiguredScreens,
  openLiturgySiteControl,
  openLiturgyVideoControl,
  openLiturgySiteOnScreens,
  playLiturgyWebOnConfiguredScreens,
  openLiturgyLocalVideoControl,
  playLiturgyLocalVideoOnScreens,
  openLiturgyLocalImageControl,
  playLiturgyLocalImageOnScreens,
  openLiturgyLocalPdfControl,
  playLiturgyLocalPdfOnScreens,
  openLiturgyLocalPresentationControl,
  playLiturgyLocalPresentationOnScreens,
} from '../services/liturgy-web-projection'

const mocks = vi.hoisted(() => ({
  mockGetDesktopBridge: vi.fn(),
  mockParseTarget: vi.fn(),
  mockPublishRuntime: vi.fn(),
  mockOpenProjectionModule: vi.fn(),
  mockCloseProjectionModule: vi.fn(),
  mockResolveTargetMonitors: vi.fn(),
  mockLoadProjectionSettings: vi.fn(),
  mockListSystemDisplays: vi.fn(),
  mockListExtendedDisplays: vi.fn(),
  mockPalcoSession: vi.fn(),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: mocks.mockGetDesktopBridge,
}))

vi.mock('../services/liturgy-web-runtime', () => ({
  parseLiturgyWebTarget: mocks.mockParseTarget,
  publishLiturgyWebRuntime: mocks.mockPublishRuntime,
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  openProjectionModule: mocks.mockOpenProjectionModule,
  closeProjectionModule: mocks.mockCloseProjectionModule,
}))

vi.mock('@modules/settings/services/projection-preferences', () => ({
  loadProjectionSettings: mocks.mockLoadProjectionSettings,
}))

vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: mocks.mockListSystemDisplays,
  listExtendedDisplays: mocks.mockListExtendedDisplays,
}))

vi.mock('../../settings/services/palco-session', () => ({
  palcoSession: {
    videoRouted: mocks.mockPalcoSession,
    projectRouted: mocks.mockPalcoSession,
  },
}))

describe('liturgy-web-projection — mata survivors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetDesktopBridge.mockReturnValue(null)
    mocks.mockParseTarget.mockReturnValue(null)
    mocks.mockPublishRuntime.mockResolvedValue(undefined)
    mocks.mockOpenProjectionModule.mockResolvedValue(true)
    mocks.mockCloseProjectionModule.mockResolvedValue(undefined)
    mocks.mockResolveTargetMonitors.mockResolvedValue([1, 2])
    mocks.mockLoadProjectionSettings.mockReturnValue({ targetDisplayIds: [1] })
    mocks.mockListSystemDisplays.mockResolvedValue([
      { id: 1, label: 'A' }, { id: 2, label: 'B' },
    ])
    mocks.mockListExtendedDisplays.mockReturnValue([
      { id: 1, label: 'A' }, { id: 2, label: 'B' },
    ])
    mocks.mockPalcoSession.mockResolvedValue(undefined)
  })

  const bridgeWith = (opts: {
    openUrl?: ReturnType<typeof vi.fn>
    remotePlay?: ReturnType<typeof vi.fn>
    detectOffice?: ReturnType<typeof vi.fn>
  } = {}) => ({
    projection: {
      openUrl: opts.openUrl ?? vi.fn().mockResolvedValue(true),
      remotePlay: opts.remotePlay ?? vi.fn().mockResolvedValue(true),
    },
    presentation: {
      detectOffice: opts.detectOffice ?? vi.fn().mockResolvedValue(true),
    },
  })

  describe('openLiturgyWebOnConfiguredScreens — bridge?.projection?.openUrl', () => {
    it('target inválido → false', async () => {
      mocks.mockParseTarget.mockReturnValue(null)
      expect(await openLiturgyWebOnConfiguredScreens('url', 'title')).toBe(false)
    })

    it('bridge COM openUrl → chama bridge (path Electron)', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'site', url: 'https://x.com', videoId: undefined })
      expect(await openLiturgyWebOnConfiguredScreens('https://x.com', 'Meu Site')).toBe(true)
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://x.com', title: 'Meu Site', mode: 'site', monitorIds: [1], withScreens: true,
      }))
      expect(mocks.mockCloseProjectionModule).toHaveBeenCalled()
      expect(mocks.mockPublishRuntime).not.toHaveBeenCalled()
    })

    it('bridge SEM openUrl → fallback web runtime (path Web)', async () => {
      mocks.mockGetDesktopBridge.mockReturnValue({ projection: {} })
      mocks.mockParseTarget.mockReturnValue({ kind: 'site', url: 'https://x.com', videoId: undefined })
      expect(await openLiturgyWebOnConfiguredScreens('https://x.com', 'Meu Site')).toBe(true)
      expect(mocks.mockPublishRuntime).toHaveBeenCalledWith(expect.objectContaining({
        active: true, url: 'https://x.com', title: 'Meu Site', kind: 'site',
      }))
      expect(mocks.mockOpenProjectionModule).toHaveBeenCalledWith('liturgy-web')
    })

    it('title vazio → usa rawUrl', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'video', url: 'https://y.com', videoId: 'abc' })
      await openLiturgyWebOnConfiguredScreens('https://y.com', '')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ title: 'https://y.com' }))
    })

    it('withScreens:false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'site', url: 'https://x.com', videoId: undefined })
      await openLiturgyWebOnConfiguredScreens('https://x.com', 't', false)
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: false }))
    })
  })

  describe('wrappers → delegam com withScreens correto', () => {
    it('openLiturgySiteControl → withScreens false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'site', url: 'https://x.com', videoId: undefined })
      await openLiturgySiteControl('https://x.com', 't')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: false }))
    })

    it('openLiturgyVideoControl → withScreens false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'video', url: 'https://y.com', videoId: 'abc' })
      await openLiturgyVideoControl('https://y.com', 't')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: false }))
    })

    it('openLiturgySiteOnScreens → withScreens true', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'site', url: 'https://x.com', videoId: undefined })
      await openLiturgySiteOnScreens('https://x.com', 't')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: true }))
    })
  })

  describe('playLiturgyWebOnConfiguredScreens — remotePlay + sleep', () => {
    it('kind site → delega openLiturgySiteOnScreens', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'site', url: 'https://x.com', videoId: undefined })
      expect(await playLiturgyWebOnConfiguredScreens('https://x.com', 't')).toBe(true)
    })

    it('kind video, opened=false → false', async () => {
      const b = bridgeWith({ openUrl: vi.fn().mockResolvedValue(false) })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'youtube', url: 'https://y.com', videoId: 'abc' })
      expect(await playLiturgyWebOnConfiguredScreens('https://y.com', 't')).toBe(false)
    })

    it('kind video, SEM remotePlay → retorna opened', async () => {
      // Mock openLiturgyWebOnConfiguredScreens to return true (simulate opened)
      // Then test the remotePlay branch directly
      const b = bridgeWith({ openUrl: vi.fn().mockResolvedValue(true), remotePlay: undefined })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'youtube', url: 'https://y.com', videoId: 'abc' })
      expect(await playLiturgyWebOnConfiguredScreens('https://y.com', 't')).toBe(true)
    })

    it('remotePlay true → true (1 call)', async () => {
      // We test the remotePlay branch by ensuring openLiturgyWebOnConfiguredScreens returns true
      // and the bridge has remotePlay
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'youtube', url: 'https://y.com', videoId: 'abc' })
      const res = await playLiturgyWebOnConfiguredScreens('https://y.com', 't')
      expect(res).toBe(true)
      expect(b.projection.remotePlay).toHaveBeenCalledTimes(1)
    })

    it('remotePlay false → retry → true (2 calls)', async () => {
      const rp = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      const b = bridgeWith({ openUrl: vi.fn().mockResolvedValue(true), remotePlay: rp })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      mocks.mockParseTarget.mockReturnValue({ kind: 'youtube', url: 'https://y.com', videoId: 'abc' })
      const res = await playLiturgyWebOnConfiguredScreens('https://y.com', 't')
      expect(res).toBe(true)
      expect(rp).toHaveBeenCalledTimes(2)
    })
  })

  describe('_openLiturgyLocalVideo via wrappers — bridge?.projection?.openUrl + remotePlay', () => {
    it('bridge SEM openUrl + objectUrl → fallback web', async () => {
      mocks.mockGetDesktopBridge.mockReturnValue({ projection: {} })
      expect(await openLiturgyLocalVideoControl('/video.mp4', 'Vídeo', 'blob:url')).toBe(true)
      expect(mocks.mockPublishRuntime).toHaveBeenCalledWith(expect.objectContaining({ kind: 'local-video', url: 'blob:url' }))
    })

    it('bridge SEM openUrl + SEM objectUrl → false', async () => {
      mocks.mockGetDesktopBridge.mockReturnValue({ projection: {} })
      expect(await openLiturgyLocalVideoControl('/video.mp4', 'Vídeo', undefined, undefined)).toBe(false)
    })

    it('path vazio → false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalVideoControl('', 'Vídeo', undefined, 'blob:url')).toBe(false)
    })

    it('bridge COM openUrl → chama bridge + palcoSession', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalVideoControl('/video.mp4', 'Vídeo')).toBe(true)
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({
        filePath: '/video.mp4', title: 'Vídeo', mode: 'video', monitorIds: [1], withScreens: false,
      }))
      expect(mocks.mockPalcoSession).toHaveBeenCalledWith({ url: '/video.mp4', title: 'Vídeo' })
    })

    it('withScreens false + SEM remotePlay → true', async () => {
      const b = bridgeWith({ openUrl: vi.fn().mockResolvedValue(true), remotePlay: undefined })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalVideoControl('/video.mp4', 'Vídeo', false)).toBe(true)
    })

    it('withScreens true + remotePlay true → true', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await playLiturgyLocalVideoOnScreens('/video.mp4', 'Vídeo')).toBe(true)
    })

    it('remotePlay false → retry → true', async () => {
      const rp = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      const b = bridgeWith({ openUrl: vi.fn().mockResolvedValue(true), remotePlay: rp })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await playLiturgyLocalVideoOnScreens('/video.mp4', 'Vídeo')).toBe(true)
      expect(rp).toHaveBeenCalledTimes(2)
    })

    it('label fallback: filename', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      await openLiturgyLocalVideoControl('/path/to/video.mp4', '')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ title: 'video.mp4' }))
    })
  })

  describe('openLiturgyLocalImages via wrappers — filePaths map/trim/filter', () => {
    it('filePaths vazio → false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalImageControl([], 'Galeria')).toBe(false)
    })

    it('filePaths com vazios → filter + trim', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalImageControl([' a.jpg ', '', 'b.jpg'], 'Galeria')).toBe(true)
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ filePaths: ['a.jpg', 'b.jpg'] }))
    })

    it('bridge SEM openUrl → false', async () => {
      mocks.mockGetDesktopBridge.mockReturnValue({ projection: {} })
      expect(await openLiturgyLocalImageControl(['a.jpg'], 'Galeria')).toBe(false)
    })

    it('bridge COM openUrl → chama bridge', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalImageControl(['a.jpg'], 'Galeria')).toBe(true)
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ filePaths: ['a.jpg'], mode: 'image' }))
    })

    it('label fallback: primeiro path filename', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      await playLiturgyLocalImageOnScreens(['/path/to/img.jpg'], '')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ title: 'img.jpg' }))
    })
  })

  describe('openLiturgyLocalPdf via wrappers', () => {
    it('path vazio → false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalPdfControl('', 'PDF')).toBe(false)
    })

    it('bridge SEM openUrl → false', async () => {
      mocks.mockGetDesktopBridge.mockReturnValue({ projection: {} })
      expect(await openLiturgyLocalPdfControl('/doc.pdf', 'PDF')).toBe(false)
    })

    it('bridge COM openUrl → chama bridge + palcoSession', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalPdfControl('/doc.pdf', 'PDF', true)).toBe(true)
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/doc.pdf', mode: 'pdf' }))
      expect(mocks.mockPalcoSession).toHaveBeenCalledWith('liturgy', 'liturgy', { text: 'PDF' })
    })

    it('label fallback: filename', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      await openLiturgyLocalPdfControl('/path/doc.pdf', '')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ title: 'doc.pdf' }))
    })
  })

  describe('openLiturgyLocalPresentation — detectOffice + presentationEngine', () => {
    it('path vazio → false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalPresentationControl('', 'Apres')).toBe(false)
    })

    it('bridge SEM openUrl → false', async () => {
      mocks.mockGetDesktopBridge.mockReturnValue({ projection: {} })
      expect(await openLiturgyLocalPresentationControl('/file.pptx', 'Apres')).toBe(false)
    })

    it('detectOffice false + SEM engine powerpoint/custom → false', async () => {
      const b = bridgeWith({ detectOffice: vi.fn().mockResolvedValue(false) })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalPresentationControl('/file.pptx', 'Apres')).toBe(false)
    })

    it('detectOffice false + engine=powerpoint → prossegue', async () => {
      const b = bridgeWith({ detectOffice: vi.fn().mockResolvedValue(false) })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalPresentationControl('/file.pptx', 'Apres', 'powerpoint')).toBe(true)
    })

    it('detectOffice false + engine=custom → prossegue', async () => {
      const b = bridgeWith({ detectOffice: vi.fn().mockResolvedValue(false) })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalPresentationControl('/file.pptx', 'Apres', 'custom')).toBe(true)
    })

    it('detectOffice true → prossegue', async () => {
      const b = bridgeWith({ detectOffice: vi.fn().mockResolvedValue(true) })
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await openLiturgyLocalPresentationControl('/file.pptx', 'Apres')).toBe(true)
    })

    it('bridge COM openUrl → chama bridge + palcoSession', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      expect(await playLiturgyLocalPresentationOnScreens('/file.pptx', 'Apres')).toBe(true)
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({
        filePath: '/file.pptx', mode: 'presentation', monitorIds: [1], withScreens: true,
      }))
      expect(mocks.mockPalcoSession).toHaveBeenCalledWith('liturgy', 'liturgy', { text: 'Apres' })
    })

    it('presentationEngine passado → spread no openUrl', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      await playLiturgyLocalPresentationOnScreens('/file.pptx', 'Apres', 'custom')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ presentationEngine: 'custom' }))
    })

    it('label fallback: filename', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      await openLiturgyLocalPresentationControl('/path/pres.pptx', '')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ title: 'pres.pptx' }))
    })
  })

  describe('wrappers de presentation', () => {
    it('openLiturgyLocalPresentationControl → withScreens false', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      await openLiturgyLocalPresentationControl('/file.pptx', 't')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: false }))
    })

    it('playLiturgyLocalPresentationOnScreens → withScreens true', async () => {
      const b = bridgeWith()
      mocks.mockGetDesktopBridge.mockReturnValue(b)
      await playLiturgyLocalPresentationOnScreens('/file.pptx', 't')
      expect(b.projection.openUrl).toHaveBeenCalledWith(expect.objectContaining({ withScreens: true }))
    })
  })
})