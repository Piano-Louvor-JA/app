import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mata os mutantes sobreviventes de liturgy-actions.ts:
// OptionalChaining (24), MethodExpression (20), ConditionalExpression (19),
// LogicalOperator (9), result?.ok / result.ok, engine !== 'auto', hasOffice === false.
// Técnica: cada mutante precisa produzir resultado OBSERVÁVEL diferente.

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
    get: vi.fn().mockResolvedValue('vlc'),
    play: vi.fn().mockResolvedValue({ ok: true, player: 'vlc' }),
    pause: vi.fn().mockResolvedValue({ ok: true }),
  },
  presentation: {
    getEngine: vi.fn().mockResolvedValue('powerpoint'),
    openExternal: vi.fn().mockResolvedValue({ ok: true }),
    detectOffice: vi.fn().mockResolvedValue(true),
  },
  projection: {
    openUrl: vi.fn().mockResolvedValue(true),
    closeUrl: vi.fn().mockResolvedValue(true),
  },
})

async function withBridge(bridge: ReturnType<typeof baseMock> | null, fn: () => Promise<void>) {
  // @ts-expect-error
  global.window = { ...originalWindow, louvorja: bridge } as Window & typeof globalThis
  try {
    await fn()
  } finally {
    global.window = originalWindow
  }
}

const audioItem = (over: Partial<Record<string, unknown>> = {}) =>
  ({ type: 'audio', filePath: '/tmp/a.mp3', name: 'Hino', ...over }) as any
const presItem = (over: Partial<Record<string, unknown>> = {}) =>
  ({ type: 'presentation', filePath: '/tmp/d.pptx', name: 'Deck', ...over }) as any

