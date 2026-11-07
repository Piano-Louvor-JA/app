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
vi.mock('@modules/announcements/services/carousel-obs', () => ({
  carouselObsInput: async () => ({ text: 'Batismo<br>Sábado' }),
}))
import { renderObsModule } from '../obs-projection'
beforeEach(() => vi.clearAllMocks())
describe('OBS independent rendering', () => {
  it('marca o recurso compartilhado como painel secundário', async () => {
    await renderObsModule('7082', 'bible', true)
    expect(api.projectTo).toHaveBeenCalledWith('7082', 'bible', {
      obsPane: true, text: 'Haja luz', footerRef: 'Gênesis 1:3',
    })
  })
  it('renderiza a seleção bíblica independente somente no slot escolhido', async () => {
    await renderObsModule('7082', 'bible')
    expect(api.projectTo).toHaveBeenCalledWith('7082', 'bible', { text: 'Haja luz', footerRef: 'Gênesis 1:3' })
    expect(api.projectTo).toHaveBeenCalledOnce()
  })
  it('envia cronômetro e contagem regressiva sem exigir projeção principal ativa', async () => {
    await renderObsModule('7082', 'timer')
    await renderObsModule('7084', 'countdown')
    expect(api.timerTo).toHaveBeenCalledWith('7082', expect.objectContaining({ mode: 'chrono', chronoRuntime: { status: 'paused', accumulatedMs: 12000, segmentStartedAt: null } }))
    expect(api.projectTo).toHaveBeenCalledWith('7084', 'countdown', { text: '00:00:48' })
  })
  it('envia o slide atual do carrossel dos Avisos com a aparência da Liturgia', async () => {
    await renderObsModule('7082', 'announcements-carousel')
    await renderObsModule('7084', 'announcements-carousel', true)
    expect(api.projectTo).toHaveBeenCalledWith('7082', 'liturgy', { text: 'Batismo<br>Sábado' })
    expect(api.projectTo).toHaveBeenCalledWith('7084', 'liturgy', { obsPane: true, text: 'Batismo<br>Sábado' })
  })
  it('envia relógio e sorteio para suas conexões', async () => {
    await renderObsModule('7082', 'random')
    await renderObsModule('7084', 'clock')
    expect(api.projectTo).toHaveBeenCalledWith('7082', 'random', { text: '7' })
    expect(api.projectTo).toHaveBeenCalledWith('7084', 'clock', { text: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/) })
  })
})
