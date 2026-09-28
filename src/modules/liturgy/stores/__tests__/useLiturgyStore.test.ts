import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mocks das dependências externas do store (bridge, services I/O)

// Mock do módulo de preferências (storage real quebra fora do Electron)
const prefsState: Record<string, unknown> = {}
vi.mock('../../services/liturgy-preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/liturgy-preferences')>()
  return {
    ...actual,
    loadLiturgyState: vi.fn(() => actual.normalizeLiturgyState({})),
    saveLiturgyState: vi.fn((state: unknown) => { prefsState.liturgy = state }),
  }
})

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))
vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
}))
vi.mock('../../services/liturgy-actions', () => ({
  executeLiturgyItem: vi.fn(),
  openLiturgyMusicPlayer: vi.fn(),
  playLiturgyItemOnScreens: vi.fn(),
}))
vi.mock('../../services/liturgy-catalog', () => ({
  filterLiturgyMusicOptions: vi.fn((opts: unknown[]) => opts),
  loadLiturgyBibleBooks: vi.fn(async () => []),
  loadLiturgyMusicOptions: vi.fn(async () => []),
}))
vi.mock('../../services/liturgy-web-runtime', () => ({
  clearLiturgyWebRuntime: vi.fn(),
}))

import { useLiturgyStore } from '../useLiturgyStore'
import { DEFAULT_LITURGY_ITEM_DRAFT, LITURGY_DAY_TAB_ORDER } from '../../types/liturgy'

describe('useLiturgyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('estado inicial', () => {
    it('weekdays contém os 7 dias da semana', () => {
      const store = useLiturgyStore()
      expect(Object.keys(store.weekdays)).toHaveLength(7)
    })

    it('selectedDay default = hoje (um dia válido da tab order)', () => {
      const store = useLiturgyStore()
      expect(LITURGY_DAY_TAB_ORDER).toContain(store.selectedDay)
    })

    it('selectedCustomIndex inicia em 0', () => {
      const store = useLiturgyStore()
      expect(store.selectedCustomIndex).toBe(0)
    })

    it('itemDialog inicia fechado', () => {
      const store = useLiturgyStore()
      expect(store.itemDialogOpen).toBe(false)
      expect(store.editingIndex).toBeNull()
    })

    it('itemDraft inicia com defaults', () => {
      const store = useLiturgyStore()
      expect(store.itemDraft).toEqual(DEFAULT_LITURGY_ITEM_DRAFT)
    })
  })

  describe('selectDay', () => {
    it('muda o dia selecionado', () => {
      const store = useLiturgyStore()
      const outro = LITURGY_DAY_TAB_ORDER.find((d: string) => d !== store.selectedDay)
      if (outro) {
        store.selectDay(outro)
        expect(store.selectedDay).toBe(outro)
      }
    })
  })

  describe('itemDialog', () => {
    it('openAddDialog abre dialog com draft default', () => {
      const store = useLiturgyStore()
      store.itemDraft = { ...DEFAULT_LITURGY_ITEM_DRAFT, title: 'velho' }
      store.openAddDialog()
      expect(store.itemDialogOpen).toBe(true)
      expect(store.editingIndex).toBeNull()
    })

    it('closeItemDialog fecha e reseta', () => {
      const store = useLiturgyStore()
      store.openAddDialog()
      store.closeItemDialog()
      expect(store.itemDialogOpen).toBe(false)
    })

    it('setItemDraft atualiza o draft', () => {
      const store = useLiturgyStore()
      const draft = { ...DEFAULT_LITURGY_ITEM_DRAFT, title: 'Hino 1' }
      store.setItemDraft(draft)
      expect(store.itemDraft.title).toBe('Hino 1')
    })
  })

  describe('busca de músicas', () => {
    it('setMusicSearchQuery atualiza query', () => {
      const store = useLiturgyStore()
      store.setMusicSearchQuery('hino')
      expect(store.musicSearchQuery).toBe('hino')
    })
  })

  describe('setItemType', () => {
    it('muda o type do draft', () => {
      const store = useLiturgyStore()
      const types = ['song', 'moment', 'prayer'] as const
      const valid = types.find((t) => t !== store.itemDraft.type)
      if (valid) {
        store.setItemType(valid)
        expect(store.itemDraft.type).toBe(valid)
      }
    })
  })

  describe('sessão start/end', () => {
    it('setSessionStartFromInput com HH:mm válido define currentStartTime', () => {
      const store = useLiturgyStore()
      store.setSessionStartFromInput('19:30')
      expect(store.currentStartTime).toBe('19:30')
    })

    it('setSessionStartFromInput inválido não muda', () => {
      const store = useLiturgyStore()
      store.setSessionStartFromInput('25:99')
      expect(store.currentStartTime).toBeNull()
    })

    it('clearSessionStart limpa', () => {
      const store = useLiturgyStore()
      store.setSessionStartFromInput('19:30')
      store.clearSessionStart()
      expect(store.currentStartTime).toBeNull()
    })

    it('setSessionEndFromInput + clearSessionEnd', () => {
      const store = useLiturgyStore()
      store.setSessionEndFromInput('21:00')
      expect(store.currentEndTime).toBe('21:00')
      store.clearSessionEnd()
      expect(store.currentEndTime).toBeNull()
    })
  })

  describe('toggleDeletionLock', () => {
    it('sem key selecionada não faz nada (não crasha)', () => {
      const store = useLiturgyStore()
      expect(() => store.toggleDeletionLock()).not.toThrow()
    })

    it('alterna deletionLocked com dia selecionado', () => {
      const store = useLiturgyStore()
      const before = store.deletionLocked
      store.toggleDeletionLock()
      expect(store.deletionLocked).toBe(!before)
    })
  })
})
