// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fromPrebuilt: vi.fn(),
  enableSkip: vi.fn(),
  embedHeaders: vi.fn(),
}))

vi.mock('@cliqz/adblocker-electron', () => ({
  ElectronBlocker: { fromPrebuiltAdsAndTracking: mocks.fromPrebuilt },
}))
vi.mock('electron', () => ({
  session: { defaultSession: { id: 'default' } },
}))
vi.mock('../youtube-embed.mjs', () => ({ registerYoutubeEmbedHeaders: mocks.embedHeaders }))
vi.mock('../youtube-ad-skip.mjs', () => ({ enableYoutubeAdSkip: mocks.enableSkip }))

import * as adblock from '../youtube-adblock.mjs'
import { _resetAdblockerForTests, enableAdblocker, isAdblockerEnabled } from '../youtube-adblock.mjs'

const fakeBlocker = () => ({
  config: {},
  enableBlockingInSession: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  _resetAdblockerForTests()
})

describe('youtube-adblock', () => {
  it('ligar ativa o pulo de anúncio em vídeo e os filtros de rede, só com network filters', async () => {
    const blocker = fakeBlocker()
    mocks.fromPrebuilt.mockResolvedValue(blocker)

    await expect(enableAdblocker()).resolves.toEqual({ ok: true })

    expect(mocks.enableSkip).toHaveBeenCalledTimes(1)
    expect(blocker.enableBlockingInSession).toHaveBeenCalledWith({ id: 'default' })
    expect(blocker.config).toMatchObject({
      loadCosmeticFilters: false,
      loadCSPFilters: false,
      enableMutationObserver: false,
      enableHtmlFiltering: false,
    })
    expect(mocks.embedHeaders).toHaveBeenCalled()
    expect(isAdblockerEnabled()).toBe(true)
  })

  it('sem a lista de filtros (offline) o pulo de anúncio continua ligado', async () => {
    mocks.fromPrebuilt.mockRejectedValue(new Error('offline'))

    await expect(enableAdblocker()).resolves.toEqual({ ok: true })

    expect(mocks.enableSkip).toHaveBeenCalledTimes(1)
    expect(isAdblockerEnabled()).toBe(true)
  })

  it('ligar de novo não repete o trabalho', async () => {
    mocks.fromPrebuilt.mockResolvedValue(fakeBlocker())
    await enableAdblocker()
    await expect(enableAdblocker()).resolves.toEqual({ ok: true, already: true })
    expect(mocks.enableSkip).toHaveBeenCalledTimes(1)
    expect(mocks.fromPrebuilt).toHaveBeenCalledTimes(1)
  })

  it('não oferece como desligar: o bloqueio é parte fixa do app', () => {
    expect(Object.keys(adblock).sort()).toEqual(['_resetAdblockerForTests', 'enableAdblocker', 'isAdblockerEnabled'])
  })
})
