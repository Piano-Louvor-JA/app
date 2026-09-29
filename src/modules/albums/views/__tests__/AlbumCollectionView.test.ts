// Testes AlbumCollectionView — mount, load, playlist picker, runAction, goBack
// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { ref } from 'vue'

// Mocks das dependências ANTES do import do componente
const mockUseAlbums = {
  activeCollection: ref<null | { id: string | number; name: string; kind: string; coverUrl?: string }>(null),
  filteredTracks: ref<Array<{ musicId: number; name: string; track: number | null; durationLabel: string; hasInstrumental: boolean }>>([]),
  searchQuery: ref(''),
  isLoadingTracks: ref(false),
  lastErrorKey: ref(''),
  lastActionMessageKey: ref(''),
  lyricOpen: ref(false),
  lyricDoc: ref(null),
  isLoadingLyric: ref(false),
  openCollection: vi.fn(async () => {}),
  clearError: vi.fn(),
  clearActionMessage: vi.fn(),
  playSung: vi.fn(async () => true),
  playInstrumental: vi.fn(async () => true),
  playSlides: vi.fn(async () => true),
  playAllInActiveCollection: vi.fn(async () => {}),
  openLyric: vi.fn(async () => {}),
  closeLyric: vi.fn(),
}

vi.mock('../../composables/useAlbums', () => ({
  useAlbums: () => mockUseAlbums,
}))

vi.mock('../../services/playlist-storage', () => ({
  listPlaylists: vi.fn(() => [
    { id: 'pl-1', name: 'Preferidas', items: [{ musicId: 1 }] },
    { id: 'pl-2', name: 'Culto', items: [] },
  ]),
  addPlaylistItem: vi.fn(() => ({ added: true })),
}))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { collectionId: 'col-10' } }),
  useRouter: () => ({ push: routerPush }),
}))

vi.mock('@design-system/index', () => ({
  MediaCollectionList: {
    props: ['searchPlaceholder', 'loading', 'empty'],
    template: '<div class="mcl-stub"><slot /></div>',
  },
}))

vi.mock('../../components/AlbumLyricDialog.vue', () => ({
  default: { template: '<div class="lyric-dialog-stub" />' },
}))
vi.mock('../../components/AlbumTrackRow.vue', () => ({
  default: {
    props: ['track', 'collectionName', 'artworkUrl', 'busy'],
    emits: ['sung', 'instrumental', 'slides', 'lyric', 'playlist'],
    template: `<div class="track-row-stub" :data-id="track.musicId" :data-busy="String(busy)">
      <button class="row-sung" @click="$emit('sung')" />
      <button class="row-instrumental" @click="$emit('instrumental')" />
      <button class="row-slides" @click="$emit('slides')" />
      <button class="row-lyric" @click="$emit('lyric')" />
      <button class="row-playlist" @click="$emit('playlist')" />
    </div>`,
  },
}))

import AlbumCollectionView from '../AlbumCollectionView.vue'
import { addPlaylistItem } from '../../services/playlist-storage'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      albums: {
        collectionFallback: 'Coletânea',
        back: 'Voltar',
        playAll: 'Tocar todas',
        dismiss: 'Dispensar',
        retry: 'Tentar de novo',
        searchPlaceholder: 'Buscar',
        clearSearch: 'Limpar',
        columns: { number: 'N', title: 'Título', duration: 'Duração', actions: 'Ações' },
        loading: 'Carregando…',
        messages: { searchEmpty: 'nada na busca', tracksEmpty: 'sem faixas' },
      },
    },
  },
})

