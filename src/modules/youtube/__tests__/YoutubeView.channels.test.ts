// @vitest-environment jsdom
/**
 * YoutubeView — seção "Canais": o canal padrão da Casa Publicadora Brasileira
 * vem no app e, ao entrar, lista todos os hinos do Novo Hinário Adventista numa
 * lista só (as 6 playlists juntas), com busca pelo número ou nome do hino.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

import type { YoutubePlaylistResult, YoutubeSearchItem } from '@shared/types/desktop-bridge'

const mocks = vi.hoisted(() => ({
  fetchPlaylist: vi.fn(),
  restored: null as Record<string, unknown> | null,
  capture: null as (() => Record<string, unknown>) | null,
  describe: null as (() => { summary: string }) | null,
}))

vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string, arg?: unknown) => (arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@shared/composables/useMinimizablePage', () => ({
  useMinimizablePage: (opts: { capture: () => Record<string, unknown>; describe: () => { summary: string } }) => {
    mocks.capture = opts.capture
    mocks.describe = opts.describe
    return { minimize: vi.fn(), prepare: vi.fn(), takeRestoredState: () => mocks.restored }
  },
}))
vi.mock('@shared/components/PageBackStack.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../components/YoutubeStorageChip.vue', () => ({ default: { template: '<span />' } }))
vi.mock('../services/youtube-player', async (original) => ({
  ...await original<typeof import('../services/youtube-player')>(),
  isYoutubeSearchAvailable: () => true,
  fetchYoutubePlaylist: (text: string) => mocks.fetchPlaylist(text),
}))

import { CPB_CHANNEL } from '../services/youtube-channels'
import YoutubeView from '../views/YoutubeView.vue'

function hymn(n: number, name: string): YoutubeSearchItem {
  const videoId = `hino${String(n).padStart(7, '0')}`
  return {
    videoId,
    title: `Novo Hinário Adventista • Hino ${n} • ${name} • (Lyrics)`,
    channel: 'Casa Publicadora Brasileira',
    durationText: '3:10',
    viewsText: '',
    publishedText: '',
    thumbnail: '',
    live: false,
  }
}

/** Cada playlist da CPB devolve dois hinos do seu intervalo (1, 2 · 101, 102 · …). */
function hymnalFetch(id: string): Promise<YoutubePlaylistResult> {
  const index = CPB_CHANNEL.playlists.findIndex((p) => p.id === id)
  const first = index * 100 + 1
  return Promise.resolve({ title: '', items: [hymn(first, `Hino de abertura ${first}`), hymn(first + 1, `Graça ${first + 1}`)] })
}

let wrapper: VueWrapper | null = null

function mountView() {
  wrapper = mount(YoutubeView)
  return wrapper
}

async function openCpb(w: VueWrapper) {
  await w.get('[data-testid="youtube-open-channels"]').trigger('click')
  await w.get('[data-testid="youtube-channel-card"] .yt-col__cover').trigger('click')
}

function titles(w: VueWrapper): string[] {
  return w.findAll('[data-testid="youtube-channel-video"] .yt-card__title').map((n) => n.text())
}

