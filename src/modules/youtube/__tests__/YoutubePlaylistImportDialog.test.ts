// @vitest-environment jsdom
/**
 * "Coletânea a partir de uma playlist": colar o link (no campo ou pelo botão "Colar")
 * já lê a playlist, sem precisar clicar em Continuar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({ fetchPlaylist: vi.fn() }))

vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('../services/youtube-player', () => ({ fetchYoutubePlaylist: (text: string) => mocks.fetchPlaylist(text) }))

import YoutubePlaylistImportDialog from '../components/YoutubePlaylistImportDialog.vue'

const LINK = 'https://www.youtube.com/playlist?list=PLAPpcKnpMfeO9Fydpl1tTKC9CRRnIMMSK'
const item = { videoId: 'AAAAAAAAAAA', title: 'Hino 1', channel: 'CPB', durationText: '', viewsText: '', publishedText: '', thumbnail: '', live: false }

let wrapper: VueWrapper | null = null

async function mountOpen() {
  wrapper = mount(YoutubePlaylistImportDialog, { props: { open: false } })
  await wrapper.setProps({ open: true })
  return wrapper
}

function paste(w: VueWrapper, text: string) {
  const event = new Event('paste', { cancelable: true }) as Event & { clipboardData: { getData: () => string } }
  event.clipboardData = { getData: () => text }
  w.get('[data-testid="youtube-playlist-url"]').element.dispatchEvent(event)
  return event
}

beforeEach(() => {
  mocks.fetchPlaylist.mockReset()
  mocks.fetchPlaylist.mockResolvedValue({ title: 'Novo Hinário 1-100', items: [item] })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

describe('YoutubePlaylistImportDialog — colar e ler sozinho', () => {
  it('colar o link no campo lê a playlist e vai para o nome', async () => {
    const w = await mountOpen()
    const event = paste(w, ` ${LINK} `)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(mocks.fetchPlaylist).toHaveBeenCalledWith(LINK)
    expect((w.get('input').element as HTMLInputElement).value).toBe('Novo Hinário 1-100')
  })

  it('colar texto que não é playlist só cola', async () => {
    const w = await mountOpen()
    const event = paste(w, 'hinos de natal')
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    expect(mocks.fetchPlaylist).not.toHaveBeenCalled()
  })

  it('o botão "Colar" com link de playlist também lê sozinho', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { readText: async () => LINK } })
    const w = await mountOpen()
    await w.get('button[title="youtube.playlist.paste"]').trigger('click')
    await flushPromises()
    expect(mocks.fetchPlaylist).toHaveBeenCalledWith(LINK)
  })

  it('o botão "Colar" com outro texto só preenche', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { readText: async () => 'qualquer coisa' } })
    const w = await mountOpen()
    await w.get('button[title="youtube.playlist.paste"]').trigger('click')
    await flushPromises()
    expect(mocks.fetchPlaylist).not.toHaveBeenCalled()
    expect((w.get('[data-testid="youtube-playlist-url"]').element as HTMLInputElement).value).toBe('qualquer coisa')
  })
})
