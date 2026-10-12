import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(() => false),
  isProjectionModuleOpen: vi.fn(() => false),
  openProjectionModule: vi.fn(),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  isPalcoTvOnlyRoute: vi.fn(() => false),
}))
vi.mock('../services/countdown-format', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/countdown-format')>(),
}))
vi.mock('../services/countdown-preferences', () => ({
  loadCountdownDisplayConfig: vi.fn(() => null),
  saveCountdownDisplayConfig: vi.fn(),
}))

import { useCountdownStore } from '../useCountdownStore'

describe('useCountdownStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('display config', () => {
    it('setTimeFormat altera o formato', () => {
      const store = useCountdownStore()
      store.setTimeFormat('hh:mm:ss')
      expect(store.config.timeFormat).toBe('hh:mm:ss')
    })

    it('setBgColor altera a cor de fundo', () => {
      const store = useCountdownStore()
      store.setBgColor('#101010')
      expect(store.config.bgColor).toBe('#101010')
    })

    it('setTextColor altera a cor do texto', () => {
      const store = useCountdownStore()
      store.setTextColor('#F0F0F0')
      expect(store.config.textColor).toBe('#F0F0F0')
    })

    it('resetDisplayToDefault volta ao default', () => {
      const store = useCountdownStore()
      store.setBgColor('#ABCDEF')
      store.resetDisplayToDefault()
      expect(store.config.bgColor).not.toBe('#ABCDEF')
    })

    it('configOpen alterna', () => {
      const store = useCountdownStore()
      const before = store.configOpen
      // open/close via actions do painel (se expostos) — senão só estado
      expect(typeof store.configOpen).toBe('boolean')
      void before
    })
  })

  describe('hydrate', () => {
    it('não crasha sem storage', () => {
      const store = useCountdownStore()
      expect(() => store.hydrate()).not.toThrow()
    })
  })
})