beforeEach(() => {
  localStorage.clear()
  mocks.fetchPlaylist.mockReset()
  mocks.restored = null
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

// As 6 playlists ficam no cache em memória entre os testes; a ordem abaixo importa:
// primeiro a falha (nada no cache), depois o resto já usa o cache.
describe('YoutubeView — canal da CPB (lista única de hinos)', () => {
  it('o card do canal mostra o nome e "Novo Hinário Adventista", sem contar playlists', async () => {
    const w = mountView()
    await w.get('[data-testid="youtube-open-channels"]').trigger('click')
    const card = w.get('[data-testid="youtube-channel-card"]')
    expect(card.text()).toContain('Casa Publicadora Brasileira')
    expect(card.text()).toContain('Novo Hinário Adventista')
    expect(card.text()).not.toContain('youtube.channels.playlistCount')
  })

  it('se uma playlist falha, mostra o erro (nada pela metade) e "Tentar de novo" completa a lista', async () => {
    let calls = 0
    mocks.fetchPlaylist.mockImplementation((id: string) => {
      calls += 1
      return calls === 3 ? Promise.resolve({ title: '', items: [], error: 'network' }) : hymnalFetch(id)
    })
    const w = mountView()
    await openCpb(w)
    expect(w.find('[data-testid="youtube-channel-loading"]').exists()).toBe(true)
    await flushPromises()

    expect(w.get('[data-testid="youtube-channel-error"]').text()).toContain('youtube.channels.error')
    expect(titles(w)).toEqual([])
    expect(mocks.fetchPlaylist).toHaveBeenCalledTimes(6)

    await w.get('[data-testid="youtube-channel-error"] button').trigger('click')
    await flushPromises()
    // só a playlist que falhou foi buscada de novo
    expect(mocks.fetchPlaylist).toHaveBeenCalledTimes(7)
    expect(titles(w)).toHaveLength(12)
  })

  it('entrar no canal lista todos os hinos, em ordem, numa lista só (sem tela de playlists)', async () => {
    mocks.fetchPlaylist.mockImplementation(hymnalFetch)
    const w = mountView()
    await openCpb(w)
    await flushPromises()

    expect(w.findAll('[data-testid="youtube-channel-playlist"]')).toHaveLength(0)
    expect(w.get('.yt-col__name').text()).toBe('Casa Publicadora Brasileira')
    const all = titles(w)
    expect(all).toHaveLength(12)
    expect(all[0]).toContain('Hino 1 ')
    expect(all[2]).toContain('Hino 101 ')
    expect(all[11]).toContain('Hino 502 ')
    expect(w.text()).toContain('youtube.collections.videoCount:{"n":12}')
    // a lista única não vira coletânea (passaria do limite de 500 vídeos)
    expect(w.find('[data-testid="youtube-channel-save-collection"]').exists()).toBe(false)
    expect(mocks.describe?.().summary).toBe('Casa Publicadora Brasileira')
  })

  it('busca pelo número acha o hino exato; por nome filtra; sem resultado avisa', async () => {
    const w = mountView()
    await openCpb(w)
    await flushPromises()

    await w.get('[data-testid="youtube-channel-filter"]').setValue('2')
    expect(titles(w)).toEqual([hymn(2, 'Graça 2').title])
    // a linha mantém o número da posição na lista completa
    expect(w.get('[data-testid="youtube-channel-video"] .yt-col__pos').text()).toBe('2')

    await w.get('[data-testid="youtube-channel-filter"]').setValue('graca')
    expect(titles(w)).toHaveLength(6)

    await w.get('[data-testid="youtube-channel-filter"]').setValue('999')
    expect(w.get('[data-testid="youtube-channel-no-match"]').text()).toContain('youtube.channels.noMatch:{"query":"999"}')
  })

  it('voltar sai para a lista de canais; entrar de novo usa o cache e limpa a busca', async () => {
    const w = mountView()
    await openCpb(w)
    await flushPromises()
    await w.get('[data-testid="youtube-channel-filter"]').setValue('graca')

    await w.get('[aria-label="youtube.channels.backToChannels"]').trigger('click')
    expect(w.findAll('[data-testid="youtube-channel-card"]')).toHaveLength(1)

    await w.get('[data-testid="youtube-channel-card"] .yt-card__btn--primary').trigger('click')
    await flushPromises()
    expect(titles(w)).toHaveLength(12)
    expect((w.get('[data-testid="youtube-channel-filter"]').element as HTMLInputElement).value).toBe('')
    expect(mocks.fetchPlaylist).not.toHaveBeenCalled()
  })

  it('minimizar e reabrir volta para a lista do canal', async () => {
    const w = mountView()
    await openCpb(w)
    await flushPromises()
    const snapshot = mocks.capture?.()
    expect(snapshot).toMatchObject({ tab: 'channels', openChannelId: 'cpb', openPlaylistId: null })
    w.unmount()
    wrapper = null

    mocks.restored = snapshot ?? null
    const reopened = mountView()
    await flushPromises()
    expect(titles(reopened)).toHaveLength(12)
  })
})
