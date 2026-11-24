// @vitest-environment jsdom
/**
 * YoutubeView — canais cadastrados pelo operador: cola o link do canal, o app lê
 * as playlists (categorias); entrar no canal mostra as playlists, e cada uma abre
 * os vídeos. Dá para buscar playlist, salvar a playlist como coletânea e excluir o canal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

import type { YoutubeChannelResult, YoutubeChannelSearchItem, YoutubePlaylistResult, YoutubeSearchItem } from '@shared/types/desktop-bridge'

const mocks = vi.hoisted(() => ({
  fetchPlaylist: vi.fn(),
  fetchChannel: vi.fn(),
  searchChannels: vi.fn(),
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
vi.mock('@shared/components/AppConfirm.vue', () => ({
  default: {
    name: 'AppConfirm',
    props: ['open', 'title', 'message', 'confirmLabel', 'cancelLabel', 'danger'],
    emits: ['confirm', 'cancel'],
    template: `<div v-if="open" class="confirm-stub" :data-title="title"><button class="confirm-ok" @click="$emit('confirm')" /><button class="confirm-cancel" @click="$emit('cancel')" /></div>`,
  },
}))
vi.mock('../components/YoutubeStorageChip.vue', () => ({ default: { template: '<span />' } }))
vi.mock('../services/youtube-player', async (original) => ({
  ...await original<typeof import('../services/youtube-player')>(),
  isYoutubeSearchAvailable: () => true,
  fetchYoutubePlaylist: (text: string) => mocks.fetchPlaylist(text),
}))

import { CPB_CHANNEL, listYoutubeChannels } from '../services/youtube-channels'
import { listYoutubeCollections } from '../services/youtube-collections'
import YoutubeView from '../views/YoutubeView.vue'

const ARAUTOS = 'UCaaaaaaaaaaaaaaaaaaaaaa'

/** Id da playlist a partir do título: o cache de playlists é do app inteiro, então cada teste usa ids próprios. */
function plId(title: string): string {
  return `PLarautos${title.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').padEnd(8, '0')}`
}

function channelResult(names = ['Hinos de Natal', 'Louvores Antigos', 'Ao Vivo']): YoutubeChannelResult {
  return {
    channel: { id: ARAUTOS, name: 'Arautos do Rei', url: 'https://www.youtube.com/@arautos', avatar: 'https://yt3.googleusercontent.com/a' },
    playlists: names.map((title, i) => ({ id: plId(title), title, thumbnail: `https://i.ytimg.com/vi/cover${i}/hqdefault.jpg`, videoCount: 10 + i })),
  }
}

function video(videoId: string, title: string): YoutubeSearchItem {
  return { videoId, title, channel: 'Arautos do Rei', durationText: '3:10', viewsText: '', publishedText: '', thumbnail: '', live: false }
}

let wrapper: VueWrapper | null = null

function mountView() {
  wrapper = mount(YoutubeView)
  return wrapper
}

async function openChannels(w: VueWrapper) {
  await w.get('[data-testid="youtube-open-channels"]').trigger('click')
}

async function addChannel(w: VueWrapper, text: string) {
  await w.get('[data-testid="youtube-channel-add-input"]').setValue(text)
  await w.get('[data-testid="youtube-channel-add"]').trigger('submit')
  await flushPromises()
}

function playlistTitles(w: VueWrapper): string[] {
  return w.findAll('[data-testid="youtube-channel-playlist"] .yt-card__title').map((n) => n.text())
}

