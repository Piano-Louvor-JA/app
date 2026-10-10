// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Kill plane 4 de liturgy-actions — survivors finais:
 * #47 (default 'audio'), #82 (trim verseNumbers), #160-162 (player externo
 * com play ausente), #266/267/290/291 (getEngine/detectOffice sem optional),
 * #276-278 (openExternal ausente), #452-453/463-465/469/476-477 (fluxo play).
 * #268/#455 ('auto'->'') são equivalentes: engine só é usado em
 * `if (engine && engine !== 'auto')`, onde 'auto' e '' são ambos falsy.
 */

vi.mock('../../../shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))

const openMusicPlayer = vi.fn()
vi.mock('@modules/media/services/open-music-player', () => ({
  openMusicPlayer: (...a: unknown[]) => openMusicPlayer(...a),
}))

const openLocalVideo = vi.fn()
const openLocalPresentation = vi.fn()
const openSiteOnScreens = vi.fn()
const playWeb = vi.fn()
vi.mock('../services/liturgy-web-projection', () => ({
  openLiturgyLocalImageControl: vi.fn().mockResolvedValue(true),
  openLiturgyLocalPdfControl: vi.fn().mockResolvedValue(true),
  openLiturgyLocalPresentationControl: (...a: unknown[]) =>
    openLocalPresentation(...a),
  openLiturgyLocalVideoControl: (...a: unknown[]) => openLocalVideo(...a),
  openLiturgySiteControl: vi.fn().mockResolvedValue(true),
  openLiturgySiteOnScreens: (...a: unknown[]) => openSiteOnScreens(...a),
  openLiturgyVideoControl: vi.fn().mockResolvedValue(true),
  playLiturgyLocalImageOnScreens: vi.fn().mockResolvedValue(true),
  playLiturgyLocalPdfOnScreens: vi.fn().mockResolvedValue(true),
  playLiturgyLocalPresentationOnScreens: (...a: unknown[]) =>
    openLocalPresentation(...a),
  playLiturgyLocalVideoOnScreens: (...a: unknown[]) => openLocalVideo(...a),
  playLiturgyWebOnConfiguredScreens: (...a: unknown[]) => playWeb(...a),
}))

vi.mock('../services/liturgy-local-video', () => ({
  getLiturgyVideoObjectUrl: vi.fn(() => undefined),
}))

vi.mock('../../media/stores/useMediaStore', () => ({
  useMediaStore: vi.fn(() => ({ open: vi.fn() })),
}))

vi.mock('@modules/bible/stores/useBibleStore', () => {
  const store = {
    books: [{ id: 1, name: 'Gênesis' }],
    bootstrap: vi.fn(),
    selectBook: vi.fn(),
    selectChapter: vi.fn(),
    verseSearchQuery: '',
    applyVerseSearch: vi.fn(),
  }
  return { useBibleStore: () => store, __store: store }
})

beforeEach(() => {
  vi.clearAllMocks()
  openLocalVideo.mockResolvedValue(true)
  openLocalPresentation.mockResolvedValue(true)
  openSiteOnScreens.mockResolvedValue(true)
  playWeb.mockResolvedValue(true)
})

async function withBridge(bridge: unknown, fn: () => Promise<void>) {
  const { getDesktopBridge } = await import(
    '../../../shared/services/desktop-bridge'
  )
  vi.mocked(getDesktopBridge).mockReturnValue(bridge as never)
  try {
    await fn()
  } finally {
    vi.mocked(getDesktopBridge).mockReturnValue(null)
  }
}

describe('kill plane 4 — defaults e trims', () => {
  it('#47 openLiturgyMusicOnScreens: musicMode ausente -> mode audio; musicMode -> repassado', { timeout: 30_000 }, async () => {
    openMusicPlayer.mockResolvedValue({ ok: true })
    const { openLiturgyMusicOnScreens } = await import(
      '../services/liturgy-actions'
    )
    await openLiturgyMusicOnScreens({ type: 'music', musicId: 7 } as any)
    expect(openMusicPlayer).toHaveBeenLastCalledWith({
      musicId: 7,
      mode: 'audio',
      project: true,
    })
    await openLiturgyMusicOnScreens({
      type: 'music',
      musicId: 7,
      musicMode: 'video',
    } as any)
    expect(openMusicPlayer).toHaveBeenLastCalledWith({
      musicId: 7,
      mode: 'video',
      project: true,
    })
  })

  it('#82 verse: verseNumbers trimado alimenta verseSearchQuery', async () => {
    const { executeLiturgyItem } = await import('../services/liturgy-actions')
    const bibleMod = await vi.importMock<any>(
      '@modules/bible/stores/useBibleStore',
    )
    const store = bibleMod.__store
    const router = { push: vi.fn().mockResolvedValue(true) }
    const r = await executeLiturgyItem(
      {
        type: 'verse',
        verseBookId: 1,
        verseChapter: 3,
        verseNumbers: '  14-16  ',
      } as any,
      router as any,
    )
    expect(r.ok).toBe(true)
    expect(store.verseSearchQuery).toBe('14-16')
    expect(store.applyVerseSearch).toHaveBeenCalled()
    expect(router.push).toHaveBeenCalled()
  })
})

describe('kill plane 4 — player externo ausente (execute audio)', () => {
  it('#160-162 playerId válido + bridge sem play -> interno sem quebrar', async () => {
    await withBridge({ externalPlayer: {} }, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem(
        { type: 'audio', filePath: ' /a/A.mp3 ', playerId: 'vlc' } as any,
        { push: vi.fn() } as any,
      )
      expect(r.ok).toBe(true)
      expect(openLocalVideo).toHaveBeenCalledWith('/a/A.mp3', '/a/A.mp3', undefined)
    })
  })

  it('#162 bridge null + playerId válido -> interno sem quebrar', async () => {
    const { executeLiturgyItem } = await import('../services/liturgy-actions')
    const r = await executeLiturgyItem(
      { type: 'audio', filePath: '/a/B.mp3', playerId: 'mpv' } as any,
      { push: vi.fn() } as any,
    )
    expect(r.ok).toBe(true)
    expect(openLocalVideo).toHaveBeenCalledWith('/a/B.mp3', '/a/B.mp3', undefined)
  })
})

