import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { createPinia, setActivePinia } from 'pinia'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
globalThis.window = dom.window as unknown as Window & typeof globalThis
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage

// bordas: janela de projeção e bridge do palco
vi.mock('@shared/composables/useProjectionWindow', () => ({
  isProjectionModuleOpen: vi.fn(() => false),
  openProjectionModule: vi.fn(async () => true),
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(() => false),
}))
vi.mock('../../settings/services/palco-bridge', () => ({
  palcoClockOn: vi.fn(),
  palcoClockOff: vi.fn(),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  isPalcoTvOnlyRoute: vi.fn(() => false),
}))

import { isProjectionModuleOpen, openProjectionModule, closeProjectionModule, hasSelectedExtendedProjectionTargets } from '@shared/composables/useProjectionWindow'
import { palcoClockOn, palcoClockOff } from '../../settings/services/palco-bridge'
import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'

import { useClockStore } from '../stores/useClockStore'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { DEFAULT_CLOCK_CONFIG } from '../types/clock'

// user-preferences REAL roda por cima do localStorage do jsdom — para semear
// preferências, escrever no formato do browser-storage: user_data = { key: value }
function seedPref(key: string, value: unknown) {
  localStorage.setItem('user_data', JSON.stringify({ [key]: value }))
}

describe('useClockStore', () => {
  let store: ReturnType<typeof useClockStore>

  function freshStore() {
    setActivePinia(createPinia())
    store = useClockStore()
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(false)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.mocked(openProjectionModule).mockResolvedValue(true)
    freshStore()
  })

  it('estado inicial: config default, não projetando, não hidratado', () => {
    expect(store.config).toEqual({ ...DEFAULT_CLOCK_CONFIG })
    expect(store.isProjecting).toBe(false)
    expect(store.configOpen).toBe(false)
    expect(store.hydrated).toBe(false)
    expect(store.isAnalog).toBe(false)
  })

  it('hydrate carrega config persistida e marca hidratado (uma vez só)', () => {
    seedPref(USER_PREFERENCE_KEYS.clockConfig, { ...DEFAULT_CLOCK_CONFIG, style: 'analog' })
    freshStore()
    store.hydrate()
    expect(store.config.style).toBe('analog')
    expect(store.hydrated).toBe(true)
    expect(store.isAnalog).toBe(true)

    // segunda chamada é no-op
    store.hydrate()
    expect(store.config.style).toBe('analog')
  })

  it('hydrate detecta projeção já aberta e inicia watch', () => {
    vi.useFakeTimers()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    freshStore()
    store.hydrate()
    expect(store.isProjecting).toBe(true)

    // janela fecha externamente → watch desliga isProjecting
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)
    vi.useRealTimers()
  })

  it('setters atualizam config e persistem (comportamento observável no load)', () => {
    store.hydrate()
    store.setStyle('analog')
    store.setShowSeconds(true)
    store.setFormat24h(false)
    store.setBgColor('#010203')
    store.setTextColor('#040506')

    expect(store.config).toEqual({
      ...DEFAULT_CLOCK_CONFIG,
      style: 'analog',
      showSeconds: true,
      format24h: false,
      bgColor: '#010203',
      textColor: '#040506',
    })

    // persistiu de verdade: nova store hidratada lê o mesmo estado
    freshStore()
    store.hydrate()
    expect(store.config.style).toBe('analog')
    expect(store.config.bgColor).toBe('#010203')
  })

  it('resetToDefault volta ao default e persiste', () => {
    store.hydrate()
    store.setStyle('analog')
    store.resetToDefault()
    expect(store.config).toEqual({ ...DEFAULT_CLOCK_CONFIG })

    freshStore()
    store.hydrate()
    expect(store.config).toEqual({ ...DEFAULT_CLOCK_CONFIG })
  })

  it('openConfig/closeConfig controlam o dialog', () => {
    store.openConfig()
    expect(store.configOpen).toBe(true)
    store.closeConfig()
    expect(store.configOpen).toBe(false)
  })

  it('syncProjection sem monitor externo: preview in-app (fecha janela, isProjecting true)', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.syncProjection()
    expect(palcoClockOn).toHaveBeenCalled()
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(true)
    expect(openProjectionModule).not.toHaveBeenCalled()
  })

  it('syncProjection com monitor externo: abre janela', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    await store.syncProjection()
    expect(openProjectionModule).toHaveBeenCalledWith('clock')
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(false)
  })

  it('syncProjection rota TV-only: projeta sem abrir janela', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(hasSelectedExtendedProjectionTargets).not.toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
  })

  it('syncProjection falha ao abrir janela: isProjecting false e watch parado', async () => {
    vi.useFakeTimers()
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    vi.mocked(openProjectionModule).mockResolvedValue(false)
    await store.syncProjection()
    expect(store.isProjecting).toBe(false)
    // watch não roda: nada muda
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(1000)
    expect(store.isProjecting).toBe(false)
    vi.useRealTimers()
  })

  it('clearProjection fecha janela, desliga palco e zera estado', async () => {
    await store.syncProjection()
    store.clearProjection()
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(palcoClockOff).toHaveBeenCalled()
    expect(store.isProjecting).toBe(false)
  })

  it('toggleProjection liga e desliga', async () => {
    await store.toggleProjection()
    expect(store.isProjecting).toBe(true)
    // janela aberta → segundo toggle entra no caminho de clearProjection
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
    expect(closeProjectionModule).toHaveBeenCalled()
  })

  it('watch não derruba projeção em modo TV-only', async () => {
    vi.useFakeTimers()
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()

    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(1000)
    expect(store.isProjecting).toBe(true) // TV-only ignora o watch da janela
    vi.useRealTimers()
  })

  it('watch: janela segue aberta → projeção mantida; fecha depois → derruba', async () => {
    vi.useFakeTimers()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    freshStore()
    store.hydrate()
    expect(store.isProjecting).toBe(true)

    // tick com janela aberta: mantém
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(true)

    // janela fecha: próximo tick derruba
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)
    vi.useRealTimers()
  })

  it('toggle com isProjecting mas janela fechada e modo espelho → reabre (sync)', async () => {
    vi.useFakeTimers()
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    await store.syncProjection()
    expect(store.isProjecting).toBe(true)

    // janela fecha externamente mas o watch ainda não rodou
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(false)
    // segundo toggle: guard falha (janela fechada, não TV-only, sem preview) → syncProjection de novo
    await store.toggleProjection()
    expect(openProjectionModule).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
