// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fromPrebuilt: vi.fn(),
  enableSkip: vi.fn(),
  disableSkip: vi.fn(),
  embedHeaders: vi.fn(),
  handle: vi.fn(),
}))

vi.mock('@cliqz/adblocker-electron', () => ({
  ElectronBlocker: { fromPrebuiltAdsAndTracking: mocks.fromPrebuilt },
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  session: { defaultSession: { id: 'default' } },
}))
vi.mock('../youtube-embed.mjs', () => ({ registerYoutubeEmbedHeaders: mocks.embedHeaders }))
vi.mock('../youtube-ad-skip.mjs', () => ({
  enableYoutubeAdSkip: mocks.enableSkip,
  disableYoutubeAdSkip: mocks.disableSkip,
}))

import {
  _resetAdblockerForTests,
  adblockEnabledFromRecord,
  disableAdblocker,
  enableAdblocker,
  isAdblockerEnabled,
  registerAdblockerIpc,
} from '../youtube-adblock.mjs'

const fakeBlocker = () => ({
  config: {},
  enableBlockingInSession: vi.fn(),
  disableBlockingInSession: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  _resetAdblockerForTests()
})

describe('adblockEnabledFromRecord', () => {
  it.each([
    ['sem registro (instalação nova ou anterior à opção)', null, true],
    ['registro ilegível', 'x', true],
    ['usuário ligou', { enabled: true }, true],
    ['usuário desligou', { enabled: false }, false],
  ])('%s', (_label, record, expected) => {
    expect(adblockEnabledFromRecord(record)).toBe(expected)
  })
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
    expect(disableAdblocker()).toEqual({ ok: true })
    expect(mocks.disableSkip).toHaveBeenCalledTimes(1)
  })

  it('desligar desfaz as duas camadas e restaura o header do embed', async () => {
    const blocker = fakeBlocker()
    mocks.fromPrebuilt.mockResolvedValue(blocker)
    await enableAdblocker()
    mocks.embedHeaders.mockClear()

    expect(disableAdblocker()).toEqual({ ok: true })

    expect(mocks.disableSkip).toHaveBeenCalledTimes(1)
    expect(blocker.disableBlockingInSession).toHaveBeenCalledWith({ id: 'default' })
    expect(mocks.embedHeaders).toHaveBeenCalledTimes(1)
    expect(isAdblockerEnabled()).toBe(false)
  })

  it('desligar enquanto a lista baixa não liga os filtros depois', async () => {
    const blocker = fakeBlocker()
    let resolveList
    mocks.fromPrebuilt.mockReturnValue(new Promise((resolve) => { resolveList = resolve }))

    const enabling = enableAdblocker()
    disableAdblocker()
    resolveList(blocker)
    await enabling

    expect(blocker.enableBlockingInSession).not.toHaveBeenCalled()
    expect(isAdblockerEnabled()).toBe(false)
  })

  it('ligar ou desligar de novo não repete o trabalho', async () => {
    mocks.fromPrebuilt.mockResolvedValue(fakeBlocker())
    await enableAdblocker()
    await expect(enableAdblocker()).resolves.toEqual({ ok: true, already: true })
    expect(mocks.enableSkip).toHaveBeenCalledTimes(1)

    disableAdblocker()
    expect(disableAdblocker()).toEqual({ ok: true, already: true })
    expect(mocks.disableSkip).toHaveBeenCalledTimes(1)
  })

  it('IPC: status, set persistido e restauração no boot', async () => {
    mocks.fromPrebuilt.mockResolvedValue(fakeBlocker())
    const persist = vi.fn()
    registerAdblockerIpc(persist, async () => true)
    await vi.waitFor(() => expect(isAdblockerEnabled()).toBe(true))

    const handler = (channel) => mocks.handle.mock.calls.find(([c]) => c === channel)[1]
    expect(handler('yt-adblock:status')()).toEqual({ enabled: true })
    await expect(handler('yt-adblock:set')({}, false)).resolves.toEqual({ ok: true })
    expect(persist).toHaveBeenCalledWith(false)
    expect(handler('yt-adblock:status')()).toEqual({ enabled: false })
  })
})