function createWrapper() {
  return mount(AlbumCollectionView, {
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('AlbumCollectionView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAlbums.activeCollection.value = null
    mockUseAlbums.filteredTracks.value = []
    mockUseAlbums.lastErrorKey.value = ''
    mockUseAlbums.lastActionMessageKey.value = ''
    document.body.innerHTML = ''
  })

  it('monta e carrega a coleção via openCollection com o id da rota', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(mockUseAlbums.clearError).toHaveBeenCalled()
    expect(mockUseAlbums.openCollection).toHaveBeenCalledWith('col-10')
    wrapper.unmount()
  })

  it('title usa activeCollection.name quando existe', async () => {
    mockUseAlbums.activeCollection.value = { id: 10, name: 'Hinário Antigo', kind: 'hymnal' }
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('.album-collection-view__title').text()).toBe('Hinário Antigo')
    wrapper.unmount()
  })

  it('title cai no fallback quando não há coleção ativa', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('.album-collection-view__title').text()).toBe('Coletânea')
    wrapper.unmount()
  })

  it('ícone muda por kind: hymnal → ti-book, album → ti-disc', async () => {
    mockUseAlbums.activeCollection.value = { id: 1, name: 'X', kind: 'hymnal' }
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('.album-collection-view__icon .ti-book').exists()).toBe(true)
    wrapper.unmount()

    mockUseAlbums.activeCollection.value = { id: 2, name: 'Y', kind: 'album' }
    const wrapper2 = createWrapper()
    await flushPromises()
    expect(wrapper2.find('.album-collection-view__icon .ti-disc').exists()).toBe(true)
    wrapper2.unmount()
  })

  it('goBack empurra rota albums', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.album-collection-view__back').trigger('click')
    expect(routerPush).toHaveBeenCalledWith({ name: 'albums' })
    wrapper.unmount()
  })

  it('botão play-all só aparece para não-hymnal com faixas; clique chama playAllInActiveCollection', async () => {
    mockUseAlbums.activeCollection.value = { id: 2, name: 'Y', kind: 'album' }
    mockUseAlbums.filteredTracks.value = [
      { musicId: 1, name: 'A', track: 1, durationLabel: '1:00', hasInstrumental: false },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    const playAll = wrapper.find('.album-collection-view__play-all')
    expect(playAll.exists()).toBe(true)
    await playAll.trigger('click')
    expect(mockUseAlbums.playAllInActiveCollection).toHaveBeenCalledOnce()
    wrapper.unmount()

    // hymnal esconde
    mockUseAlbums.activeCollection.value = { id: 1, name: 'X', kind: 'hymnal' }
    const wrapper2 = createWrapper()
    await flushPromises()
    expect(wrapper2.find('.album-collection-view__play-all').exists()).toBe(false)
    wrapper2.unmount()
  })

  it('alerta de ação aparece com lastActionMessageKey fora de media.messages; botão limpa', async () => {
    mockUseAlbums.lastActionMessageKey.value = 'albums.messages.added'
    const wrapper = createWrapper()
    await flushPromises()
    const alerts = wrapper.findAll('.album-collection-view__alert')
    expect(alerts.length).toBe(1)
    await alerts[0].find('button').trigger('click')
    expect(mockUseAlbums.clearActionMessage).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('lastActionMessageKey de media.messages NÃO mostra alerta', async () => {
    mockUseAlbums.lastActionMessageKey.value = 'media.messages.played'
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('.album-collection-view__alert').exists()).toBe(false)
    wrapper.unmount()
  })

  it('alerta de erro mostra botão retry que recarrega', async () => {
    mockUseAlbums.lastErrorKey.value = 'albums.errors.load'
    const wrapper = createWrapper()
    await flushPromises()
    mockUseAlbums.openCollection.mockClear()
    const alerts = wrapper.findAll('.album-collection-view__alert')
    expect(alerts.length).toBe(1)
    await alerts[0].find('button').trigger('click')
    await flushPromises()
    expect(mockUseAlbums.openCollection).toHaveBeenCalledWith('col-10')
    wrapper.unmount()
  })

  it('runAction: emissão sung marca busy e desmarca no fim', async () => {
    mockUseAlbums.filteredTracks.value = [
      { musicId: 7, name: 'Hino 7', track: 1, durationLabel: '2:00', hasInstrumental: true },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    const row = wrapper.find('.track-row-stub')
    await row.find('.row-sung').trigger('click')
    await flushPromises()
    expect(mockUseAlbums.playSung).toHaveBeenCalledWith(7)
    expect(row.attributes('data-busy')).toBe('false') // liberado após ação
    wrapper.unmount()
  })

  it('runAction cobre instrumental, slides e lyric', async () => {
    mockUseAlbums.filteredTracks.value = [
      { musicId: 8, name: 'Hino 8', track: 1, durationLabel: '2:00', hasInstrumental: true },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    const row = wrapper.find('.track-row-stub')
    await row.find('.row-instrumental').trigger('click')
    await row.find('.row-slides').trigger('click')
    await row.find('.row-lyric').trigger('click')
    await flushPromises()
    expect(mockUseAlbums.playInstrumental).toHaveBeenCalledWith(8)
    expect(mockUseAlbums.playSlides).toHaveBeenCalledWith(8)
    expect(mockUseAlbums.openLyric).toHaveBeenCalledWith(8)
    wrapper.unmount()
  })

  it('playlist picker abre com dados da faixa e coleção ativa', async () => {
    mockUseAlbums.activeCollection.value = { id: 55, name: 'Coletânea X', kind: 'album' }
    mockUseAlbums.filteredTracks.value = [
      { musicId: 9, name: 'Hino 9', track: 1, durationLabel: '1:30', hasInstrumental: false },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.row-playlist').trigger('click')
    await flushPromises()
    const picker = document.body.querySelector('.playlist-picker')
    expect(picker).toBeTruthy()
    expect(picker?.textContent).toContain('Hino 9')
    wrapper.unmount()
  })

  it('addToPlaylist com sucesso: mostra toast com nome da playlist', async () => {
    mockUseAlbums.activeCollection.value = { id: 55, name: 'Coletânea X', kind: 'album' }
    mockUseAlbums.filteredTracks.value = [
      { musicId: 9, name: 'Hino 9', track: 1, durationLabel: '1:30', hasInstrumental: false },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.row-playlist').trigger('click')
    await flushPromises()
    const options = document.body.querySelectorAll('.playlist-picker__option')
    ;(options[0] as HTMLButtonElement).click()
    await flushPromises()
    expect(addPlaylistItem).toHaveBeenCalledWith('pl-1', expect.objectContaining({ musicId: 9, albumId: 55, title: 'Hino 9' }))
    const toast = document.body.querySelector('.playlist-toast')
    expect(toast?.textContent).toContain('Preferidas')
    expect(toast?.textContent).toContain('adicionada')
    wrapper.unmount()
  })

  it('addToPlaylist duplicado: toast diz "já está"', async () => {
    vi.mocked(addPlaylistItem).mockReturnValueOnce({ added: false } as never)
    mockUseAlbums.activeCollection.value = { id: 55, name: 'X', kind: 'album' }
    mockUseAlbums.filteredTracks.value = [
      { musicId: 9, name: 'Hino 9', track: 1, durationLabel: '1:30', hasInstrumental: false },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.row-playlist').trigger('click')
    await flushPromises()
    const options = document.body.querySelectorAll('.playlist-picker__option')
    ;(options[1] as HTMLButtonElement).click() // pl-2
    await flushPromises()
    const toast = document.body.querySelector('.playlist-toast')
    expect(toast?.textContent).toContain('já está')
    wrapper.unmount()
  })

  it('picker vazio (sem playlists) mostra mensagem; cancelar fecha', async () => {
    const { listPlaylists } = await import('../../services/playlist-storage')
    vi.mocked(listPlaylists).mockReturnValue([])
    mockUseAlbums.filteredTracks.value = [
      { musicId: 3, name: 'H3', track: 1, durationLabel: '', hasInstrumental: false },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.row-playlist').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.playlist-picker__empty')).toBeTruthy()

    const cancel = document.body.querySelector('.playlist-picker__cancel') as HTMLButtonElement
    cancel.click()
    await flushPromises()
    expect(document.body.querySelector('.playlist-picker')).toBeNull()
    wrapper.unmount()
  })

  it('clique no backdrop (.self) fecha o picker', async () => {
    mockUseAlbums.filteredTracks.value = [
      { musicId: 3, name: 'H3', track: 1, durationLabel: '', hasInstrumental: false },
    ]
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.row-playlist').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.playlist-picker')).toBeTruthy()
    const backdrop = document.body.querySelector('.playlist-picker') as HTMLElement
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    wrapper.unmount()
  })
})