beforeEach(() => {
  localStorage.clear()
  mocks.fetchPlaylist.mockReset()
  mocks.fetchChannel.mockReset()
  mocks.searchChannels.mockReset()
  mocks.restored = null
  ;(window as unknown as { louvorja: unknown }).louvorja = {
    ytSearch: { channel: (text: string) => mocks.fetchChannel(text), channels: (query: string) => mocks.searchChannels(query) },
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  delete (window as unknown as { louvorja?: unknown }).louvorja
})

describe('YoutubeView — cadastrar canal', () => {
  it('cola o link, cadastra, abre o canal com as playlists (categorias) e o card fica salvo', async () => {
    mocks.fetchChannel.mockResolvedValue(channelResult())
    const w = mountView()
    await openChannels(w)
    expect(w.findAll('[data-testid="youtube-channel-card"]')).toHaveLength(1)

    await addChannel(w, ' https://www.youtube.com/@arautos ')

    expect(mocks.fetchChannel).toHaveBeenCalledWith('https://www.youtube.com/@arautos')
    expect(w.text()).toContain('youtube.channels.added:{"name":"Arautos do Rei"}')
    expect(w.get('.yt-col__name').text()).toBe('Arautos do Rei')
    expect(playlistTitles(w)).toEqual(['Hinos de Natal', 'Louvores Antigos', 'Ao Vivo'])
    expect(w.get('[data-testid="youtube-channel-playlist"] .yt-card__meta').text()).toBe('youtube.collections.videoCount:{"n":10}')
    expect(w.get('[data-testid="youtube-channel-playlist"] img').attributes('src')).toBe('https://i.ytimg.com/vi/cover0/hqdefault.jpg')
    expect(listYoutubeChannels().map((c) => c.id)).toEqual(['cpb', ARAUTOS])

    await w.get('[aria-label="youtube.channels.backToChannels"]').trigger('click')
    const cards = w.findAll('[data-testid="youtube-channel-card"]')
    expect(cards).toHaveLength(2)
    expect(cards[1].text()).toContain('youtube.channels.playlistCount:{"n":3}')
    expect(cards[1].findAll('.yt-col__mosaic img')).toHaveLength(3)
    // o padrão não tem excluir; o cadastrado tem
    expect(cards[0].find('[data-testid="youtube-channel-delete"]').exists()).toBe(false)
    expect(cards[1].find('[data-testid="youtube-channel-delete"]').exists()).toBe(true)
  })

  it('link que não é de canal, canal sem playlists e falha de rede mostram o aviso certo e não cadastram', async () => {
    const w = mountView()
    await openChannels(w)

    mocks.fetchChannel.mockResolvedValueOnce({ channel: null, playlists: [], error: 'invalid' })
    await addChannel(w, 'https://www.youtube.com/watch?v=AAAAAAAAAAA')
    expect(w.get('[data-testid="youtube-channel-add-error"]').text()).toContain('youtube.channels.addInvalid')

    mocks.fetchChannel.mockResolvedValueOnce({ ...channelResult([]), error: 'empty' })
    await addChannel(w, '@arautos')
    expect(w.get('[data-testid="youtube-channel-add-error"]').text()).toContain('youtube.channels.addEmpty')

    mocks.fetchChannel.mockResolvedValueOnce({ channel: null, playlists: [], error: 'network' })
    await addChannel(w, '@arautos')
    expect(w.get('[data-testid="youtube-channel-add-error"]').text()).toContain('youtube.channels.addError')
    // o texto fica para tentar de novo
    expect((w.get('[data-testid="youtube-channel-add-input"]').element as HTMLInputElement).value).toBe('@arautos')
    expect(listYoutubeChannels()).toHaveLength(1)

    // dando certo, o aviso some
    mocks.fetchChannel.mockResolvedValueOnce(channelResult())
    await addChannel(w, '@arautos')
    await w.get('[aria-label="youtube.channels.backToChannels"]').trigger('click')
    expect(w.find('[data-testid="youtube-channel-add-error"]').exists()).toBe(false)
  })

  it('cadastrar o canal da CPB avisa que ele já vem no app e abre a lista de hinos', async () => {
    mocks.fetchChannel.mockResolvedValue({ ...channelResult(), channel: { id: CPB_CHANNEL.youtubeId!, name: CPB_CHANNEL.name, url: CPB_CHANNEL.url, avatar: '' } })
    mocks.fetchPlaylist.mockResolvedValue({ title: '', items: [video('AAAAAAAAAAA', 'Hino 1')] })
    const w = mountView()
    await openChannels(w)
    await addChannel(w, '@casapublicadora')
    expect(w.text()).toContain('youtube.channels.alreadyDefault:{"name":"Casa Publicadora Brasileira"}')
    expect(listYoutubeChannels()).toHaveLength(1)
    expect(w.findAll('[data-testid="youtube-channel-playlist"]')).toHaveLength(0)
  })

  it('colar um link de canal cadastra na hora, sem clicar', async () => {
    mocks.fetchChannel.mockResolvedValue(channelResult())
    const w = mountView()
    await openChannels(w)
    const input = w.get('[data-testid="youtube-channel-add-input"]')
    const event = new Event('paste', { cancelable: true }) as Event & { clipboardData: { getData: () => string } }
    event.clipboardData = { getData: () => ' https://www.youtube.com/@arautos ' }
    input.element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(mocks.fetchChannel).toHaveBeenCalledWith('https://www.youtube.com/@arautos')
    expect(w.get('.yt-col__name').text()).toBe('Arautos do Rei')
  })

  it('colar texto que não é link de canal só cola (não cadastra)', async () => {
    const w = mountView()
    await openChannels(w)
    const event = new Event('paste', { cancelable: true }) as Event & { clipboardData: { getData: () => string } }
    event.clipboardData = { getData: () => 'arautos do rei' }
    w.get('[data-testid="youtube-channel-add-input"]').element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    expect(mocks.fetchChannel).not.toHaveBeenCalled()
  })

  it('o botão de cadastrar só liga com texto', async () => {
    const w = mountView()
    await openChannels(w)
    expect(w.get('[data-testid="youtube-channel-add"]').attributes('disabled')).toBeDefined()
    await w.get('[data-testid="youtube-channel-add"]').trigger('submit')
    expect(mocks.fetchChannel).not.toHaveBeenCalled()
  })
})

describe('YoutubeView — canal cadastrado (playlists)', () => {
  async function mountWithArautos(names?: string[]) {
    mocks.fetchChannel.mockResolvedValue(channelResult(names))
    const w = mountView()
    await openChannels(w)
    await addChannel(w, '@arautos')
    return w
  }

  it('ao abrir, relê as playlists no YouTube e atualiza a lista salva', async () => {
    const w = await mountWithArautos()
    await w.get('[aria-label="youtube.channels.backToChannels"]').trigger('click')
    mocks.fetchChannel.mockResolvedValue(channelResult(['Hinos de Natal', 'Louvores Antigos', 'Ao Vivo', 'Novo Álbum']))

    await w.findAll('[data-testid="youtube-channel-card"]')[1].get('.yt-col__cover').trigger('click')
    await flushPromises()
    expect(mocks.fetchChannel).toHaveBeenLastCalledWith('https://www.youtube.com/@arautos')
    expect(playlistTitles(w)).toEqual(['Hinos de Natal', 'Louvores Antigos', 'Ao Vivo', 'Novo Álbum'])
    expect(listYoutubeChannels()[1].playlists).toHaveLength(4)
  })

  it('sem internet ao abrir, continua com as playlists salvas', async () => {
    const w = await mountWithArautos()
    await w.get('[aria-label="youtube.channels.backToChannels"]').trigger('click')
    mocks.fetchChannel.mockResolvedValue({ channel: null, playlists: [], error: 'network' })
    await w.findAll('[data-testid="youtube-channel-card"]')[1].get('.yt-card__btn--primary').trigger('click')
    await flushPromises()
    expect(playlistTitles(w)).toEqual(['Hinos de Natal', 'Louvores Antigos', 'Ao Vivo'])
  })

  it('busca playlist pelo nome (sem acento); sem resultado avisa', async () => {
    const w = await mountWithArautos()
    await w.get('[data-testid="youtube-channel-playlist-filter"]').setValue('louvores antigos')
    expect(playlistTitles(w)).toEqual(['Louvores Antigos'])
    await w.get('[data-testid="youtube-channel-playlist-filter"]').setValue('natal')
    expect(playlistTitles(w)).toEqual(['Hinos de Natal'])
    await w.get('[data-testid="youtube-channel-playlist-filter"]').setValue('xyz')
    expect(w.get('[data-testid="youtube-channel-playlist-no-match"]').text()).toContain('youtube.channels.noPlaylistMatch:{"query":"xyz"}')
  })

  it('abrir a playlist lê os vídeos; falha mostra erro e "Tentar de novo" busca outra vez', async () => {
    const w = await mountWithArautos()
    let resolve: (r: YoutubePlaylistResult) => void = () => {}
    mocks.fetchPlaylist
      .mockResolvedValueOnce({ title: '', items: [], error: 'network' })
      .mockImplementationOnce(() => new Promise<YoutubePlaylistResult>((r) => { resolve = r }))

    await w.findAll('[data-testid="youtube-channel-playlist"]')[1].get('.yt-card__btn--primary').trigger('click')
    await flushPromises()
    expect(mocks.fetchPlaylist).toHaveBeenCalledWith(plId('Louvores Antigos'))
    expect(w.get('[data-testid="youtube-channel-error"]').text()).toContain('youtube.channels.error')
    expect(w.get('[data-testid="youtube-channel-save-collection"]').attributes('disabled')).toBeDefined()

    await w.get('[data-testid="youtube-channel-error"] button').trigger('click')
    expect(w.find('[data-testid="youtube-channel-loading"]').exists()).toBe(true)
    resolve({ title: '', items: [video('AAAAAAAAAAA', 'Castelo Forte'), video('BBBBBBBBBBB', 'Graça Excelsa')] })
    await flushPromises()

    expect(w.findAll('[data-testid="youtube-channel-video"] .yt-card__title').map((n) => n.text())).toEqual(['Castelo Forte', 'Graça Excelsa'])
    expect(w.get('.yt-col__name').text()).toBe('Louvores Antigos')
    expect(mocks.describe?.().summary).toBe('Louvores Antigos')

    // filtro de vídeos dentro da playlist
    await w.get('[data-testid="youtube-channel-filter"]').setValue('graca')
    expect(w.findAll('[data-testid="youtube-channel-video"]')).toHaveLength(1)

    // voltar e abrir de novo: vem do cache
    await w.get('[aria-label="youtube.channels.backToPlaylists"]').trigger('click')
    expect(playlistTitles(w)).toHaveLength(3)
    await w.findAll('[data-testid="youtube-channel-playlist"]')[1].get('.yt-col__cover').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-testid="youtube-channel-video"]')).toHaveLength(2)
    expect(mocks.fetchPlaylist).toHaveBeenCalledTimes(2)
  })

  it('playlist vazia mostra o aviso de vazia', async () => {
    const w = await mountWithArautos(['Vazia'])
    mocks.fetchPlaylist.mockResolvedValueOnce({ title: '', items: [] })
    await w.get('[data-testid="youtube-channel-playlist"] .yt-col__cover').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="youtube-channel-error"]').text()).toContain('youtube.channels.empty')
  })

  it('"Salvar como coletânea" cria a coletânea com o nome e os vídeos da playlist e vai para Coletâneas', async () => {
    const w = await mountWithArautos(['Natal 2', 'Natal 3'])
    mocks.fetchPlaylist.mockResolvedValueOnce({ title: '', items: [video('CCCCCCCCCCC', 'Um'), video('DDDDDDDDDDD', 'Dois')] })
    await w.findAll('[data-testid="youtube-channel-playlist"]')[1].get('.yt-col__cover').trigger('click')
    await flushPromises()

    await w.get('[data-testid="youtube-channel-save-collection"]').trigger('click')

    const [saved] = listYoutubeCollections()
    expect(saved.name).toBe('Natal 3')
    expect(saved.videos.map((v) => v.videoId)).toEqual(['CCCCCCCCCCC', 'DDDDDDDDDDD'])
    expect(w.get('[data-testid="youtube-open-collections"]').classes()).toContain('is-active')
  })

  it('excluir pelo card pede confirmação; cancelar mantém, confirmar remove', async () => {
    const w = await mountWithArautos()
    await w.get('[aria-label="youtube.channels.backToChannels"]').trigger('click')
    await w.get('[data-testid="youtube-channel-delete"]').trigger('click')
    expect(w.get('.confirm-stub').attributes('data-title')).toBe('youtube.channels.deleteTitle:{"name":"Arautos do Rei"}')
    await w.get('.confirm-cancel').trigger('click')
    expect(w.findAll('[data-testid="youtube-channel-card"]')).toHaveLength(2)

    await w.get('[data-testid="youtube-channel-delete"]').trigger('click')
    await w.get('.confirm-ok').trigger('click')
    expect(w.findAll('[data-testid="youtube-channel-card"]')).toHaveLength(1)
    expect(listYoutubeChannels()).toHaveLength(1)
  })

  it('excluir de dentro do canal volta para a lista de canais', async () => {
    const w = await mountWithArautos()
    await w.get('[data-testid="youtube-channel-delete-open"]').trigger('click')
    await w.get('.confirm-ok').trigger('click')
    expect(w.find('.yt-col__name').exists()).toBe(false)
    expect(w.findAll('[data-testid="youtube-channel-card"]')).toHaveLength(1)
  })

  it('minimizar guarda canal e playlist abertos; reabrir volta para a mesma playlist', async () => {
    const w = await mountWithArautos()
    mocks.fetchPlaylist.mockResolvedValue({ title: '', items: [video('EEEEEEEEEEE', 'Hino')] })
    expect(mocks.describe?.().summary).toBe('Arautos do Rei')
    await w.findAll('[data-testid="youtube-channel-playlist"]')[2].get('.yt-col__cover').trigger('click')
    await flushPromises()
    const snapshot = mocks.capture?.()
    expect(snapshot).toMatchObject({ tab: 'channels', openChannelId: ARAUTOS, openPlaylistId: plId('Ao Vivo') })
    w.unmount()
    wrapper = null

    mocks.restored = snapshot ?? null
    const reopened = mountView()
    await flushPromises()
    expect(reopened.get('.yt-col__name').text()).toBe('Ao Vivo')
    expect(reopened.findAll('[data-testid="youtube-channel-video"]')).toHaveLength(1)
  })

  it('snapshot antigo (sem canal) reabre na lista de canais', async () => {
    mocks.restored = { tab: 'channels', query: '', lastQuery: '', results: [], continuation: null, historyFilter: '', openCollectionId: null }
    const w = mountView()
    await flushPromises()
    expect(w.findAll('[data-testid="youtube-channel-card"]')).toHaveLength(1)
    expect(mocks.describe?.().summary).toBe('youtube.channels.title')
  })
})

