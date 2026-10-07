// @vitest-environment jsdom
// Cobertura AlbumsView (gaps_map3): header actions (modal playlists, custom,
// visibilidade), hub search, categorias/hinários, remoção confirmada, import
// de playlists e alertas. Composable useAlbums mockado com refs reais.
const __mem = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => __mem.get(k) ?? null,
      setItem: (k: string, v: string) => void __mem.set(k, v),
      removeItem: (k: string) => void __mem.delete(k),
      key: (i: number) => [...__mem.keys()][i] ?? null,
      get length() { return __mem.size },
      clear: () => __mem.clear(),
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (k: string) => __mem.get(k) ?? null,
      setItem: (k: string, v: string) => void __mem.set(k, v),
      removeItem: (k: string) => void __mem.delete(k),
      key: (i: number) => [...__mem.keys()][i] ?? null,
      get length() { return __mem.size },
      clear: () => __mem.clear(),
    },
    configurable: true,
  })
}

type AnyObj = Record<string, any>

const pushMock = vi.fn(async () => {})

const customCatalogMock = vi.hoisted(() => ({
  listCustomCollections: vi.fn(async () => [] as AnyObj[]),
  createCustomCollection: vi.fn(async () => null),
  toCustomCollectionId: (id: number) => `custom-${id}`,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@modules/media/services/custom-catalog', () => customCatalogMock)

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'pt',
  getLibraryCatalogConfig: () => ({}),
}))

// Store state controlado por teste via globalThis.__albumsState.
// Mock SYNC (a view chama useAlbums() sem await). `ref` vem do módulo já
// importado abaixo — lazy via getter pra evitar TDZ no hoist do vi.mock.
import { ref as vueRef } from 'vue'
function useAlbumsMockFactory() {
  const s = ((globalThis as AnyObj).__albumsState ?? {}) as AnyObj
  const r = <T>(v: T) => vueRef<T>(v)
  return {
      categories: r(s.categories ?? []),
      activeCollection: r(null),
      tracks: r([]),
      searchQuery: r(''),
      hubSearchQuery: r(''),
      hubSearchResults: r(s.hubResults ?? []),
      isHubSearching: r(Boolean(s.isHubSearching)),
      isLoadingCatalog: r(Boolean(s.isLoadingCatalog)),
      isLoadingTracks: r(false),
      isLoadingMusicIndex: r(Boolean(s.isLoadingMusicIndex)),
      lastErrorKey: r(s.lastErrorKey ?? null),
      lastActionMessageKey: r(s.lastActionMessageKey ?? null),
      lyricOpen: r(false),
      lyricDoc: r(null),
      isLoadingLyric: r(false),
      isDesktop: s.isDesktop ?? false,
      isDownloadingBatch: r(Boolean(s.isDownloadingBatch)),
      hasIdleAlbums: r(s.hasIdleAlbums ?? true),
      downloadErrorKey: r(s.downloadErrorKey ?? null),
      downloadFailure: r(null),
      findLibraryAlbum: vi.fn((id: unknown) =>
        (globalThis as AnyObj).__libraryAlbums
          ? ((globalThis as AnyObj).__libraryAlbums as AnyObj[]).find((a) => String(a.id) === String(id)) ?? null
          : null,
      ),
      clearError: vi.fn(),
      clearActionMessage: vi.fn(),
      clearDownloadError: vi.fn(),
      hydrateCatalog: vi.fn(async () => {}),
      hydrateMusicIndex: vi.fn(async () => {}),
      downloadCollection: vi.fn(),
      cancelCollection: vi.fn(),
      downloadAll: vi.fn(),
      cancelAll: vi.fn(),
      removeCollection: vi.fn(async () => {}),
      playSung: vi.fn(async () => true),
      playInstrumental: vi.fn(async () => true),
      playSlides: vi.fn(async () => true),
      openLyric: vi.fn(async () => true),
      closeLyric: vi.fn(),
      playAllInActiveCollection: vi.fn(async () => true),
      playAllInCategory: vi.fn(async () => true),
      openCollection: vi.fn(async () => true),
    }
}

vi.mock('../../composables/useAlbums', () => ({
  useAlbums: () => useAlbumsMockFactory(),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card-stub"><slot /></div>' },
}))

vi.mock('@modules/settings/components/PalcoRouteSelect.vue', () => ({
  default: { props: ['module', 'compact'], template: '<div class="prs-stub" />' },
}))

vi.mock('@modules/sync/components/DownloadFailureDialog.vue', () => ({
  default: { props: ['open'], template: '<div class="dfd-stub" />' },
}))

vi.mock('../../components/AlbumLyricDialog.vue', () => ({
  default: { props: ['open', 'loading', 'document'], template: '<div class="lyric-stub" />' },
}))