describe('liturgy-actions — mata mutantes OptionalChaining/MethodExpression/result.ok', () => {
  beforeEach(() => {
    originalWindow = global.window
    mockStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.window = originalWindow
  })

  describe('audio + externalPlayer (L148-162)', () => {
    it('play {ok:true} → ok:true e NÃO cai na projeção interna (mata result?.ok removido)', async () => {
      const bridge = baseMock()
      bridge.projection.openUrl = vi.fn() // se cair no interno, openUrl não existe → crash → detecta
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem())
        expect(result.ok).toBe(true)
        expect(bridge.externalPlayer.play).toHaveBeenCalledWith('/tmp/a.mp3', 'vlc')
      })
    })

    it('get() retorna "associated" → NÃO chama play (mata Conditional L153)', async () => {
      const bridge = baseMock()
      bridge.externalPlayer.get = vi.fn().mockResolvedValue('associated')
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem({ playerId: undefined }))
        expect(result.ok).toBe(true)
        expect(bridge.externalPlayer.play).not.toHaveBeenCalled()
      })
    })

    it('playerId custom (não default) → NÃO consulta get() (mata Conditional L150)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem({ playerId: 'mpv' }))
        expect(result.ok).toBe(true)
        expect(bridge.externalPlayer.get).not.toHaveBeenCalled()
        expect(bridge.externalPlayer.play).toHaveBeenCalledWith('/tmp/a.mp3', 'mpv')
      })
    })

    it('play {ok:false} + projeção interna falha → ok:false projectionFailed (mata result.ok L158 invertido)', async () => {
      const bridge = baseMock()
      bridge.externalPlayer.play = vi.fn().mockResolvedValue({ ok: false, error: 'not found' })
      bridge.projection.openUrl = vi.fn().mockResolvedValue(false)
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem())
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.messageKey).toBe('liturgy.messages.projectionFailed')
      })
    })

    it('play retorna undefined (chain quebrada) → cai no interno sem crash (mata bridge?.externalPlayer?.play → .play)', async () => {
      const bridge = baseMock()
      bridge.externalPlayer.play = vi.fn().mockResolvedValue(undefined)
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem())
        expect(result.ok).toBe(true) // fallback interno (openUrl true)
      })
    })

    it('externalPlayer ausente → fallback interno ok:true (mata bridge?.externalPlayer?. → .)', async () => {
      const bridge = baseMock()
      // @ts-expect-error — simula bridge sem externalPlayer
      delete bridge.externalPlayer
      await withBridge(bridge as any, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem())
        expect(result.ok).toBe(true)
      })
    })

    it('get() undefined → pref undefined → pula play (mata LogicalOperator L150 !pref)', async () => {
      const bridge = baseMock()
      bridge.externalPlayer.get = vi.fn().mockResolvedValue(undefined)
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem({ playerId: undefined }))
        expect(result.ok).toBe(true)
        expect(bridge.externalPlayer.play).not.toHaveBeenCalled()
      })
    })

    it('video type NUNCA usa externalPlayer mesmo com playerId (L148 item.type === audio)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(audioItem({ type: 'video' }))
        expect(result.ok).toBe(true)
        expect(bridge.externalPlayer.play).not.toHaveBeenCalled()
      })
    })
  })

  describe('presentation via executeLiturgyItem (L221-242)', () => {
    it('engine do item definido e != auto → usa openExternal SEM consultar getEngine (mata Conditional L222)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ presentationEngine: 'libreoffice' }))
        expect(result.ok).toBe(true)
        expect(bridge.presentation.getEngine).not.toHaveBeenCalled()
        expect(bridge.presentation.openExternal).toHaveBeenCalledWith('/tmp/d.pptx', 'libreoffice')
      })
    })

    it('engine ausente → consulta getEngine powerpoint → openExternal (mata OptionalChaining getEngine)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ presentationEngine: undefined }))
        expect(result.ok).toBe(true)
        expect(bridge.presentation.getEngine).toHaveBeenCalled()
        expect(bridge.presentation.openExternal).toHaveBeenCalledWith('/tmp/d.pptx', 'powerpoint')
      })
    })

    it('getEngine auto → NÃO openExternal, cai no interno (mata engine !== auto L225)', async () => {
      const bridge = baseMock()
      bridge.presentation.getEngine = vi.fn().mockResolvedValue('auto')
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ presentationEngine: undefined }))
        expect(result.ok).toBe(true)
        expect(bridge.presentation.openExternal).not.toHaveBeenCalled()
        expect(bridge.presentation.detectOffice).toHaveBeenCalled()
      })
    })

    it('openExternal {ok:false} → ok:false projectionFailed (mata !result?.ok L230)', async () => {
      const bridge = baseMock()
      bridge.presentation.openExternal = vi.fn().mockResolvedValue({ ok: false })
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ presentationEngine: 'powerpoint' }))
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.messageKey).toBe('liturgy.messages.projectionFailed')
      })
    })

    it('openExternal retorna undefined → cai no interno (mata result?.ok → result.ok)', async () => {
      const bridge = baseMock()
      bridge.presentation.openExternal = vi.fn().mockResolvedValue(undefined)
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ presentationEngine: 'powerpoint' }))
        // undefined não é ok → projectionFailed
        expect(result.ok).toBe(false)
      })
    })

    it('detectOffice false → messageKey presentationOfficeMissing (mata hasOffice === false L237)', async () => {
      const bridge = baseMock()
      bridge.presentation.getEngine = vi.fn().mockResolvedValue('auto')
      bridge.presentation.detectOffice = vi.fn().mockResolvedValue(false)
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ presentationEngine: undefined }))
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.messageKey).toBe('liturgy.messages.presentationOfficeMissing')
      })
    })

    it('detectOffice true → interno ok (mata hasOffice === false invertido)', async () => {
      const bridge = baseMock()
      bridge.presentation.getEngine = vi.fn().mockResolvedValue('auto')
      bridge.presentation.detectOffice = vi.fn().mockResolvedValue(true)
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ presentationEngine: undefined }))
        expect(result.ok).toBe(true)
      })
    })

    it('presentation sem filePath → mediaDesktopOnly (mata Conditional L211)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { executeLiturgyItem } = await import('../services/liturgy-actions')
        const result = await executeLiturgyItem(presItem({ filePath: undefined }))
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.messageKey).toBe('liturgy.messages.mediaDesktopOnly')
      })
    })
  })

  describe('playLiturgyItemOnScreens — presentation path (L331-360)', () => {
    it('engine global powerpoint → openExternal ok (mata OptionalChaining L341-354)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
        const result = await playLiturgyItemOnScreens(presItem({ presentationEngine: undefined }))
        expect(result.ok).toBe(true)
        expect(bridge.presentation.openExternal).toHaveBeenCalledWith('/tmp/d.pptx', 'powerpoint')
      })
    })

    it('openExternal falha → projectionFailed (mata !result?.ok L348)', async () => {
      const bridge = baseMock()
      bridge.presentation.openExternal = vi.fn().mockResolvedValue({ ok: false })
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
        const result = await playLiturgyItemOnScreens(presItem({ presentationEngine: 'powerpoint' }))
        expect(result.ok).toBe(false)
      })
    })

    it('detectOffice false → presentationOfficeMissing (mata L355)', async () => {
      const bridge = baseMock()
      bridge.presentation.getEngine = vi.fn().mockResolvedValue('auto')
      bridge.presentation.detectOffice = vi.fn().mockResolvedValue(false)
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
        const result = await playLiturgyItemOnScreens(presItem({ presentationEngine: undefined }))
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.messageKey).toBe('liturgy.messages.presentationOfficeMissing')
      })
    })

    it('engine auto + office ok → projeção interna multi-tela (mata Conditional L343)', async () => {
      const bridge = baseMock()
      bridge.presentation.getEngine = vi.fn().mockResolvedValue('auto')
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
        const result = await playLiturgyItemOnScreens(presItem({ presentationEngine: undefined }))
        expect(result.ok).toBe(true)
        expect(bridge.presentation.openExternal).not.toHaveBeenCalled()
      })
    })

    it('presentation sem filePath → mediaDesktopOnly (mata L333)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
        const result = await playLiturgyItemOnScreens(presItem({ filePath: '  ' }))
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.messageKey).toBe('liturgy.messages.mediaDesktopOnly')
      })
    })

    it('site sem url → urlMissing; site com url → openLiturgySiteOnScreens (L377-390)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
        const noUrl = await playLiturgyItemOnScreens({ type: 'site', url: '   ', name: 'S' } as any)
        expect(noUrl.ok).toBe(false)
        if (!noUrl.ok) expect(noUrl.messageKey).toBe('liturgy.messages.urlMissing')

        const withUrl = await playLiturgyItemOnScreens({ type: 'site', url: 'https://ex.com', name: 'S' } as any)
        expect(withUrl.ok).toBe(true)
      })
    })

    it('type não-mídia → ok true direto (L373-375)', async () => {
      const bridge = baseMock()
      await withBridge(bridge, async () => {
        const { playLiturgyItemOnScreens } = await import('../services/liturgy-actions')
        const result = await playLiturgyItemOnScreens({ type: 'annotation', name: 'N' } as any)
        expect(result.ok).toBe(true)
      })
    })
  })
})
