// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ projectTo: vi.fn(), timerTo: vi.fn() }))
vi.mock('../palco-session', () => ({ palcoSession: api }))
vi.mock('@modules/bible/services/bible-independent-runtime', () => ({
  readBibleIndependentFromStorage: () => ({ text: 'Haja luz', reference: 'Gênesis 1:3' }),
}))
vi.mock('@modules/timer/services/timer-runtime', () => ({
  readTimerRuntimeFromStorage: () => ({ status: 'paused', accumulatedMs: 12000, segmentStartedAt: null }),
}))
vi.mock('@modules/countdown/services/countdown-runtime', () => ({
  readCountdownRuntimeFromStorage: () => ({ status: 'paused', accumulatedMs: 12000, durationMs: 60000, segmentStartedAt: null }),
}))
vi.mock('@modules/random/services/random-runtime', () => ({
  readRandomRuntimeFromStorage: () => ({ currentDisplay: '7' }),
}))
import { renderObsModule } from '../obs-projection'
beforeEach(() => vi.clearAllMocks())
describe('OBS independent rendering', () => {
  it('renderiza a seleção bíblica independente somente no slot escolhido', async () => {
    await renderObsModule('7082', 'bible')
    expect(api.projectTo).toHaveBeenCalledWith('7082', 'bible', { text: 'Haja luz', footerRef: 'Gênesis 1:3' })
    expect(api.projectTo).toHaveBeenCalledOnce()
  })
  it('envia cronômetro e contagem regressiva sem exigir projeção principal ativa', async () => {
    await renderObsModule('7082', 'timer')
    await renderObsModule('7084', 'countdown')
    expect(api.projectTo).toHaveBeenCalledWith('7082', 'timer', { text: '00:00:12' })
    expect(api.projectTo).toHaveBeenCalledWith('7084', 'countdown', { text: '00:00:48' })
  })
  it('envia relógio e sorteio para suas conexões', async () => {
    await renderObsModule('7082', 'random')
    await renderObsModule('7084', 'clock')
    expect(api.projectTo).toHaveBeenCalledWith('7082', 'random', { text: '7' })
    expect(api.projectTo).toHaveBeenCalledWith('7084', 'clock', { text: expect.stringMatching(/^\d{2}:\d{2}$/) })
  })
})
