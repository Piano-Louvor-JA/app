// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, h, defineComponent } from 'vue'

// helper: roda composable dentro de um setup real (storeToRefs exige contexto)
function withSetup<T>(fn: () => T): { result: T; app: ReturnType<typeof createApp> } {
  let result!: T
  const app = createApp(defineComponent({
    setup() {
      result = fn()
      return () => h('div')
    },
  }))
  app.use(createPinia())
  app.mount(document.createElement('div'))
  return { result, app }
}

vi.mock('@modules/starting/services/bootstrap-service', () => ({
  loadAndCacheCatalog: vi.fn(async () => ({ ok: true })),
  syncBibleFromApi: vi.fn(async () => ({ ok: true })),
  warmupMediaCache: vi.fn(async () => ({ ok: true })),
  mapBootstrapError: vi.fn((err: unknown) => String(err)),
}))

vi.mock('@modules/starting/services/cover-background-sync', () => ({
  scheduleCoverBackgroundSync: vi.fn(),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
  isDesktopApp: vi.fn(() => false),
}))

vi.mock('@shared/services/projection-window-location', () => ({
  isProjectionPopupLocation: vi.fn(() => false),
}))

vi.mock('@modules/starting/stores/useStartingStore', async (importOriginal) => {
  const { ref } = await import('vue')
  const storeInstance = {
    catalogStatus: ref('idle'),
    bibleStatus: ref('idle'),
    error: ref(null),
    isBooted: ref(false),
    progress: ref(0),
    isVisible: ref(true),
    showContent: ref(false),
    isAppReady: ref(false),
    isFirstBoot: ref(true),
    hasError: ref(false),
    statusKey: ref('loading'),
    setCatalogStatus: vi.fn(),
    setBibleStatus: vi.fn(),
    setError: vi.fn(),
    setBooted: vi.fn(),
    hide: vi.fn(),
    markError: vi.fn(),
    resetError: vi.fn(),
    revealOverlay: vi.fn(),
    setProgress: vi.fn(),
    setStatus: vi.fn(),
    phase: ref('idle'),
  }
  return {
    useStartingStore: vi.fn(() => storeInstance),
  }
})

import { useAppBootstrap } from '../useAppBootstrap'

describe('useAppBootstrap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('composable roda dentro de setup sem crashar', () => {
    expect(() => {
      const { app } = withSetup(() => useAppBootstrap())
      app.unmount()
    }).not.toThrow()
  })

  it('retorna objeto com as funções expostas', () => {
    const { result, app } = withSetup(() => useAppBootstrap() as Record<string, unknown>)
    expect(result).toBeDefined()
    expect(Object.keys(result).length).toBeGreaterThan(0)
    app.unmount()
  })
})
