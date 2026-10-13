import { describe, expect, it, vi, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { createPinia, setActivePinia } from 'pinia'

import { useStageSettingsStore } from '../stores/useStageSettingsStore'

// Setup jsdom environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
})
globalThis.window = dom.window as unknown as Window & typeof globalThis
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage

// Mock da camada de persistência (user-preferences) — o serviço real
// stage-settings-preferences roda por cima, testando a lógica de verdade.
const mockPrefs: Record<string, any> = {}

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(<T,>(key: string, fallback: T): T =>
    (key in mockPrefs ? (mockPrefs[key] as T) : fallback),
  ),
  loadUserPreferences: vi.fn(() => ({ ...mockPrefs })),
  saveUserPreferences: vi.fn((prefs: Record<string, any>) => {
    Object.keys(mockPrefs).forEach(k => delete mockPrefs[k])
    Object.assign(mockPrefs, prefs)
  }),
  setUserPreference: vi.fn((key: string, value: any) => {
    mockPrefs[key] = value
  }),
}))

// Mock notifyStageSettingsChanged (BroadcastChannel)
vi.mock('../services/stage-settings-runtime', () => ({
  notifyStageSettingsChanged: vi.fn(),
}))

const KEY_GLOBAL = 'stage.settings.global'
const KEY_BIBLE = 'stage.settings.bible'
const KEY_HYMNS = 'stage.settings.hymns'

describe('useStageSettingsStore', () => {
  let store: ReturnType<typeof useStageSettingsStore>

  function freshStore() {
    setActivePinia(createPinia())
    store = useStageSettingsStore()
  }

  beforeEach(() => {
    Object.keys(mockPrefs).forEach(k => delete mockPrefs[k])
    localStorage.clear()
    vi.clearAllMocks()
    freshStore()
  })

  it('inicializa com defaults quando storage vazio', () => {
    expect(store.activeScope).toBe('global')
    // 05/10 Rafael: default null (não setado)
    expect(store.settings.backgroundColor).toBeNull()
    expect(store.settings.bibleFontSize).toBe(84)
  })

  it('hydrata o escopo random (sorteio)', () => {
    mockPrefs[KEY_GLOBAL] = { bg: '#111111' }
    mockPrefs['stage.settings.random'] = { bg: '#ABCDEF', fg: '#123456' }

    freshStore()
    store.setActiveScope('random')

    expect(store.settings.backgroundColor).toBe('#ABCDEF')
    expect(store.settings.textColor).toBe('#123456')
    expect(store.isInheritingGlobal).toBe(false)
  })

  it('carrega override do scope bible (override completo, salvo pelo patch)', () => {
    mockPrefs[KEY_GLOBAL] = { bg: '#111111', fg: '#DDDDDD' }
    mockPrefs[KEY_BIBLE] = { bg: '#222222', fg: '#FFFF00' }

    freshStore()
    store.setActiveScope('bible')

    expect(store.settings.backgroundColor).toBe('#222222')
    expect(store.settings.textColor).toBe('#FFFF00')
    expect(store.isInheritingGlobal).toBe(false)
  })

  it('módulo sem override herda global (isInheritingGlobal)', () => {
    mockPrefs[KEY_GLOBAL] = { bg: '#111111' }

    freshStore()
    store.setActiveScope('bible')

    expect(store.settings.backgroundColor).toBe('#111111') // herdado
    expect(store.isInheritingGlobal).toBe(true)
  })

  it('patch persiste no storage', () => {
    store.patch({ backgroundColor: '#333333', textColor: '#EEEEEE' })

    expect(mockPrefs[KEY_GLOBAL].bg).toBe('#333333')
    expect(mockPrefs[KEY_GLOBAL].fg).toBe('#EEEEEE')
  })

  it('patch em módulo herdando cria override a partir do global', () => {
    mockPrefs[KEY_GLOBAL] = { bg: '#111111', fg: '#DDDDDD' }
    freshStore()
    store.setActiveScope('bible')

    store.patch({ backgroundColor: '#222222' })

    expect(mockPrefs[KEY_BIBLE].bg).toBe('#222222') // novo override
    expect(mockPrefs[KEY_BIBLE].fg).toBe('#DDDDDD') // copiado do global
    expect(store.isInheritingGlobal).toBe(false)
  })

  it('patch notifica subscribers (notifyStageSettingsChanged)', async () => {
    const { notifyStageSettingsChanged } = await import('../services/stage-settings-runtime')
    vi.mocked(notifyStageSettingsChanged).mockClear()

    store.patch({ backgroundColor: '#333333' })

    expect(notifyStageSettingsChanged).toHaveBeenCalled()
  })

  it('resetScope em módulo limpa override e volta a herdar', () => {
    mockPrefs[KEY_GLOBAL] = { bg: '#111111' }
    mockPrefs[KEY_HYMNS] = { bg: '#222222' }

    freshStore()
    store.setActiveScope('hymns')
    expect(store.settings.backgroundColor).toBe('#222222')

    store.resetScope()

    expect(mockPrefs[KEY_HYMNS]).toBeUndefined()
    expect(store.settings.backgroundColor).toBe('#111111') // herdado de novo
    expect(store.isInheritingGlobal).toBe(true)
  })

  it('resetScope no global volta aos defaults', () => {
    mockPrefs[KEY_GLOBAL] = { bg: '#111111' }
    freshStore()

    store.resetScope()

    // 05/10 Rafael: default null não serializa bg (chave ausente = não setado)
    expect(mockPrefs[KEY_GLOBAL].bg).toBeUndefined()
    expect(store.settings.backgroundColor).toBeNull()
  })

  it('effective retorna override > global > defaults', () => {
    mockPrefs[KEY_GLOBAL] = { bg: '#111111', fg: '#DDDDDD' }
    mockPrefs[KEY_BIBLE] = { bg: '#222222', fg: '#FFFF00' }

    freshStore()

    const bible = store.effective('bible')
    expect(bible.backgroundColor).toBe('#222222')
    expect(bible.textColor).toBe('#FFFF00')

    const hymns = store.effective('hymns') // sem override → global
    expect(hymns.backgroundColor).toBe('#111111')
    expect(hymns.textColor).toBe('#DDDDDD')
  })

  it('effective sem nada storage → defaults', () => {
    const s = store.effective('bible')
    // 05/10 Rafael: default null (não setado) — imagem vence sem escolha
    expect(s.backgroundColor).toBeNull()
    expect(s.bibleFontSize).toBe(84)
  })
})