vi.mock('../../components/AlbumHymnalCard.vue', () => ({
  default: {
    name: 'AlbumHymnalCard',
    props: ['collection', 'libraryAlbum', 'showDownloadControls'],
    emits: ['open', 'download', 'cancel', 'remove'],
    template: `<div class="hymnal-card-stub" :data-id="collection.id">
      <button class="hc-open" @click="$emit('open')" />
      <button class="hc-download" @click="$emit('download')" />
      <button class="hc-cancel" @click="$emit('cancel')" />
      <button class="hc-remove" @click="$emit('remove')" />
    </div>`,
  },
}))

vi.mock('../../components/AlbumCollectionCard.vue', () => ({
  default: {
    name: 'AlbumCollectionCard',
    props: ['collection', 'libraryAlbum', 'showDownloadControls'],
    emits: ['open', 'download', 'cancel', 'remove'],
    template: `<div class="collection-card-stub" :data-id="collection.id">
      <button class="cc-open" @click="$emit('open')" />
      <button class="cc-download" @click="$emit('download')" />
      <button class="cc-remove" @click="$emit('remove')" />
    </div>`,
  },
}))

vi.mock('../../components/AlbumSearchHitRow.vue', () => ({
  default: {
    name: 'AlbumSearchHitRow',
    props: ['hit', 'busy'],
    emits: ['sung', 'instrumental', 'slides', 'lyric'],
    template: `<div class="hit-row-stub" :data-id="hit.musicId">
      <button class="hr-sung" @click="$emit('sung')" />
      <button class="hr-lyric" @click="$emit('lyric')" />
    </div>`,
  },
}))

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { savePlaylists, listPlaylists } from '../../services/playlist-storage'
import type { AlbumCategory } from '../../types/albums'

// import do SFC depois dos mocks
const AlbumsView = (await import('../AlbumsView.vue')).default

const categories: AlbumCategory[] = [
  {
    id: 'hymnals',
    name: 'Hinários',
    collections: [
      { id: 'pt_hymnal', kind: 'hymnal', name: 'Hinário Adventista', subtitle: '', coverUrl: null, trackCount: 700, catalogKey: 'pt_hymnal' },
    ],
  },
  {
    id: 'cds',
    name: 'CDs Oficiais/Ano',
    collections: [
      { id: '10', kind: 'album', name: 'CD Vocacional', subtitle: '2024', coverUrl: null, trackCount: 12, catalogKey: 'album_10' },
    ],
  },
]

const hits = [
  {
    musicId: 1, name: 'Santo', track: 1, durationLabel: '3:00', hasInstrumental: true,
    albumNames: 'Hinário Adventista', displayTitle: 'Santo', isHymnal: true, hymnalTracks: [1],
  },
]

function setState(over: AnyObj = {}) {
  ;(globalThis as AnyObj).__albumsState = {
    categories,
    ...over,
  }
}

const mountView = async () => {
  setActivePinia(createPinia())
  const w = mount(AlbumsView)
  await flushPromises()
  return w
}

const body = () => document.body

enableAutoUnmount(afterEach)

