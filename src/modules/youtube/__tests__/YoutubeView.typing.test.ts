// @vitest-environment jsdom
/**
 * YoutubeView — busca enquanto digita (igual ao apk): a busca de vídeos e a pesquisa
 * de canais rodam sozinhas depois da pausa; Enter busca na hora sem repetir; link
 * colado não busca sozinho; apagar o campo limpa o resultado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

import type { YoutubeSearchItem } from '@shared/types/desktop-bridge'

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  searchChannels: vi.fn(),
}))

vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string, arg?: unknown) => (arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ query: {} }) }))
vi.mock('@shared/composables/useMinimizablePage', () => ({
  useMinimizablePage: () => ({ minimize: vi.fn(), prepare: vi.fn(), takeRestoredState: () => null }),
}))
vi.mock('@shared/components/PageBackStack.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../components/YoutubeStorageChip.vue', () => ({ default: { template: '<span />' } }))
vi.mock('../services/youtube-player', async (original) => ({
  ...await original<typeof import('../services/youtube-player')>(),
  isYoutubeSearchAvailable: () => true,
  searchYoutubeVideos: (q: string) => mocks.search(q),
  searchYoutubeVideosMore: async () => ({ items: [], continuation: null }),
  fetchYoutubeVideoMeta: async () => null,
}))
vi.mock('../services/youtube-channels', async (original) => ({
  ...await original<typeof import('../services/youtube-channels')>(),
  searchAdventistChannels: (q: string) => mocks.searchChannels(q),
}))

import { TYPING_PAUSE_MS } from '../composables/useTypingSearch'
import YoutubeView from '../views/YoutubeView.vue'

function video(videoId: string, title: string): YoutubeSearchItem {
  return { videoId, title, channel: 'Arautos do Rei', durationText: '3:10', viewsText: '', publishedText: '', thumbnail: '', live: false }
}

let wrapper: VueWrapper | null = null

async function typeIn(selector: string, value: string) {
  await wrapper!.get(selector).setValue(value)
}

async function pause() {
  vi.advanceTimersByTime(TYPING_PAUSE_MS)
  await flushPromises()
}

beforeEach(() => {
  // Só os timers da pausa; o flushPromises segue com setImmediate de verdade.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  localStorage.clear()
  mocks.search.mockReset()
  mocks.searchChannels.mockReset()
  mocks.search.mockResolvedValue({ items: [video('AAAAAAAAAAA', 'Castelo Forte')], continuation: null })
  mocks.searchChannels.mockResolvedValue({ items: [] , error: 'empty' })
  wrapper = mount(YoutubeView)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
})

describe('YoutubeView — busca de vídeos enquanto digita', () => {
  it('busca sozinha depois da pausa e mostra os vídeos', async () => {
    await typeIn('[data-testid="youtube-search-input"]', 'castelo')
    expect(mocks.search).not.toHaveBeenCalled()
    await pause()
    expect(mocks.search).toHaveBeenCalledTimes(1)
    expect(mocks.search).toHaveBeenCalledWith('castelo')
    expect(wrapper!.text()).toContain('Castelo Forte')
  })

  it('Enter busca na hora e não busca de novo depois da pausa', async () => {
    await typeIn('[data-testid="youtube-search-input"]', 'castelo')
    await wrapper!.get('form.yt-view__searchbar').trigger('submit')
    await flushPromises()
    expect(mocks.search).toHaveBeenCalledTimes(1)
    await pause()
    expect(mocks.search).toHaveBeenCalledTimes(1)
  })

  it('link de vídeo colado não busca sozinho', async () => {
    await typeIn('[data-testid="youtube-search-input"]', 'https://www.youtube.com/watch?v=AAAAAAAAAAA')
    await pause()
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it('apagar o campo volta para a tela inicial da busca', async () => {
    await typeIn('[data-testid="youtube-search-input"]', 'castelo')
    await pause()
    expect(wrapper!.text()).toContain('Castelo Forte')
    await typeIn('[data-testid="youtube-search-input"]', '')
    await flushPromises()
    expect(wrapper!.text()).not.toContain('Castelo Forte')
    expect(wrapper!.text()).toContain('youtube.search.empty')
  })

  it('a resposta de uma busca antiga não aparece depois de apagar', async () => {
    let resolve: (r: unknown) => void = () => {}
    mocks.search.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    await typeIn('[data-testid="youtube-search-input"]', 'castelo')
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    await typeIn('[data-testid="youtube-search-input"]', '')
    resolve({ items: [video('BBBBBBBBBBB', 'Resposta velha')], continuation: null })
    await flushPromises()
    expect(wrapper!.text()).not.toContain('Resposta velha')
  })
})

describe('YoutubeView — pesquisa de canais enquanto digita', () => {
  it('pesquisa sozinha depois da pausa; apagar fecha a pesquisa', async () => {
    await wrapper!.get('[data-testid="youtube-open-channels"]').trigger('click')
    await typeIn('[data-testid="youtube-channel-search-input"]', 'jovens')
    expect(mocks.searchChannels).not.toHaveBeenCalled()
    await pause()
    expect(mocks.searchChannels).toHaveBeenCalledWith('jovens')
    expect(wrapper!.find('[data-testid="youtube-channel-results"]').exists()).toBe(true)

    await typeIn('[data-testid="youtube-channel-search-input"]', '')
    expect(wrapper!.find('[data-testid="youtube-channel-results"]').exists()).toBe(false)
  })

  it('botão pesquisa na hora, sem repetir depois da pausa', async () => {
    await wrapper!.get('[data-testid="youtube-open-channels"]').trigger('click')
    await typeIn('[data-testid="youtube-channel-search-input"]', 'jovens')
    await wrapper!.get('[data-testid="youtube-channel-search"]').trigger('submit')
    await pause()
    expect(mocks.searchChannels).toHaveBeenCalledTimes(1)
  })
})
