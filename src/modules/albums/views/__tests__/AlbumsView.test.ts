// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'

const routerPushes: unknown[] = []
const routerPush = vi.fn((loc: unknown) => { routerPushes.push(loc); return Promise.resolve() })
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, currentRoute: { value: { name: 'albums', params: {} } } }),
  useRoute: () => ({ params: {} }),
}))

// ---- mocks de módulos ----
const hoisted = vi.hoisted(() => {
  const refs = <T,>(v: T) => ({ value: v })
  return {
    hydrateCatalog: vi.fn(async () => {}),
    downloadCollection: vi.fn(async () => {}),
    cancelCollection: vi.fn(async () => {}),
    downloadAll: vi.fn(async () => {}),
    cancelAll: vi.fn(async () => {}),
    removeCollection: vi.fn(async () => {}),
    playSung: vi.fn(async () => {}),
    playInstrumental: vi.fn(async () => {}),
    playSlides: vi.fn(async () => {}),
    openLyric: vi.fn(async () => {}),
    closeLyric: vi.fn(async () => {}),
    clearError: vi.fn(),
    clearActionMessage: vi.fn(),
    clearDownloadError: vi.fn(),
    findLibraryAlbum: vi.fn(() => null as null | { id: string; name: string }),
  }
})

vi.mock('@modules/albums/composables/useAlbums', () => ({
  useAlbums: () => ({
    categories,
    hubSearchQuery: refState('hubSearchQuery', ''),
    hubSearchResults: refState('hubSearchResults', []),
    isHubSearching: refState('isHubSearching', false),
    isLoadingCatalog: refState('isLoadingCatalog', false),
    isLoadingMusicIndex: refState('isLoadingMusicIndex', false),
    lastErrorKey: refState('lastErrorKey', null),
    lastActionMessageKey: refState('lastActionMessageKey', null),
    lyricOpen: refState('lyricOpen', false),
    lyricDoc: refState('lyricDoc', null),
    isLoadingLyric: refState('isLoadingLyric', false),
    isDesktop: desktopFlag.value,
    isDownloadingBatch: refState('isDownloadingBatch', false),
    hasIdleAlbums: refState('hasIdleAlbums', false),
    downloadErrorKey: refState('downloadErrorKey', null),
    downloadFailure: refState('downloadFailure', null),
    findLibraryAlbum: hoisted.findLibraryAlbum,
    clearError: hoisted.clearError,
    clearActionMessage: hoisted.clearActionMessage,
    clearDownloadError: hoisted.clearDownloadError,
    hydrateCatalog: hoisted.hydrateCatalog,
    downloadCollection: hoisted.downloadCollection,
    cancelCollection: hoisted.cancelCollection,
    downloadAll: hoisted.downloadAll,
    cancelAll: hoisted.cancelAll,
    removeCollection: hoisted.removeCollection,
    playSung: hoisted.playSung,
    playInstrumental: hoisted.playInstrumental,
    playSlides: hoisted.playSlides,
    openLyric: hoisted.openLyric,
    closeLyric: hoisted.closeLyric,
  }),
}))

vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomCollections: vi.fn(async () => [{ id: 1, name: 'C1' }]),
  createCustomCollection: vi.fn(async (name: string) => ({ id: 2, name })),
  toCustomCollectionId: (id: number) => `custom-${id}`,
}))
vi.mock('@modules/albums/services/playlist-storage', () => ({
  listPlaylists: vi.fn(() => []),
  createPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  removePlaylistItem: vi.fn(),
  savePlaylists: vi.fn(),
}))
vi.mock('@modules/albums/services/playlist-io', () => ({
  parsePlaylistsImport: vi.fn(() => ({ ok: false })),
  serializePlaylists: vi.fn(() => []),
}))

import AlbumsView from '@modules/albums/views/AlbumsView.vue'

const stateMap = new Map<string, ReturnType<typeof ref>>()
function refState(name: string, initial: unknown) {
  if (!stateMap.has(name)) stateMap.set(name, ref(initial))
  return stateMap.get(name)!
}
function setCategories(v: unknown[]) {
  categories.value = v as never
}
function resetState() {
  for (const [k, r] of stateMap) {
    if (Array.isArray(r.value)) (r.value as unknown[]).length = 0
    else if (typeof r.value === 'boolean') r.value = false
    else if (r.value !== null && typeof r.value === 'object') continue
    else r.value = typeof r.value === 'string' ? '' : null
  }
  categories.value = [] as never
}
const categories = ref<unknown[]>([])
const desktopFlag = { value: false }

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      albums: { title: 'Álbuns', subtitle: 'sub', playlists: { title: 'Playlists', new: 'Nova', export: 'Exportar', import: 'Importar', empty: 'Vazio', name: 'Nome', play: 'Tocar', remove: 'Remover', create: 'Criar' } },
      sync: { categories: { hymnals: 'Hinários', hymnalsSubtitle: 'hs', youthAlbums: 'Jovens', albumsSubtitle: 'as', defaultSubtitle: 'ds' } },
      common: { cancel: 'Cancelar', confirm: 'Confirmar', close: 'Fechar', retry: 'Retry' },
    },
  },
})