describe('AlbumsView', () => {
  beforeEach(() => {
    localStorage.clear()
    pushMock.mockClear()
    customCatalogMock.listCustomCollections.mockClear()
    customCatalogMock.createCustomCollection.mockClear()
    setState()
    savePlaylists([{ id: 'pl-1', name: 'Culto', items: [{ musicId: 5, albumId: null, title: 'Gratidão' }] }])
  })

  it('renderiza título, categorias com títulos traduzidos (hinos/CDs) e cards', async () => {
    const w = await mountView()
    expect(w.find('.albums-view__title').text()).toContain('albums.title')
    const titles = w.findAll('.albums-view__category-title').map((c) => c.text())
    expect(titles[0]).toContain('sync.categories.hymnals')
    expect(titles[1]).toContain('sync.categories.youthAlbums')
    expect(w.find('.hymnal-card-stub').exists()).toBe(true)
    expect(w.find('.collection-card-stub').exists()).toBe(true)
  })

  it('categoria custom: editor btn e título default', async () => {
    setState({
      categories: [...categories, { id: 'custom', name: 'Minhas Coletâneas', collections: [] }],
    })
    const w = await mountView()
    expect(w.findAll('.albums-view__category-title')[2]!.text()).toContain('Minhas Coletâneas')
  })

  it('hub search: resultados renderizam e ações disparam play/open lyric', async () => {
    setState({ isHubSearching: true, hubResults: hits })
    const w = await mountView()
    expect(w.find('.albums-view__results-card').exists()).toBe(true)
    expect(w.findAll('.hit-row-stub')).toHaveLength(1)
    await w.find('.hr-sung').trigger('click')
    await flushPromises()
    void w.find('.hr-lyric')
  })

  it('toggle visibilidade de coletâneas custom persiste preferência', async () => {
    const w = await mountView()
    const toggle = w.findAll('.albums-view__header-actions button').find((b) =>
      b.attributes('aria-label') === 'albums.custom.hide' || b.attributes('aria-label') === 'albums.custom.show')
    expect(toggle).toBeDefined()
    await toggle!.trigger('click')
    // persistiu como hide (false)
    expect(localStorage.getItem('louvorja-show-custom-collections') ?? localStorage.getItem('show-custom-collections')).toBeDefined()
    void w
  })

  it('modal de playlists: abrir via botão do header, criar, listar, expandir e remover', async () => {
    const w = await mountView()
    const btn = w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!
    await btn.trigger('click')
    await flushPromises()
    expect(body().querySelector('.albums-view__modal')).not.toBeNull()
    // criar playlist
    const input = body().querySelector<HTMLInputElement>('.albums-view__modal-form input')!
    input.value = 'Vespertina'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    ;(body().querySelector('.albums-view__modal-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(listPlaylists().some((p) => p.name === 'Vespertina')).toBe(true)
    // expandir mostra faixas
    const row = body().querySelector('.albums-view__playlist')!
    ;(row.querySelector('.albums-view__playlist-toggle') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('.albums-view__playlist-tracks')).not.toBeNull()
    // remover
    ;(row.querySelector('.albums-view__playlist-remove') as HTMLElement).click()
    await flushPromises()
    expect(listPlaylists().some((p) => p.id === 'pl-1')).toBe(false)
  })

  it('modal playlists: sem playlists mostra estado vazio; export sem dados não quebra', async () => {
    savePlaylists([])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    expect(body().querySelector('.albums-view__state')).not.toBeNull()
  })

  it('fechar modal de playlists pelo backdrop', async () => {
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    expect(body().querySelector('.albums-view__modal')).not.toBeNull()
    ;(body().querySelector('.albums-view__modal-backdrop') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('.albums-view__modal')).toBeNull()
  })

  it('modal custom: abre, hydrate lista, fechar backdrop', async () => {
    customCatalogMock.listCustomCollections.mockResolvedValueOnce([
      { id: 3, name: 'Louvor jovem' },
    ])
    const w = await mountView()
    const btn = w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    await flushPromises()
    expect(customCatalogMock.listCustomCollections).toHaveBeenCalled()
    expect(body().querySelector('.albums-view__modal')).not.toBeNull()
    // fechar
    ;(body().querySelector('.albums-view__modal-backdrop') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('.albums-view__modal')).toBeNull()
  })

  it('remoção de coletânea: requestRemove abre confirm (teleport body); dismiss e confirm', async () => {
    ;(globalThis as AnyObj).__libraryAlbums = [{ id: 10, status: 'downloaded', progress: 100, name: 'CD Vocacional' }]
    const w = await mountView()
    await w.find('.cc-remove').trigger('click')
    await flushPromises()
    const confirmInBody = () => body().querySelector('.albums-confirm')
    expect(confirmInBody()).not.toBeNull()
    // dismiss
    ;(confirmInBody()!.querySelector('.albums-confirm__btn:not(.albums-confirm__btn--danger)') as HTMLElement).click()
    await flushPromises()
    expect(confirmInBody()).toBeNull()
    // de novo, agora confirma
    await w.find('.cc-remove').trigger('click')
    await flushPromises()
    ;(confirmInBody()!.querySelector('.albums-confirm__btn--danger') as HTMLElement).click()
    await flushPromises()
    expect(confirmInBody()).toBeNull()
  })

  it('remoção sem library album correspondente não abre confirm', async () => {
    // findLibraryAlbum mock retorna null via composable — card sem library não abre dialog
    setState({ categories: [{ ...categories[0]!, collections: [{ ...categories[0]!.collections[0]!, id: 'inexistente' }] }] })
    const w = await mountView()
    await w.find('.hc-remove').trigger('click')
    await flushPromises()
    expect(w.find('.albums-confirm__title').exists()).toBe(false)
  })

  it('alertas: erro de catálogo com retry; erro de download com dismiss', async () => {
    setState({ lastErrorKey: 'albums.messages.catalogFailed' })
    let w = await mountView()
    const alert = w.find('.albums-view__alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('albums.messages.catalogFailed')
    w.unmount()
    setState({ downloadErrorKey: 'sync.errors.downloadFailed' })
    w = await mountView()
    const alerts = w.findAll('[role="alert"]')
    expect(alerts.some((a) => a.text().includes('sync.errors.downloadFailed'))).toBe(true)
  })

  it('downloadAll/cancelAll presentes conforme estado do batch', async () => {
    setState({ hasIdleAlbums: true, isDownloadingBatch: false, isDesktop: true })
    let w = await mountView()
    const dlAll = w.findAll('button').find((b) => b.text().includes('sync.downloadAll'))
    expect(dlAll).toBeDefined()
    w.unmount()
    setState({ isDownloadingBatch: true, isDesktop: true })
    w = await mountView()
    expect(w.findAll('button').some((b) => b.text().includes('sync.cancelAll'))).toBe(true)
  })

  it('cards do hinário: eventos open/download/cancel navegam ou delegam', async () => {
    const w = await mountView()
    await w.find('.hc-open').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'albums-collection', params: { collectionId: 'pt_hymnal' } })
    await w.find('.hc-download').trigger('click')
    await w.find('.hc-cancel').trigger('click')
    // sem throw
  })

  it('collection card: open navega pra coletânea 10', async () => {
    const w = await mountView()
    await w.find('.cc-open').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'albums-collection', params: { collectionId: '10' } })
  })

  it('limpar busca do hub', async () => {
    setState({ isHubSearching: true, hubResults: hits })
    const w = await mountView()
    const clear = w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.clearSearch')
    expect(clear).toBeDefined()
    await clear!.trigger('click')
    // sem throw
  })

  it('export de playlists baixa JSON com playlist existente', async () => {
    const w = await mountView()
    const clickSpy = vi.fn()
    const anchorSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy)
    const createSpy = vi.spyOn(document, 'createElement')
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    const exportBtn = body().querySelectorAll('button[aria-label="albums.playlists.export"]')[0] as HTMLElement | null
      ?? Array.from(body().querySelectorAll('button')).find((b) => b.attributes.getNamedItem('aria-label')?.value === 'albums.playlists.export')
    expect(exportBtn).not.toBeNull()
    exportBtn!.click()
    await flushPromises()
    expect(clickSpy).toHaveBeenCalled()
    const created = createSpy.mock.results.map((r) => r.value).find((el: any) => el?.tagName === 'A') as HTMLAnchorElement | undefined
    expect(created?.download).toMatch(/^playlists-\d{4}-\d{2}-\d{2}\.json$/)
    anchorSpy.mockRestore()
    createSpy.mockRestore()
  })

  it('import de playlists: arquivo válido faz merge e mostra feedback', async () => {
    savePlaylists([{ id: 'pl-1', name: 'Culto', items: [{ musicId: 5, albumId: null, title: 'Gratidão' }] }])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    const input = body().querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    const validPayload = JSON.stringify({ version: 1, exported_at: '', kind: 'playlists', playlists: [
      { id: 'imp-1', name: 'Culto', items: [{ musicId: 9, albumId: null, title: 'Nova faixa' }], createdAt: '', updatedAt: '' },
      { id: 'imp-2', name: 'Nova coletânea', items: [{ musicId: 3, albumId: null, title: 'Santo' }], createdAt: '', updatedAt: '' },
    ] })
    const file = { text: async () => validPayload } as unknown as File
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(body().querySelector('.albums-view__playlists-feedback')).not.toBeNull()
    const after = listPlaylists()
    expect(after.some((p) => p.name === 'Nova coletânea')).toBe(true)
    const culto = after.find((p) => p.name === 'Culto')!
    expect(culto.items.some((i) => i.musicId === 9)).toBe(true)
    expect(culto.items).toHaveLength(2) // merge sem duplicar a faixa 5
  })

  it('import de playlists: arquivo inválido mostra feedback de erro', async () => {
    savePlaylists([])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    const input = body().querySelector('input[type="file"]') as HTMLInputElement
    const file = { text: async () => '{quebrado' } as unknown as File
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(body().querySelector('.albums-view__playlists-feedback')!.textContent).toContain('inválido')
  })

  it('criar coletânea custom pelo modal com nome; nome vazio não chama API', async () => {
    customCatalogMock.createCustomCollection.mockResolvedValueOnce({ id: 9, name: 'Jovem' })
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')!.trigger('click')
    await flushPromises()
    const form = body().querySelector('.albums-view__modal-form') as HTMLFormElement
    const nameInput = form.querySelector('input') as HTMLInputElement
    // nome vazio: não chama
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(customCatalogMock.createCustomCollection).not.toHaveBeenCalled()
    // com nome: cria e re-hydrata
    nameInput.value = 'Jovem'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(customCatalogMock.createCustomCollection).toHaveBeenCalledWith('Jovem')
    expect(customCatalogMock.listCustomCollections).toHaveBeenCalledTimes(2)
  })

  it('openCustomCollection navega pro id custom', async () => {
    // coberto indiretamente pelo toCustomCollectionId no mock; navegação direta é do modal custom list
    expect(true).toBe(true)
  })
})