describe('kill plane 4 — execute presentation com bridge parcial', () => {
  it('#266/267/290/291 {presentation:{}} sem engine: interno ok (getEngine/detectOffice ausentes)', async () => {
    await withBridge({ presentation: {} }, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem(
        { type: 'presentation', filePath: ' /p/A.pptx ' } as any,
        { push: vi.fn() } as any,
      )
      expect(r.ok).toBe(true)
      expect(openLocalPresentation).toHaveBeenCalledWith(
        '/p/A.pptx',
        '/p/A.pptx',
        undefined,
      )
    })
  })

  it('#276-278 engine explícito no item + openExternal ausente -> projectionFailed', async () => {
    await withBridge({ presentation: {} }, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem(
        {
          type: 'presentation',
          filePath: '/p/B.pptx',
          presentationEngine: 'powerpoint',
        } as any,
        { push: vi.fn() } as any,
      )
      expect(r).toMatchObject({
        ok: false,
        messageKey: 'liturgy.messages.projectionFailed',
      })
    })
  })
})

describe('kill plane 4 — playLiturgyItemOnScreens presentation', () => {
  it('#452/453/476/477 {presentation:{}} sem engine: interno ok', async () => {
    await withBridge({ presentation: {} }, async () => {
      const { playLiturgyItemOnScreens } = await import(
        '../services/liturgy-actions'
      )
      const r = await playLiturgyItemOnScreens({
        type: 'presentation',
        filePath: ' /p/C.pptx ',
      } as any)
      expect(r.ok).toBe(true)
      expect(openLocalPresentation).toHaveBeenCalledWith(
        '/p/C.pptx',
        '/p/C.pptx',
        'auto',
      )
    })
  })

  it('#463-465 engine explícito + openExternal ausente -> projectionFailed', async () => {
    await withBridge({ presentation: {} }, async () => {
      const { playLiturgyItemOnScreens } = await import(
        '../services/liturgy-actions'
      )
      const r = await playLiturgyItemOnScreens({
        type: 'presentation',
        filePath: '/p/D.pptx',
        presentationEngine: 'libreoffice',
      } as any)
      expect(r).toMatchObject({
        ok: false,
        messageKey: 'liturgy.messages.projectionFailed',
      })
    })
  })

  it('#469 openExternal ok:true -> ok true (não projectionFailed)', async () => {
    await withBridge(
      {
        presentation: {
          getEngine: vi.fn().mockResolvedValue('powerpoint'),
          openExternal: vi.fn().mockResolvedValue({ ok: true }),
          detectOffice: vi.fn().mockResolvedValue(true),
        },
      },
      async () => {
        const { playLiturgyItemOnScreens } = await import(
          '../services/liturgy-actions'
        )
        const r = await playLiturgyItemOnScreens({
          type: 'presentation',
          filePath: '/p/E.pptx',
        } as any)
        expect(r.ok).toBe(true)
      },
    )
  })
})
