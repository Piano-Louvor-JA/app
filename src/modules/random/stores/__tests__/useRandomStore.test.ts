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
vi.mock(import('../../services/random-draw'), async (importOriginal) => ({
  ...await importOriginal(),
  drawFromPool: vi.fn((pool: string[]) => pool[0] ?? null),
  drawNumber: vi.fn((min: number, max: number) => min),
}))

import { useRandomStore } from '../useRandomStore'

describe('useRandomStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('setMode', () => {
    it('muda para numbers', () => {
      const store = useRandomStore()
      store.setMode('numbers')
      expect(store.session.mode).toBe('numbers')
    })

    it('volta para names', () => {
      const store = useRandomStore()
      store.setMode('numbers')
      store.setMode('names')
      expect(store.session.mode).toBe('names')
    })
  })

  describe('modo numbers', () => {
    it('setNumberMin/setNumberMax definem o intervalo', () => {
      const store = useRandomStore()
      store.setNumberMin(1)
      store.setNumberMax(100)
      expect(store.session.numberMin).toBe(1)
      expect(store.session.numberMax).toBe(100)
    })

    it('generateNumberRange popula o pool de números', () => {
      const store = useRandomStore()
      store.setMode('numbers')
      store.setNumberMin(1)
      store.setNumberMax(5)
      store.generateNumberRange()
      expect(store.available.length).toBe(5)
    })
  })

  describe('modo names', () => {
    it('addName adiciona ao pool disponível', () => {
      const store = useRandomStore()
      store.addName('Maria')
      expect(store.available).toContain('Maria')
    })

    it('addName sem nome não adiciona', () => {
      const store = useRandomStore()
      const before = store.available.length
      store.addName()
      expect(store.available.length).toBe(before)
    })

    it('addName com vírgula adiciona como nome único (split é do importNamesFromText)', () => {
      const store = useRandomStore()
      const before = store.available.length
      store.addName('João, Maria, José')
      expect(store.available.length).toBe(before + 1)
    })

    it('importNamesFromText importa bloco de nomes', () => {
      const store = useRandomStore()
      const text = ['Ana', 'Beto', 'Carla'].join('\n')
      const added = store.importNamesFromText(text)
      expect(added).toBe(3)
      expect(store.available.length).toBe(3)
    })

    it('removeAvailable remove pelo índice', () => {
      const store = useRandomStore()
      store.clearAvailable()
      store.addName('Unico')
      const idx = store.available.indexOf('Unico')
      store.removeAvailable(idx)
      expect(store.available).not.toContain('Unico')
    })

    it('clearAvailable esvazia o pool', () => {
      const store = useRandomStore()
      store.addName('A')
      store.clearAvailable()
      expect(store.available).toHaveLength(0)
    })

    it('setDraftName atualiza o draft', () => {
      const store = useRandomStore()
      store.setDraftName('teste')
      expect(store.draftName).toBe('teste')
    })
  })

  describe('display config', () => {
    it('setBgColor/setTextColor alteram config', () => {
      const store = useRandomStore()
      store.setBgColor('#111111')
      store.setTextColor('#EEEEEE')
      expect(store.config.bgColor).toBe('#111111')
      expect(store.config.textColor).toBe('#EEEEEE')
    })

    it('setFontSizePc altera config', () => {
      const store = useRandomStore()
      store.setFontSizePc(12)
      expect(store.config.fontSizePc).toBe(12)
    })

    it('setTextTransform altera config', () => {
      const store = useRandomStore()
      store.setTextTransform('uppercase')
      expect(store.config.textTransform).toBe('uppercase')
    })

    it('setAnimationSpeed altera config', () => {
      const store = useRandomStore()
      store.setAnimationSpeed('slow')
      expect(store.config.animationSpeed).toBe('slow')
    })

    it('resetDisplayToDefault volta ao default', () => {
      const store = useRandomStore()
      store.setBgColor('#ABCDEF')
      store.resetDisplayToDefault()
      expect(store.config.bgColor).toBe('#000000')
    })
  })

  describe('hydrate', () => {
    it('não crasha sem storage prévio', () => {
      const store = useRandomStore()
      expect(() => store.hydrate()).not.toThrow()
    })
  })
})