describe('YoutubeView — pesquisar canais adventistas', () => {
  function found(id: string, name: string, extra: Partial<YoutubeChannelSearchItem> = {}): YoutubeChannelSearchItem {
    return { id, name, handle: '@canal', subscribers: '12 mil inscritos', avatar: 'https://yt3.ggpht.com/a', description: 'Louvores adventistas', url: `https://www.youtube.com/channel/${id}`, ...extra }
  }

  async function search(w: VueWrapper, text: string) {
    await w.get('[data-testid="youtube-channel-search-input"]').setValue(text)
    await w.get('[data-testid="youtube-channel-search"]').trigger('submit')
  }

  it('pesquisa pelo tema, lista os canais e cadastra o escolhido (que fica marcado como cadastrado)', async () => {
    mocks.searchChannels.mockResolvedValue({ items: [
      found(ARAUTOS, 'Arautos do Rei', { handle: '@arautos' }),
      found(CPB_CHANNEL.youtubeId!, 'Casa Publicadora Brasileira'),
      found('UCbbbbbbbbbbbbbbbbbbbbbb', 'Sem foto', { avatar: '', handle: '', description: '' }),
    ] })
    mocks.fetchChannel.mockResolvedValue(channelResult())
    const w = mountView()
    await openChannels(w)
    await search(w, ' louvor ')
    await flushPromises()

    expect(mocks.searchChannels).toHaveBeenCalledWith('louvor')
    expect(w.get('[data-testid="youtube-channel-results"] h3').text()).toBe('youtube.channels.searchTitle:{"query":"louvor"}')
    const rows = w.findAll('[data-testid="youtube-channel-result"]')
    expect(rows.map((r) => r.get('.yt-card__title').text())).toEqual(['Arautos do Rei', 'Casa Publicadora Brasileira', 'Sem foto'])
    expect(rows[0].text()).toContain('@arautos · 12 mil inscritos')
    expect(rows[0].text()).toContain('Louvores adventistas')
    expect(rows[2].find('img').exists()).toBe(false)
    // a CPB já vem no app
    expect(rows[1].get('[data-testid="youtube-channel-result-open"]').text()).toContain('youtube.channels.builtIn')

    await rows[0].get('[data-testid="youtube-channel-result-add"]').trigger('click')
    await flushPromises()
    expect(mocks.fetchChannel).toHaveBeenCalledWith(`https://www.youtube.com/channel/${ARAUTOS}`)
    expect(w.get('.yt-col__name').text()).toBe('Arautos do Rei')

    // voltando, a pesquisa continua e o canal aparece como cadastrado
    await w.get('[aria-label="youtube.channels.backToChannels"]').trigger('click')
    const again = w.findAll('[data-testid="youtube-channel-result"]')
    expect(again[0].get('[data-testid="youtube-channel-result-open"]').text()).toContain('youtube.channels.registered')
    await again[0].get('[data-testid="youtube-channel-result-open"]').trigger('click')
    expect(w.get('.yt-col__name').text()).toBe('Arautos do Rei')
  })

  it('cadastrar pela pesquisa com falha mostra o aviso e não sai da lista', async () => {
    mocks.searchChannels.mockResolvedValue({ items: [found(ARAUTOS, 'Arautos do Rei')] })
    mocks.fetchChannel.mockResolvedValue({ channel: null, playlists: [], error: 'network' })
    const w = mountView()
    await openChannels(w)
    await search(w, 'louvor')
    await flushPromises()
    await w.get('[data-testid="youtube-channel-result-add"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="youtube-channel-add-error"]').text()).toContain('youtube.channels.addError')
    expect(w.findAll('[data-testid="youtube-channel-result"]')).toHaveLength(1)
  })

  it('nada achado, falha de rede e fechar a pesquisa', async () => {
    const w = mountView()
    await openChannels(w)

    mocks.searchChannels.mockResolvedValueOnce({ items: [], error: 'empty' })
    await search(w, 'xyz')
    await flushPromises()
    expect(w.get('[data-testid="youtube-channel-search-error"]').text()).toBe('youtube.channels.searchEmpty:{"query":"xyz"}')

    mocks.searchChannels.mockResolvedValueOnce({ items: [], error: 'network' })
    await search(w, 'louvor')
    await flushPromises()
    expect(w.get('[data-testid="youtube-channel-search-error"]').text()).toContain('youtube.channels.searchError')

    await w.get('[data-testid="youtube-channel-search-close"]').trigger('click')
    expect(w.find('[data-testid="youtube-channel-results"]').exists()).toBe(false)
  })

  it('uma pesquisa nova descarta a resposta atrasada da anterior', async () => {
    let first: (r: { items: YoutubeChannelSearchItem[] }) => void = () => {}
    mocks.searchChannels
      .mockImplementationOnce(() => new Promise((r) => { first = r }))
      .mockResolvedValueOnce({ items: [found('UCbbbbbbbbbbbbbbbbbbbbbb', 'Jovens Adventistas')] })
    const w = mountView()
    await openChannels(w)
    await search(w, 'louvor')
    expect(w.find('[data-testid="youtube-channel-searching"]').exists()).toBe(true)
    await search(w, 'jovens')
    await flushPromises()
    first({ items: [found(ARAUTOS, 'Resposta velha')] })
    await flushPromises()
    expect(w.findAll('[data-testid="youtube-channel-result"] .yt-card__title').map((n) => n.text())).toEqual(['Jovens Adventistas'])
  })

  it('o botão de pesquisar só liga com texto', async () => {
    const w = mountView()
    await openChannels(w)
    expect(w.get('[data-testid="youtube-channel-search"]').attributes('disabled')).toBeDefined()
    await w.get('[data-testid="youtube-channel-search"]').trigger('submit')
    expect(mocks.searchChannels).not.toHaveBeenCalled()
  })
})
