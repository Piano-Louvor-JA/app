import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSabbathSchoolStore } from '../../../sabbath-school/stores/useSabbathSchoolStore'
import { createSabbathHandlers } from '../sabbath-handlers'
vi.mock('@shared/composables/useProjectionWindow', () => ({ closeProjectionModule: vi.fn(), hasSelectedExtendedProjectionTargets: vi.fn(() => false), isProjectionModuleOpen: vi.fn(() => false), openProjectionModule: vi.fn(async () => true) }))
let store: ReturnType<typeof useSabbathSchoolStore>
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.useFakeTimers(); store = useSabbathSchoolStore() })
afterEach(() => { store.stop(); vi.useRealTimers() })
describe('Escola Sabatina controlada pelo APK', () => {
  it('controla a contagem real e calcula tempo pelo relógio do desktop', async () => {
    const h = createSabbathHandlers(store)
    expect(await h.execute('sabbath.setSchedule', { mode: 'duration', durationMs: 600000 })).toBe(true)
    expect(await h.execute('sabbath.start', {})).toBe(true)
    vi.setSystemTime(Date.now() + 60000)
    expect(h.snapshot().remainingMs).toBe(540000)
    expect(await h.execute('sabbath.pause', {})).toBe(true)
    expect(h.snapshot().status).toBe('paused')
    expect(await h.execute('sabbath.adjustTime', { value: 60000 })).toBe(true)
    expect(h.snapshot().remainingMs).toBe(600000)
    expect(await h.execute('sabbath.stop', {})).toBe(true)
    expect(h.snapshot().status).toBe('idle')
  })
  it('valida agenda e vídeo sem expor caminhos do desktop', async () => {
    const h = createSabbathHandlers(store)
    expect(await h.execute('sabbath.setSchedule', { mode: 'duration', durationMs: -1 })).toBe(false)
    expect(await h.execute('sabbath.setSchedule', { mode: 'endOnly', name: '99:00' })).toBe(false)
    expect(await h.execute('sabbath.setSchedule', { mode: 'endOnly', name: '10:45' })).toBe(true)
    expect(store.config.schedule.endTime).toBe('10:45')
    expect(await h.execute('sabbath.setSchedule', { mode: 'video' })).toBe(false)
    expect(await h.execute('sabbath.unknown', {})).toBe(false)
  })
  it('controla volume, abertura, últimos minutos e marcos com persistência existente', async () => {
    const h = createSabbathHandlers(store)
    expect(await h.execute('sabbath.setVolume', { value: 65 })).toBe(true)
    expect(store.audioVolume).toBe(0.65)
    expect(await h.execute('sabbath.setMuted', { enabled: true })).toBe(true)
    expect(store.audioMuted).toBe(true)
    expect(await h.execute('sabbath.setAudioLang', { name: 'fr' })).toBe(true)
    expect(store.config.audioLang).toBe('fr')
    expect(await h.execute('sabbath.toggleOpening', {})).toBe(true)
    expect(store.openingToggles).toBe(1)
    expect(await h.execute('sabbath.addMarker', { value: 180000, name: 'beep' })).toBe(true)
    expect(await h.execute('sabbath.addMarker', { value: 180000, name: 'beep' })).toBe(false)
    expect(await h.execute('sabbath.setMarker', { targetId: '5min', name: 'none' })).toBe(true)
    expect(await h.execute('sabbath.toggleFinalMinutes', {})).toBe(true)
    expect(store.rehearsing).toBe(true)
    expect(h.snapshot().remainingMs).toBe(300000)
  })
})
