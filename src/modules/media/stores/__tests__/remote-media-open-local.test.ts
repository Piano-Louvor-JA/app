// @vitest-environment jsdom
// app#331 (achado do crítico): TV Palco (controle remoto) tocando música
// LOCAL do item de liturgia importado — media.open aceita id negativo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { loadMediaTrackMock, fetchMock, authSessionMock } = vi.hoisted(() => ({
  loadMediaTrackMock: vi.fn(),
  fetchMock: vi.fn(),
  authSessionMock: vi.fn<() => unknown>(() => null),
}))

vi.mock('@modules/media/services/media-catalog', () => ({
  loadMediaTrack: loadMediaTrackMock,
  resolveAlbumSubtitle: () => '',
}))
vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: authSessionMock,
  authHeaders: () => ({}),
}))
vi.stubGlobal('fetch', fetchMock)

import { useMediaStore } from '@modules/media/stores/useMediaStore'
import {
  createLocalCollection,
  createLocalMusic,
  createLocalLyric,
  updateLocalMusic,
} from '@modules/media/services/local-custom-store'

describe('TV Palco → media.open com música local (app#331)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new Error('REDE BLOQUEADA no teste'))
    loadMediaTrackMock.mockReset()
    loadMediaTrackMock.mockRejectedValue(new Error('catálogo oficial NÃO'))
    authSessionMock.mockReset()
    authSessionMock.mockReturnValue(null)
  })

  it('store.open aceita o id local que o remote repassa (paridade com liturgia)', async () => {
    const collection = createLocalCollection('Importações .slja')
    const music = createLocalMusic(collection.id, { name: 'Local da TV' })
    createLocalLyric(music.id, { lyric: 'Verso', time: '00:00:03', order: 1 })
    updateLocalMusic(music.id, { audioBase64: 'AQID', audioName: 'a.mp3' })

    const store = useMediaStore()
    // exatamente o que module-handlers 'media.open' faz depois do guard
    const result = await store.open({ musicId: music.id, mode: 'audio' })
    expect(result.ok).toBe(true)
    expect(store.session?.title).toBe('Local da TV')
    store.close()
  })
})
