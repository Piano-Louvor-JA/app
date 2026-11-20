import { describe, expect, it, vi } from 'vitest'

const previousSlide = vi.fn()
const nextSlide = vi.fn()

vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  onMounted: (cb: () => void) => cb(),
  onUnmounted: () => undefined,
  watch: (_source: unknown, cb: (v: [boolean, boolean]) => void) => cb([true, false]),
}))
vi.mock('pinia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pinia')>()),
  storeToRefs: () => ({ hasSession: { value: true }, minimized: { value: false } }),
}))
vi.mock('../../stores/useMediaStore', () => ({
  useMediaStore: () => ({ previousSlide, nextSlide }),
}))
vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge: () => null }))

describe('useMediaPlayerHotkeys — node sem document', () => {
  it('reclaim guard retorna antes de document.activeElement', async () => {
    Object.assign(globalThis, {
      window: {
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
        setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), focus: vi.fn(),
      },
    })
    delete (globalThis as { document?: unknown }).document
    const { useMediaPlayerHotkeys } = await import('../useMediaPlayerHotkeys')
    expect(() => useMediaPlayerHotkeys(() => false)).not.toThrow()
    expect(previousSlide).not.toHaveBeenCalled()
    expect(nextSlide).not.toHaveBeenCalled()
  })
})