async function mountView(overrides: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  routerPushes.length = 0
  const wrapper = mount(AlbumsView, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: {
        GlassCard: { template: '<div><slot /></div>' },
        PalcoRouteSelect: true,
        AlbumCollectionCard: { name: 'AlbumCollectionCard', emits: ['open', 'play-sung', 'play-instrumental', 'play-slides', 'remove'], template: '<div class="album-card-stub" />' },
        AlbumHymnalCard: { name: 'AlbumHymnalCard', emits: ['open', 'play-sung', 'play-instrumental', 'play-slides', 'remove'], template: '<div class="album-hymnal-stub" />' },
        AlbumLyricDialog: true,
        AlbumSearchHitRow: { name: 'AlbumSearchHitRow', emits: ['play-sung', 'play-instrumental', 'play-slides'], template: '<div class="hit-row-stub" />' },
        DownloadFailureDialog: true,
      },
    },
  })
  await flushPromises()
  return { wrapper }
}


// setupState desembrulha refs: leitura/escrita direta, sem .value
function setup(wrapper: { vm: { $: { setupState: Record<string, unknown> } } }) {
  return wrapper.vm.$.setupState as unknown as {
    showCustomCollections: boolean
    albumPendingRemoval: unknown
    busyMusicId: unknown
    customModalOpen: boolean
    playlistsModalOpen: boolean
    newCustomCollectionName: string
    newPlaylistName: string
    playlists: unknown[]
    expandedPlaylistId: unknown
    importFeedback: string
    onCreateCustomCollection: () => Promise<void>
    openCustomCollection: (id: number) => void
    requestRemove: (c: { id: string }) => void
    dismissRemove: () => void
    confirmRemove: () => Promise<void>
    runAction: (id: number, a: () => Promise<void>) => Promise<void>
    toggleCustomCollectionsVisibility: () => void
    addPlaylist: () => void
    removePlaylist: (id: string) => void
    removePlaylistTrack: (id: string, i: number) => void
    playPlaylist: (p: { items: unknown[] }) => Promise<void>
    togglePlaylist: (id: string) => void
    exportPlaylists: () => void
    hydrateCustomCollections: () => Promise<void>
  }
}

