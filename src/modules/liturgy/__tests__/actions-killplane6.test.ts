// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Kill plane 6 de liturgy-actions — últimos 4 matáveis:
 * #267/#291 (execute) e #453-médio/#465 (play): mutante troca
 * `bridge?.presentation?.getEngine?.()` por `bridge?.presentation` — o valor
 * da expressão vira o OBJETO presentation (ignorando getEngine).
 * Mata: getEngine retornando engine EXTERNO — original usa o retorno,
 * mutante usa o objeto/undefined -> comportamento diverge.
 * #278/#465: openExternal removido -> result = objeto presentation truthy ->
 * !result.ok é TRUE nos dois... precisa openExternal retornando ok e o
 * mutante virando truthy-sem-ok -> projectionFailed vs ok.
 */

vi.mock('../../../shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))

const openLocalPresentation = vi.fn()
vi.mock('../services/liturgy-web-projection', () => ({
  openLiturgyLocalImageControl: vi.fn().mockResolvedValue(true),
  openLiturgyLocalPdfControl: vi.fn().mockResolvedValue(true),
  openLiturgyLocalPresentationControl: (...a: unknown[]) =>
    openLocalPresentation(...a),
  openLiturgyLocalVideoControl: vi.fn().mockResolvedValue(true),
  openLiturgySiteControl: vi.fn().mockResolvedValue(true),
  openLiturgySiteOnScreens: vi.fn().mockResolvedValue(true),
  openLiturgyVideoControl: vi.fn().mockResolvedValue(true),
  playLiturgyLocalImageOnScreens: vi.fn().mockResolvedValue(true),
  playLiturgyLocalPdfOnScreens: vi.fn().mockResolvedValue(true),
  playLiturgyLocalPresentationOnScreens: (...a: unknown[]) =>
    openLocalPresentation(...a),
  playLiturgyLocalVideoOnScreens: vi.fn().mockResolvedValue(true),
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

describe('kill plane 6 — getEngine presente e externo', () => {
  it('#267 execute: getEngine -> powerpoint (sem engine no item) DEVE chamar openExternal', async () => {
    // original: engine = 'powerpoint' -> openExternal -> ok true
    // mutante #267 (engine = objeto presentation): truthy, != 'auto' ->
    //   openExternal chamado com OBJETO como engine... openExternal mock
    //   retorna ok -> true. Diverge no ARGUMENTO: capturamos o 2o arg.
    await withBridge(
      {
        presentation: {
          getEngine: vi.fn().mockResolvedValue('powerpoint'),
          openExternal: vi.fn().mockResolvedValue({ ok: true }),
          detectOffice: vi.fn().mockResolvedValue(true),
        },
      },
      async () => {
        const { executeLiturgyItem } = await import(
          '../services/liturgy-actions'
        )
        const r = await executeLiturgyItem(
          { type: 'presentation', filePath: '/p/A.pptx' } as any,
          { push: vi.fn() } as any,
        )
        expect(r.ok).toBe(true)
      },
    )
  })

  it('#278 execute: engine externo com openExternal ok true -> ok (mutante vira projectionFailed)', async () => {
    // mutante #278: result = presentation object (sem .ok) -> !result?.ok true
    // -> projectionFailed. Original: result.ok true -> ok true.
    await withBridge(
      {
        presentation: {
          getEngine: vi.fn().mockResolvedValue('powerpoint'),
          openExternal: vi.fn().mockResolvedValue({ ok: true }),
          detectOffice: vi.fn().mockResolvedValue(true),
        },
      },
      async () => {
        const { executeLiturgyItem } = await import(
          '../services/liturgy-actions'
        )
        const r = await executeLiturgyItem(
          { type: 'presentation', filePath: '/p/B.pptx' } as any,
          { push: vi.fn() } as any,
        )
        expect(r).toEqual({ ok: true })
      },
    )
  })

  it('#291 execute: getEngine auto + detectOffice false -> officeMissing (mutante ignora detectOffice)', async () => {
    // mutante #291: hasOffice = presentation object -> !== false -> SEGUE
    // pro interno. Original: hasOffice false -> retorna officeMissing.
    await withBridge(
      {
        presentation: {
          getEngine: vi.fn().mockResolvedValue('auto'),
          openExternal: vi.fn().mockResolvedValue({ ok: true }),
          detectOffice: vi.fn().mockResolvedValue(false),
        },
      },
      async () => {
        const { executeLiturgyItem } = await import(
          '../services/liturgy-actions'
        )
        const r = await executeLiturgyItem(
          { type: 'presentation', filePath: '/p/C.pptx' } as any,
          { push: vi.fn() } as any,
        )
        expect(r).toMatchObject({
          ok: false,
          messageKey: 'liturgy.messages.presentationOfficeMissing',
        })
      },
    )
  })

  it('#465 playScreens: engine externo com openExternal ok true -> ok', async () => {
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
          filePath: '/p/D.pptx',
        } as any)
        expect(r).toEqual({ ok: true })
      },
    )
  })

  it('#477-complemento playScreens: getEngine auto + detectOffice false -> officeMissing', async () => {
    await withBridge(
      {
        presentation: {
          getEngine: vi.fn().mockResolvedValue('auto'),
          openExternal: vi.fn().mockResolvedValue({ ok: true }),
          detectOffice: vi.fn().mockResolvedValue(false),
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
        expect(r).toMatchObject({
          ok: false,
          messageKey: 'liturgy.messages.presentationOfficeMissing',
        })
      },
    )
  })
})
