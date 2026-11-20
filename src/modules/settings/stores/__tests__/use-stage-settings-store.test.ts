// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/stage-settings-preferences', () => ({
  loadStageSettingsOptional: vi.fn(),
  saveStageSettings: vi.fn(),
  clearStageSettings: vi.fn(),
  resolveStageSettings: vi.fn(),
}))

vi.mock('../../services/stage-settings-runtime', () => ({
  notifyStageSettingsChanged: vi.fn(),
}))

vi.mock('../../types/stage-settings', () => ({
  DEFAULT_STAGE_SETTINGS: { backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 16 },
  STAGE_MODULE_SCOPES: ['lyrics', 'bible'],
}))

import { useStageSettingsStore } from '../useStageSettingsStore'
import { loadStageSettingsOptional, saveStageSettings, clearStageSettings } from '../../services/stage-settings-preferences'
import { notifyStageSettingsChanged } from '../../services/stage-settings-runtime'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(loadStageSettingsOptional).mockReturnValue(null)
})

describe('useStageSettingsStore — settings de projeção/palco por escopo', () => {
  it('defaults: activeScope global, settings herdadas do global, hydrated true', () => {
    const store = useStageSettingsStore()
    expect(store.activeScope).toBe('global')
    expect(store.hydrated).toBe(true)
    expect(store.settings).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 16 })
    expect(store.isInheritingGlobal).toBe(false)
  })

  it('hydrate carrega overrides por escopo', () => {
    loadStageSettingsOptional.mockImplementation((scope: string) =>
      scope === 'lyrics' ? { backgroundImage: 'img://lyrics', fontSize: 18, backgroundColor: '#0A0E1A' } : undefined,
    )
    const store = useStageSettingsStore()
    expect(store.hydrated).toBe(true)
    expect(store.effective('lyrics')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: 'img://lyrics', fontSize: 18 })
    expect(store.effective('bible')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 16 })
  })

  it('setActiveScope troca escopo ativo', () => {
    const store = useStageSettingsStore()
    store.setActiveScope('lyrics')
    expect(store.activeScope).toBe('lyrics')
    store.setActiveScope('bible')
    expect(store.activeScope).toBe('bible')
  })

  it('patch cria override no escopo ativo, salva e notifica', () => {
    const store = useStageSettingsStore()
    store.setActiveScope('lyrics')
    store.patch({ fontSize: 20 })
    expect(store.effective('lyrics')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 20 })
    expect(saveStageSettings).toHaveBeenCalledWith('lyrics', { backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 20 })
    expect(notifyStageSettingsChanged).toHaveBeenCalled()
  })

  it('setBackgroundImage atalho de patch', () => {
    const store = useStageSettingsStore()
    store.setBackgroundImage('data:image/png;base64,xxx')
    expect(store.settings.backgroundImage).toBe('data:image/png;base64,xxx')
  })

  it('resetScope global volta aos defaults e salva', () => {
    const store = useStageSettingsStore()
    store.setActiveScope('global')
    store.resetScope()
    expect(store.effective('global')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 16 })
    expect(saveStageSettings).toHaveBeenCalledWith('global', { backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 16 })
    expect(clearStageSettings).not.toHaveBeenCalled()
    expect(notifyStageSettingsChanged).toHaveBeenCalled()
  })

  it('resetScope módulo limpa override e chama clear', () => {
    const store = useStageSettingsStore()
    store.setActiveScope('lyrics')
    store.patch({ fontSize: 22 })
    const callsBeforeReset = saveStageSettings.mock.calls.length
    store.resetScope()
    expect(store.effective('lyrics')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 16 })
    expect(clearStageSettings).toHaveBeenCalledWith('lyrics')
    expect(saveStageSettings).toHaveBeenCalledTimes(callsBeforeReset)
  })

  it('effective retorna override do módulo, fallback global, fallback default', () => {
    const store = useStageSettingsStore()
    store.setActiveScope('lyrics')
    store.patch({ backgroundImage: 'img://lyrics', fontSize: 18 })
    store.setActiveScope('global')
    store.patch({ backgroundImage: 'img://global', fontSize: 16 })
    expect(store.effective('lyrics')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: 'img://lyrics', fontSize: 18 })
    expect(store.effective('bible')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: 'img://global', fontSize: 16 })
    store.setActiveScope('global')
    store.patch({ backgroundImage: null })
    expect(store.effective('bible')).toEqual({ backgroundColor: '#0A0E1A', backgroundImage: null, fontSize: 16 })
  })

  it('isInheritingGlobal true quando módulo sem override', () => {
    const store = useStageSettingsStore()
    store.setActiveScope('bible')
    expect(store.isInheritingGlobal).toBe(true)
    store.patch({ backgroundImage: 'x', fontSize: 12 })
    expect(store.isInheritingGlobal).toBe(false)
    store.setActiveScope('global')
    expect(store.isInheritingGlobal).toBe(false)
  })

  it('hydrate idempotente (segunda chamada retorna cedo)', () => {
    const store = useStageSettingsStore()
    loadStageSettingsOptional.mockReturnValue({ backgroundColor: '#0A0E1A', backgroundImage: 'img', fontSize: 14 })
    store.hydrate()
    const calls1 = loadStageSettingsOptional.mock.calls.length
    store.hydrate()
    const calls2 = loadStageSettingsOptional.mock.calls.length
    expect(calls2).toBe(calls1)
  })
})