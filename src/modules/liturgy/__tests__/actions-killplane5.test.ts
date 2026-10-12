// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Kill plane 5 de liturgy-actions — últimos 13 survivors: OptionalChaining
 * no MEIO da cadeia (#161, #266/267, #277/278, #290/291, #453, #464/465,
 * #477) + equivalentes #268/#455 ('auto'->'').
 * Estratégia: bridge com propriedade intermediária AUSENTE (undefined) —
 * original segue com undefined (?? fallback / if falsy), mutante lança
 * TypeError (acesso a .metodo de undefined).
 */

vi.mock('../../../shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))

const openLocalVideo = vi.fn()
const openLocalPresentation = vi.fn()
vi.mock('../services/liturgy-web-projection', () => ({
  openLiturgyLocalImageControl: vi.fn().mockResolvedValue(true),
  openLiturgyLocalPdfControl: vi.fn().mockResolvedValue(true),
  openLiturgyLocalPresentationControl: (...a: unknown[]) =>
    openLocalPresentation(...a),
  openLiturgyLocalVideoControl: (...a: unknown[]) => openLocalVideo(...a),
  openLiturgySiteControl: vi.fn().mockResolvedValue(true),
  openLiturgySiteOnScreens: vi.fn().mockResolvedValue(true),
  openLiturgyVideoControl: vi.fn().mockResolvedValue(true),
  playLiturgyLocalImageOnScreens: vi.fn().mockResolvedValue(true),
  playLiturgyLocalPdfOnScreens: vi.fn().mockResolvedValue(true),
  playLiturgyLocalPresentationOnScreens: (...a: unknown[]) =>
    openLocalPresentation(...a),
  playLiturgyLocalVideoOnScreens: (...a: unknown[]) => openLocalVideo(...a),
  playLiturgyWebOnConfiguredScreens: vi.fn().mockResolvedValue(true),
}))

vi.mock('../services/liturgy-local-video', () => ({
  getLiturgyVideoObjectUrl: vi.fn(() => undefined),
}))

vi.mock('@modules/media/services/open-music-player', () => ({
  openMusicPlayer: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('../../media/stores/useMediaStore', () => ({
  useMediaStore: vi.fn(() => ({ open: vi.fn() })),
}))

vi.mock('@modules/bible/stores/useBibleStore', () => ({
  useBibleStore: () => ({
    books: [{ id: 1 }],
    bootstrap: vi.fn(),
    selectBook: vi.fn(),
    selectChapter: vi.fn(),
    verseSearchQuery: '',
    applyVerseSearch: vi.fn(),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  openLocalVideo.mockResolvedValue(true)
  openLocalPresentation.mockResolvedValue(true)
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

describe('kill plane 5 — OptionalChaining do meio da cadeia', () => {
  it('#161 audio + player EXTERNO escolhido + bridge SEM externalPlayer: cai no interno', async () => {
    // original: bridge?.externalPlayer?.play?.() -> undefined -> result?.ok falsy -> interno
    // mutante #161 (bridge.externalPlayer.play): TypeError pois externalPlayer é undefined
    await withBridge({}, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem(
        { type: 'audio', filePath: '/a/A.mp3', playerId: 'vlc' } as any,
        { push: vi.fn() } as any,
      )
      expect(r.ok).toBe(true)
      expect(openLocalVideo).toHaveBeenCalledWith(
        '/a/A.mp3',
        '/a/A.mp3',
        undefined,
      )
    })
  })

  it('#266/267 presentation + bridge SEM presentation: engine vira auto, interno ok', async () => {
    // original: bridge?.presentation?.getEngine?.() -> undefined -> 'auto'
    // mutantes #266/267: TypeError (presentation undefined)
    await withBridge({}, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem(
        { type: 'presentation', filePath: '/p/A.pptx' } as any,
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

  it('#277/278 presentation + engine explícito + bridge SEM presentation: interno', async () => {
    // original: openExternal?.() -> undefined -> !result?.ok -> projectionFailed... 
    // NÃO: result undefined -> !result?.ok = true -> retorna projectionFailed
    await withBridge({}, async () => {
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

  it('#290/291 presentation auto + sem presentation + detectOffice ausente: interno tenta', async () => {
    // original: detectOffice?.() -> undefined -> !== false -> segue pro interno
    await withBridge({}, async () => {
      const { executeLiturgyItem } = await import('../services/liturgy-actions')
      const r = await executeLiturgyItem(
        { type: 'presentation', filePath: '/p/C.pptx' } as any,
        { push: vi.fn() } as any,
      )
      expect(r.ok).toBe(true)
    })
  })

  it('#453 playScreens presentation + bridge SEM presentation: interno auto', async () => {
    await withBridge({}, async () => {
      const { playLiturgyItemOnScreens } = await import(
        '../services/liturgy-actions'
      )
      const r = await playLiturgyItemOnScreens({
        type: 'presentation',
        filePath: '/p/D.pptx',
      } as any)
      expect(r.ok).toBe(true)
      expect(openLocalPresentation).toHaveBeenCalledWith(
        '/p/D.pptx',
        '/p/D.pptx',
        'auto',
      )
    })
  })

  it('#464/465 playScreens engine explícito + sem presentation: projectionFailed', async () => {
    await withBridge({}, async () => {
      const { playLiturgyItemOnScreens } = await import(
        '../services/liturgy-actions'
      )
      const r = await playLiturgyItemOnScreens({
        type: 'presentation',
        filePath: '/p/E.pptx',
        presentationEngine: 'libreoffice',
      } as any)
      expect(r).toMatchObject({
        ok: false,
        messageKey: 'liturgy.messages.projectionFailed',
      })
    })
  })

  it('#477 playScreens auto + sem presentation: interno', async () => {
    await withBridge({}, async () => {
      const { playLiturgyItemOnScreens } = await import(
        '../services/liturgy-actions'
      )
      const r = await playLiturgyItemOnScreens({
        type: 'presentation',
        filePath: '/p/F.pptx',
      } as any)
      expect(r.ok).toBe(true)
    })
  })
})