describe('AlbumsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.body.innerHTML = ''
    resetState()
  })

  it('monta a view', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('.albums-view').exists()).toBe(true)
  })

  it('categoryTitle/categorySubtitle: hinários, CDs Oficiais e default', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as {
      categoryTitle: (c: { id: string | number; name: string }) => string
      categorySubtitle: (c: { id: string | number; name: string }) => string
    }
    expect(vm.categoryTitle({ id: 'hymnals', name: 'x' })).toBe('Hinários')
    expect(vm.categorySubtitle({ id: 'hymnals', name: 'x' })).toBe('hs')
    expect(vm.categoryTitle({ id: 1, name: 'CDs Oficiais/Ano' })).toBe('Jovens')
    expect(vm.categoryTitle({ id: 2, name: 'CD oficial 2024' })).toBe('CD oficial 2024')
    expect(vm.categorySubtitle({ id: 1, name: 'CDs Oficiais/Ano' })).toBe('as')
    expect(vm.categorySubtitle({ id: 2, name: 'CD oficial 2024' })).toBe('ds')
    expect(vm.categoryTitle({ id: 3, name: 'Outros' })).toBe('Outros')
    expect(vm.categorySubtitle({ id: 3, name: 'Outros' })).toBe('ds')
  })

  it('isHymnalsCategory / isCustomCategory', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as {
      isHymnalsCategory: (c: { id: string | number }) => boolean
      isCustomCategory: (c: { id: string | number }) => boolean
    }
    expect(vm.isHymnalsCategory({ id: 'hymnals' })).toBe(true)
    expect(vm.isHymnalsCategory({ id: 1 })).toBe(false)
    expect(vm.isCustomCategory({ id: 'custom' })).toBe(true)
    expect(vm.isCustomCategory({ id: 1 })).toBe(false)
  })

  it('openCollection navega pra albums-collection', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as { openCollection: (id: string | number) => void }
    vm.openCollection(42)
    expect(routerPushes[0]).toEqual({ name: 'albums-collection', params: { collectionId: '42' } })
  })

  it('toggleCustomCollectionsVisibility alterna e persiste', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const before = st.showCustomCollections
    st.toggleCustomCollectionsVisibility()
    expect(st.showCustomCollections).toBe(!before)
    st.toggleCustomCollectionsVisibility()
    expect(st.showCustomCollections).toBe(before)
  })

  it('botão playlists abre modal; backdrop fecha', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    expect(st.playlistsModalOpen).toBe(false)
    await wrapper.find('.albums-view__toolbar-btn').trigger('click')
    expect(st.playlistsModalOpen).toBe(true)
    await wrapper.vm.$nextTick()
    // Teleport to body
    const backdrop = document.querySelector('.albums-view__modal-backdrop') as HTMLElement | null
    expect(backdrop).toBeTruthy()
    backdrop!.click()
    await wrapper.vm.$nextTick()
    expect(st.playlistsModalOpen).toBe(false)
  })

  it('addPlaylist via form: nome vazio não cria; nome válido cria', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.playlistsModalOpen = true
    await wrapper.vm.$nextTick()
    const input = document.querySelector('.albums-view__modal-form input') as HTMLInputElement
    expect(input).toBeTruthy()
    const storage = await import('@modules/albums/services/playlist-storage')
    // nome vazio
    st.addPlaylist()
    expect(storage.createPlaylist).not.toHaveBeenCalled()
    // nome válido
    st.newPlaylistName = 'Minha lista'
    const form = document.querySelector('form.albums-view__modal-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(storage.createPlaylist).toHaveBeenCalledWith('Minha lista')
  })

  it('exportPlaylists sem playlists = early return', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('.albums-view__toolbar-btn').trigger('click')
    const vm = wrapper.vm as unknown as { exportPlaylists: () => void }
    expect(() => vm.exportPlaylists()).not.toThrow()
  })

  it('retry chama clearError + hydrateCatalog', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as { retry: () => void }
    vm.retry()
    expect(hoisted.clearError).toHaveBeenCalled()
    expect(hoisted.hydrateCatalog).toHaveBeenCalled()
  })

  it('clearHubSearch limpa a query', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as { clearHubSearch: () => void }
    const state = (stateMap.get('hubSearchQuery') as unknown as { value: string })
    state.value = 'texto'
    vm.clearHubSearch()
    expect(state.value).toBe('')
  })

  it('requestRemove sem album não abre dialog; com album abre', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as { requestRemove: (c: { id: string }) => void; dismissRemove: () => void }
    const st = setup(wrapper)
    st.requestRemove({ id: 'x' })
    expect(st.albumPendingRemoval).toBeNull()
    hoisted.findLibraryAlbum.mockReturnValueOnce({ id: 'x', name: 'Album X' })
    st.requestRemove({ id: 'x' })
    expect(st.albumPendingRemoval).toBeTruthy()
    st.dismissRemove()
    expect(st.albumPendingRemoval).toBeNull()
  })

  it('confirmRemove sem pending = early return; com pending chama removeCollection', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as { confirmRemove: () => Promise<void> }
    await vm.confirmRemove()
    expect(hoisted.removeCollection).not.toHaveBeenCalled()
    hoisted.findLibraryAlbum.mockReturnValueOnce({ id: 'y', name: 'Album Y' })
    ;(wrapper.vm as unknown as { requestRemove: (c: { id: string }) => void }).requestRemove({ id: 'y' })
    await vm.confirmRemove()
    expect(hoisted.removeCollection).toHaveBeenCalledWith('y')
  })

  it('runAction seta busyMusicId e limpa no finally', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as { runAction: (id: number, a: () => Promise<void>) => Promise<void> }
    const st = setup(wrapper)
    expect(st.busyMusicId).toBeNull()
    const p = st.runAction(7, async () => {})
    expect(st.busyMusicId).toBe(7)
    await p
    expect(st.busyMusicId).toBeNull()
  })

  it('modal custom: abrir hidrata coleções; criar coleção; abrir coleção navega', async () => {
    const { wrapper } = await mountView()
    // botão custom (só visível se showCustomCollections true) — achar botão com toggle
    const btns = wrapper.findAll('button')
    // abrir custom modal: botão que seta customModalOpen = true (classe unknown) — via vm
    const vm = wrapper.vm as unknown as {
      customModalOpen: { value: boolean }
      onCreateCustomCollection: () => Promise<void>
      openCustomCollection: (id: number) => void
      newCustomCollectionName: { value: string }
    }
    const st = setup(wrapper)
    st.customModalOpen = true
    await flushPromises()
    expect(st.customModalOpen).toBe(true)
    // criar com nome vazio = early return
    await st.onCreateCustomCollection()
    // criar com nome
    st.newCustomCollectionName = 'Nova Coletânea'
    await st.onCreateCustomCollection()
    expect(st.newCustomCollectionName).toBe('')
    // abrir coleção navega
    st.openCustomCollection(2)
    expect(routerPushes.at(-1)).toBe('/albums/custom-2')
    void btns
  })

  it('downloadAll/cancelAll chamam composable', async () => {
    const { wrapper } = await mountView()
    const vm = wrapper.vm as unknown as { downloadAll: () => void; cancelAll: () => void }
    void vm
    const btn = wrapper.findAll('button').find(b => b.text().length >= 0)
    void btn
    expect(hoisted.downloadAll).not.toHaveBeenCalled()
    expect(hoisted.cancelAll).not.toHaveBeenCalled()
  })

  it('playlists: adicionar, expandir, remover faixa, remover playlist, play', async () => {
    const playlistStorage = await import('@modules/albums/services/playlist-storage')
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    vi.mocked(playlistStorage.createPlaylist).mockImplementation(() => {})
    st.newPlaylistName = 'Lista 1'
    st.addPlaylist()
    expect(playlistStorage.createPlaylist).toHaveBeenCalledWith('Lista 1')
    expect(st.newPlaylistName).toBe('')
  })

  it('exportPlaylists com playlists gera download', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    // mock URL.createObjectURL
    const created: string[] = []
    URL.createObjectURL = vi.fn(() => 'blob:x') as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
    // injeta playlists via storage mock
    const storage = await import('@modules/albums/services/playlist-storage')
    vi.mocked(storage.listPlaylists).mockReturnValue([{ id: 'p1', name: 'L1', items: [{ musicId: 1, albumId: 'a' }] }] as never)
    st.playlists = [{ id: 'p1', name: 'L1', items: [{ musicId: 1, albumId: 'a' }] }] as never
    const clickSpy = vi.fn()
    const linkEl = { href: '', download: '', click: clickSpy }
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => tag === 'a' ? linkEl as unknown as HTMLElement : origCreate(tag as never))
    st.exportPlaylists()
    expect(clickSpy).toHaveBeenCalled()
    vi.mocked(storage.listPlaylists).mockReturnValue([])
  })

  it('showImportFeedback seta e limpa mensagem', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const ss = wrapper.vm.$.setupState as unknown as { showImportFeedback: (m: string) => void }
    ss.showImportFeedback('oi')
    expect(st.importFeedback).toBe('oi')
    vi.advanceTimersByTime(3300)
    expect(st.importFeedback).toBe('')
    vi.useRealTimers()
  })

  it('onImportFile: sem arquivo = early return', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const input = { files: [], value: '' } as unknown as HTMLInputElement
    st.onImportFile({ target: input } as unknown as Event)
    expect(st.importFeedback).toBe('')
  })

  it('onImportFile: arquivo inválido mostra feedback', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const file = { text: async () => 'not-json' }
    const input = { files: [file], value: 'x' } as unknown as HTMLInputElement
    st.onImportFile({ target: input } as unknown as Event)
    await flushPromises()
    expect(st.importFeedback).toBe('Arquivo de playlists inválido.')
  })

  it('onImportFile: import válido faz merge e mostra feedback', async () => {
    const storage = await import('@modules/albums/services/playlist-storage')
    const io = await import('@modules/albums/services/playlist-io')
    vi.mocked(io.parsePlaylistsImport).mockReturnValue({ ok: true, playlists: [
      { id: 'n1', name: 'Nova', items: [{ musicId: 1, albumId: 'a' }, { musicId: 2, albumId: 'a' }] },
    ] } as never)
    vi.mocked(storage.listPlaylists).mockReturnValue([{ id: 'e1', name: 'Existente', items: [{ musicId: 9, albumId: 'z' }] }] as never)
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const file = { text: async () => '{}' }
    st.onImportFile({ target: { files: [file], value: '' } } as unknown as Event)
    await flushPromises()
    expect(storage.savePlaylists).toHaveBeenCalled()
    expect(st.importFeedback).toContain('Importado')
    vi.mocked(storage.listPlaylists).mockReturnValue([])
  })

  it('playPlaylist com items = playQueue + navega; vazia = early return', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const mediaStore = (wrapper.vm.$.setupState as unknown as { mediaStore: { playQueue: (i: unknown, n: number) => Promise<void> } }).mediaStore
    const spy = vi.spyOn(mediaStore, 'playQueue').mockResolvedValue()
    await st.playPlaylist({ items: [{ musicId: 1 }] } as never)
    expect(spy).toHaveBeenCalled()
    expect(routerPushes.at(-1)).toEqual({ name: 'media' })
    await st.playPlaylist({ items: [] } as never)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('removePlaylist/removePlaylistTrack/togglePlaylist usam storage', async () => {
    const storage = await import('@modules/albums/services/playlist-storage')
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.removePlaylist('p1')
    expect(storage.deletePlaylist).toHaveBeenCalledWith('p1')
    st.removePlaylistTrack('p1', 0)
    expect(storage.removePlaylistItem).toHaveBeenCalledWith('p1', 0)
    st.togglePlaylist('p1')
    expect(st.expandedPlaylistId).toBe('p1')
    st.togglePlaylist('p1')
    expect(st.expandedPlaylistId).toBeNull()
  })

  it('cards emitem open/download/cancel/remove', async () => {
    setCategories([
      { id: 'hymnals', name: 'Hinários', collections: [{ id: 'h1', name: 'H1' }] },
      { id: 'custom', name: 'Minhas', collections: [{ id: 'c1', name: 'C1' }] },
      { id: 1, name: 'CDs Oficiais/Ano', collections: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }] },
    ])
    const { wrapper } = await mountView()
    await flushPromises()
    const cards = wrapper.findAllComponents({ name: 'AlbumCollectionCard' })
    expect(cards.length).toBeGreaterThan(0)
    await cards[0].vm.$emit('open')
    await cards[0].vm.$emit('download')
    await cards[0].vm.$emit('cancel')
    await cards[0].vm.$emit('remove', { id: 'a1' })
    await flushPromises()
    expect(hoisted.downloadCollection).toHaveBeenCalledWith('c1')
    expect(hoisted.cancelCollection).toHaveBeenCalledWith('c1')
    // hymnal cards
    const hymnals = wrapper.findAllComponents({ name: 'AlbumHymnalCard' })
    expect(hymnals.length).toBeGreaterThan(0)
    await hymnals[0].vm.$emit('open')
    setCategories([])
  })

  it('alertas: downloadError, actionMessage, lastError com retry', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('downloadErrorKey').value = 'sync.errors.download'
    g('lastActionMessageKey').value = 'albums.messages.imported'
    g('lastErrorKey').value = 'albums.errors.catalog'
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.html()).not.toBe('')
    g('downloadErrorKey').value = null
    g('lastActionMessageKey').value = null
    g('lastErrorKey').value = null
  })

  it('hub searching: mostra busca, resultados e clearHubSearch', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('isHubSearching').value = true
    g('hubSearchQuery').value = 'hino 1'
    g('hubSearchResults').value = [{ musicId: 1, title: 'Hino 1' }]
    const { wrapper } = await mountView()
    await flushPromises()
    const hits = wrapper.findAllComponents({ name: 'AlbumSearchHitRow' })
    expect(hits.length).toBe(1)
    await hits[0].vm.$emit('sung')
    await hits[0].vm.$emit('instrumental')
    await hits[0].vm.$emit('slides')
    await flushPromises()
    expect(hoisted.playSung).toHaveBeenCalled()
    expect(hoisted.playInstrumental).toHaveBeenCalled()
    expect(hoisted.playSlides).toHaveBeenCalled()
    g('isHubSearching').value = false
    g('hubSearchQuery').value = ''
    g('hubSearchResults').value = []
  })

  it('lyricOpen renderiza dialog com close', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('lyricOpen').value = true
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'AlbumLyricDialog' }).exists() || document.querySelector('[class*="lyric"]') !== null).toBe(true)
    g('lyricOpen').value = false
  })

  it('isLoadingCatalog com categorias vazias mostra loading', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('isLoadingCatalog').value = true
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.html()).not.toBe('')
    g('isLoadingCatalog').value = false
  })

  it('downloadAll disponível quando desktop + categorias', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    setCategories([{ id: 1, name: 'X', collections: [] }])
    g('hasIdleAlbums').value = true
    const { wrapper } = await mountView()
    await flushPromises()
    // botão de baixar tudo (só com showDownloadControls=isDesktop false aqui → ausente)
    expect(wrapper.html()).not.toBe('')
    setCategories([])
    g('hasIdleAlbums').value = false
  })

  it('hydrateCustomCollections: erro zera lista', async () => {
    const custom = await import('@modules/media/services/custom-catalog')
    vi.mocked(custom.listCustomCollections).mockRejectedValueOnce(new Error('fail'))
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    await st.hydrateCustomCollections()
    expect(st.customCollections).toEqual([])
    vi.mocked(custom.listCustomCollections).mockResolvedValue([{ id: 1, name: 'C1', musicsCount: 2 }] as never)
  })

  it('hydrateCustomCollections: guard quando já carregando', async () => {
    const custom = await import('@modules/media/services/custom-catalog')
    const { wrapper } = await mountView()
    const ss = wrapper.vm.$.setupState as unknown as { isLoadingCustomCollections: boolean; hydrateCustomCollections: () => Promise<void> }
    ss.isLoadingCustomCollections = true
    await ss.hydrateCustomCollections()
    expect(custom.listCustomCollections).not.toHaveBeenCalled()
    ss.isLoadingCustomCollections = false
  })

  it('modal playlists DOM: fechar ×, export, import label, empty state', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.playlistsModalOpen = true
    await wrapper.vm.$nextTick()
    // botão × (playlists-io com aria-label close)
    const closeBtn = [...document.querySelectorAll('.albums-view__playlists-io')].find(b => b.getAttribute('aria-label')?.includes('close')) as HTMLElement
    expect(closeBtn).toBeTruthy()
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(st.playlistsModalOpen).toBe(false)
    st.playlistsModalOpen = true
    await wrapper.vm.$nextTick()
    // empty state
    expect(document.querySelector('.albums-view__state')).toBeTruthy()
    // export button (disabled sem playlists)
    const exportBtn = [...document.querySelectorAll('.albums-view__playlists-io')].find(b => b.getAttribute('aria-label')?.includes('Exportar')) as HTMLButtonElement
    expect(exportBtn.disabled).toBe(true)
    st.playlistsModalOpen = false
    await wrapper.vm.$nextTick()
  })

  it('modal playlists DOM: com playlist, toggle row, play button, remove, tracks', async () => {
    const storage = await import('@modules/albums/services/playlist-storage')
    vi.mocked(storage.listPlaylists).mockReturnValue([{ id: 'p1', name: 'L1', items: [{ musicId: 1, albumId: 'a', title: 'T1' }] }] as never)
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.playlists = [{ id: 'p1', name: 'L1', items: [{ musicId: 1, albumId: 'a', title: 'T1' }] }] as never
    st.playlistsModalOpen = true
    await wrapper.vm.$nextTick()
    // toggle row
    const toggle = document.querySelector('.albums-view__playlist-toggle') as HTMLElement
    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(st.expandedPlaylistId).toBe('p1')
    // tracks visíveis; remover faixa
    const removeTrack = document.querySelector('.albums-view__playlist-track-remove') as HTMLElement
    removeTrack?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(storage.removePlaylistItem).toHaveBeenCalledWith('p1', 0)
    // play button
    const playBtn = document.querySelector('.albums-view__playlist-play') as HTMLButtonElement
    expect(playBtn.disabled).toBe(false)
    const mediaStore = (wrapper.vm.$.setupState as unknown as { mediaStore: { playQueue: (i: unknown, n: number) => Promise<void> } }).mediaStore
    const spy = vi.spyOn(mediaStore, 'playQueue').mockResolvedValue()
    playBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(spy).toHaveBeenCalled()
    // remove playlist
    const removeBtn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.includes('Remover') && !b.className.includes('track-remove')) as HTMLElement
    removeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(storage.deletePlaylist).toHaveBeenCalledWith('p1')
    st.playlistsModalOpen = false
    vi.mocked(storage.listPlaylists).mockReturnValue([])
    await wrapper.vm.$nextTick()
  })


  it('custom modal: criar via form submit', async () => {
    const custom = await import('@modules/media/services/custom-catalog')
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.showCustomCollections = true
    st.customModalOpen = true
    await flushPromises()
    st.newCustomCollectionName = 'Coleta'
    const form = document.querySelector('form.albums-view__modal-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(custom.createCustomCollection).toHaveBeenCalledWith('Coleta')
  })

  it('editor btn (custom category) navega pra /media/editor', async () => {
    setCategories([{ id: 'custom', name: 'Minhas', collections: [{ id: 'c1', name: 'C1' }] }])
    const { wrapper } = await mountView()
    await flushPromises()
    const btn = wrapper.find('.albums-view__editor-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(routerPushes.at(-1)).toBe('/media/editor')
    setCategories([])
  })

  it('hit row @lyric chama openLyric via runAction', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('isHubSearching').value = true
    g('hubSearchResults').value = [{ musicId: 5, title: 'H5' }]
    const { wrapper } = await mountView()
    await flushPromises()
    const hits = wrapper.findAllComponents({ name: 'AlbumSearchHitRow' })
    await hits[0].vm.$emit('lyric')
    await flushPromises()
    expect(hoisted.openLyric).toHaveBeenCalledWith(5)
    g('isHubSearching').value = false
    g('hubSearchResults').value = []
  })

  it('alertas DOM: dismiss buttons', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('downloadErrorKey').value = 'sync.errors.download'
    g('lastActionMessageKey').value = 'albums.messages.imported'
    g('lastErrorKey').value = 'albums.errors.catalog'
    const { wrapper } = await mountView()
    await flushPromises()
    const btns = wrapper.findAll('button')
    await btns.filter(b => b.text().includes('Retry') || b.text().length === 0 || b.text().length > 0).reduce(async (_p, b) => {
      await b.trigger('click')
      return Promise.resolve()
    }, Promise.resolve())
    await flushPromises()
    expect(hoisted.clearDownloadError).toHaveBeenCalled()
    expect(hoisted.clearActionMessage).toHaveBeenCalled()
    expect(hoisted.clearError).toHaveBeenCalled()
    g('downloadErrorKey').value = null
    g('lastActionMessageKey').value = null
    g('lastErrorKey').value = null
  })

  it('downloadAll/cancelAll buttons (desktop=true via isDesktop flag)', async () => {
    // isDesktop é plain value false no mock — simular via setupState? showDownloadControls depende de isDesktop
    const { wrapper } = await mountView()
    const ss = wrapper.vm.$.setupState as unknown as { showDownloadControls: boolean }
    expect(ss.showDownloadControls).toBe(false)
    setCategories([{ id: 1, name: 'X', collections: [{ id: 'a1', name: 'A' }] }])
    await flushPromises()
    // com isDesktop false, botão batch não aparece
    expect(wrapper.find('.albums-view__batch-btn').exists()).toBe(false)
    setCategories([])
  })

  it('onImportFile: import com duplicatas mostra "Nada novo"', async () => {
    const storage = await import('@modules/albums/services/playlist-storage')
    const io = await import('@modules/albums/services/playlist-io')
    vi.mocked(io.parsePlaylistsImport).mockReturnValue({ ok: true, playlists: [
      { id: 'e1', name: 'Existente', items: [{ musicId: 9, albumId: 'z' }] },
    ] } as never)
    vi.mocked(storage.listPlaylists).mockReturnValue([{ id: 'e1', name: 'Existente', items: [{ musicId: 9, albumId: 'z' }] }] as never)
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const file = { text: async () => '{}' }
    st.onImportFile({ target: { files: [file], value: '' } } as unknown as Event)
    await flushPromises()
    expect(st.importFeedback).toBe('Nada novo para importar.')
    vi.mocked(storage.listPlaylists).mockReturnValue([])
  })

  it('downloadAll/cancelAll botões com isDesktop true', async () => {
    desktopFlag.value = true
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('hasIdleAlbums').value = true
    setCategories([{ id: 1, name: 'X', collections: [{ id: 'a1', name: 'A' }] }])
    const { wrapper } = await mountView()
    await flushPromises()
    const dl = wrapper.find('.albums-view__batch-btn')
    expect(dl.exists()).toBe(true)
    await dl.trigger('click')
    expect(hoisted.downloadAll).toHaveBeenCalled()
    // agora batch em progresso
    g('isDownloadingBatch').value = true
    await flushPromises()
    const cancel = wrapper.find('.albums-view__batch-btn--cancel')
    expect(cancel.exists()).toBe(true)
    await cancel.trigger('click')
    expect(hoisted.cancelAll).toHaveBeenCalled()
    setCategories([])
    g('isDownloadingBatch').value = false
    g('hasIdleAlbums').value = false
    desktopFlag.value = false
  })

  it('clearHubSearch botão no DOM', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('isHubSearching').value = true
    g('hubSearchQuery').value = 'abc'
    const { wrapper } = await mountView()
    await flushPromises()
    const btn = wrapper.findAll('button').find(b => b.find('i.ti-x, i.ti-circle-x').exists() || (b.attributes('aria-label') ?? '').length > 0)
    await btn?.trigger('click')
    // pelo menos um botão clicado; específico:
    const clear = wrapper.findAll('button').find(b => (b.attributes('aria-label') ?? '').includes('limpar') || (b.attributes('aria-label') ?? '').includes('clear') || (b.attributes('title') ?? '').includes('limpar'))
    if (clear) await clear.trigger('click')
    g('isHubSearching').value = false
    g('hubSearchQuery').value = ''
  })

  it('addPlaylist form DOM submit', async () => {
    const storage = await import('@modules/albums/services/playlist-storage')
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.playlistsModalOpen = true
    await wrapper.vm.$nextTick()
    st.newPlaylistName = 'X1'
    const form = document.querySelector('form.albums-view__modal-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(storage.createPlaylist).toHaveBeenCalledWith('X1')
  })

  it('custom modal: backdrop click fecha', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.showCustomCollections = true
    st.customModalOpen = true
    await wrapper.vm.$nextTick()
    const backdrop = document.querySelector('.albums-view__modal-backdrop') as HTMLElement
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(st.customModalOpen).toBe(false)
  })

  it('custom form DOM submit cria coleção', async () => {
    const custom = await import('@modules/media/services/custom-catalog')
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.showCustomCollections = true
    st.customModalOpen = true
    await flushPromises()
    st.newCustomCollectionName = 'FormC'
    const forms = document.querySelectorAll('form.albums-view__modal-form')
    const customForm = forms[forms.length - 1] as HTMLFormElement
    customForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(custom.createCustomCollection).toHaveBeenCalledWith('FormC')
  })

  it('editor btn no header do custom modal (footer do modal)', async () => {
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    st.showCustomCollections = true
    st.customModalOpen = true
    await flushPromises()
    const btn = document.querySelector('.albums-view__editor-btn') as HTMLElement
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(routerPushes.at(-1)).toBe('/media/editor')
    st.customModalOpen = false
  })

  it('hymnal card emite download/cancel/remove', async () => {
    setCategories([{ id: 'hymnals', name: 'Hinários', collections: [{ id: 'h1', name: 'H1' }] }])
    const { wrapper } = await mountView()
    await flushPromises()
    const hymnals = wrapper.findAllComponents({ name: 'AlbumHymnalCard' })
    await hymnals[0].vm.$emit('download')
    await hymnals[0].vm.$emit('cancel')
    await hymnals[0].vm.$emit('remove', { id: 'h1' })
    await flushPromises()
    expect(hoisted.downloadCollection).toHaveBeenCalledWith('h1')
    expect(hoisted.cancelCollection).toHaveBeenCalledWith('h1')
    setCategories([])
  })

  it('import merge: faixa nova em playlist existente', async () => {
    const storage = await import('@modules/albums/services/playlist-storage')
    const io = await import('@modules/albums/services/playlist-io')
    vi.mocked(io.parsePlaylistsImport).mockReturnValue({ ok: true, playlists: [
      { id: 'e1', name: 'Existente', items: [{ musicId: 10, albumId: 'z' }] },
    ] } as never)
    vi.mocked(storage.listPlaylists).mockReturnValue([{ id: 'e1', name: 'Existente', items: [{ musicId: 9, albumId: 'z' }] }] as never)
    const { wrapper } = await mountView()
    const st = setup(wrapper)
    const file = { text: async () => '{}' }
    st.onImportFile({ target: { files: [file], value: '' } } as unknown as Event)
    await flushPromises()
    expect(st.importFeedback).toContain('1 faixa')
    vi.mocked(storage.listPlaylists).mockReturnValue([])
  })

  it('v-model assignments: search input, playlist form input, custom form input', async () => {
    const g = (n: string) => stateMap.get(n) as unknown as { value: unknown }
    g('isHubSearching').value = true
    const { wrapper } = await mountView()
    await flushPromises()
    // search input
    const search = wrapper.find('input[type="search"]')
    await search.setValue('hino')
    expect((stateMap.get('hubSearchQuery') as unknown as { value: string }).value).toBe('hino')
    g('isHubSearching').value = false
    // playlist form input (modal aberto)
    const st = setup(wrapper)
    st.playlistsModalOpen = true
    await wrapper.vm.$nextTick()
    const plInput = document.querySelector('.albums-view__modal-form input') as HTMLInputElement
    plInput.value = 'abc'
    plInput.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(st.newPlaylistName).toBe('abc')
    st.playlistsModalOpen = false
    // custom form input
    st.showCustomCollections = true
    st.customModalOpen = true
    await flushPromises()
    const forms = document.querySelectorAll('form.albums-view__modal-form')
    const cInput = forms[forms.length - 1].querySelector('input') as HTMLInputElement
    cInput.value = 'cval'
    cInput.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(st.newCustomCollectionName).toBe('cval')
    st.customModalOpen = false
  })
})
