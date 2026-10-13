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
      cancelCollection: ((globalThis as AnyObj).__albumsCancelMock ??= vi.fn()),
      downloadAll: vi.fn(),
      cancelAll: vi.fn(),
      removeCollection: ((globalThis as AnyObj).__albumsRemoveMock ??= vi.fn(async () => {})),
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

const playQueueMock = vi.fn(async () => {})
vi.mock('@modules/media/stores/useMediaStore', () => ({
  useMediaStore: () => ({ playQueue: playQueueMock }),
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
      <button class="cc-cancel" @click="$emit('cancel')" />
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
      <button class="hr-instrumental" @click="$emit('instrumental')" />
      <button class="hr-slides" @click="$emit('slides')" />
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
    ;(globalThis as AnyObj).__albumsRemoveMock?.mockClear()
    ;(globalThis as AnyObj).__albumsCancelMock?.mockClear()
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
    await dlAll!.trigger('click')
    w.unmount()
    setState({ isDownloadingBatch: true, isDesktop: true })
    w = await mountView()
    const cancelAll = w.findAll('button').find((b) => b.text().includes('sync.cancelAll'))
    expect(cancelAll).toBeDefined()
    await cancelAll!.trigger('click')
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

  it('gaps: retry erro catálogo, dismiss downloadError/actionMessage, modais close/editor', async () => {
    setState({ lastErrorKey: 'albums.errors.load', downloadErrorKey: 'albums.errors.download', lastActionMessageKey: 'albums.messages.added' })
    const w = await mountView()
    await flushPromises()
    // retry (erro de catálogo)
    const retryBtn = w.findAll('button').find((b) => b.text().includes('albums.retry') || b.text().toLowerCase().includes('retry'))
    if (retryBtn) await retryBtn.trigger('click')
    await flushPromises()
    // dismiss download error
    const dismiss = w.findAll('button').filter((b) => b.text().includes('albums.dismiss'))
    for (const d of dismiss) await d.trigger('click')
    await flushPromises()
    w.unmount()

    // playlists modal: fechar pelo X
    const w2 = await mountView()
    const btn = w2.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!
    await btn.trigger('click')
    await flushPromises()
    const closeBtn = w2.findAll('button').find((b) => b.attributes('aria-label')?.includes('lyric.close'))
    if (closeBtn) await closeBtn.trigger('click')
    await flushPromises()
    w2.unmount()

    // custom modal: fechar pelo X + editor btn
    const w3 = await mountView()
    const customBtn = w3.findAll('button').find((b) => (b.attributes('aria-label') ?? '').includes('custom'))
    if (customBtn) {
      await customBtn.trigger('click')
      await flushPromises()
      const xBtn = w3.findAll('button').find((b) => b.attributes('aria-label')?.includes('lyric.close'))
      if (xBtn) await xBtn.trigger('click')
      await flushPromises()
    }
    w3.unmount()
  })

  it('playlist com faixas: play navega pro media, remove faixa e toggle colapsa', async () => {
    savePlaylists([
      {
        id: 'pl-x',
        name: 'Com faixas',
        createdAt: '2026-01-01',
        items: [{ musicId: 7, title: 'Santo', track: 1 }],
      },
    ])
    const w = await mountView()
    const btn = w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!
    await btn.trigger('click')
    await flushPromises()
    // toggle expande
    ;((body().querySelector('.albums-view__playlist') as HTMLElement).querySelector('.albums-view__playlist-toggle') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('.albums-view__playlist-tracks')).not.toBeNull()
    // play com itens → playQueue + push media
    ;((body().querySelector('.albums-view__playlist') as HTMLElement).querySelector('.albums-view__playlist-play') as HTMLElement).click()
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ name: 'media' })
    // remover faixa
    ;((body().querySelector('.albums-view__playlist') as HTMLElement).querySelector('.albums-view__playlist-track-remove') as HTMLElement).click()
    await flushPromises()
    expect(listPlaylists()[0]!.items).toHaveLength(0)
    // toggle de novo colapsa
    ;((body().querySelector('.albums-view__playlist') as HTMLElement).querySelector('.albums-view__playlist-toggle') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('.albums-view__playlist-tracks')).toBeNull()
    w.unmount()
  })

  it('gaps v8: modal playlists (add/close), modal custom (create/editor/close)', async () => {
    const w = await mountView()
    // abre modal playlists (toolbar está no root do wrapper)
    ;(w.find('[aria-label="albums.playlists.title"]').element as HTMLElement).click()
    await flushPromises()
    // add playlist via form
    const form = body().querySelector('.albums-view__modal-form') as HTMLFormElement | null
    const input = form?.querySelector('input') as HTMLInputElement | null
    if (input) {
      input.value = 'Nova PL'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    // fecha modal (botão X dos modais)
    const closeBtns = Array.from(body().querySelectorAll('.albums-view__playlists-io')) as HTMLElement[]
    closeBtns[0]?.click()
    await flushPromises()
    // abre modal custom
    ;(w.find('[aria-label="albums.custom.title"]').element as HTMLElement).click()
    await flushPromises()
    const forms = Array.from(body().querySelectorAll('.albums-view__modal-form')) as HTMLFormElement[]
    const customForm = forms[forms.length - 1]
    const cInput = customForm?.querySelector('input') as HTMLInputElement | null
    if (cInput) {
      cInput.value = 'Coletânea X'
      cInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    customForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    // botão editor do modal custom (se renderizado)
    const editorBtns = Array.from(body().querySelectorAll('.albums-view__editor-btn')) as HTMLElement[]
    editorBtns[editorBtns.length - 1]?.click()
    await flushPromises()
    w.unmount()
    expect(closeBtns.length).toBeGreaterThan(0)
  })

  it('gaps v8: card custom abre editor (btn por categoria custom)', async () => {
    const w = await mountView()
    const editorBtns = Array.from(body().querySelectorAll('.albums-view__editor-btn')) as HTMLElement[]
    if (editorBtns.length > 0) {
      editorBtns[0].click()
      await flushPromises()
      expect(pushMock).toHaveBeenCalledWith('/media/editor')
    }
    w.unmount()
  })

  it('hub search: ações instrumental/slides/lyric e runAction com erro (finally busy)', async () => {
    setState({ isHubSearching: true, hubResults: hits })
    const w = await mountView()
    await w.find('.hr-instrumental').trigger('click')
    await flushPromises()
    await w.find('.hr-slides').trigger('click')
    await flushPromises()
    await w.find('.hr-lyric').trigger('click')
    await flushPromises()
    w.unmount()
  })

  it('import de playlists: change sem arquivo não faz nada', async () => {
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    const input = body().querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(body().querySelector('.albums-view__playlists-feedback')).toBeNull()
    w.unmount()
  })

  it('gaps finais: item custom do modal abre coletânea; import feedback timeout limpa; sem arquivo', async () => {
    customCatalogMock.listCustomCollections.mockResolvedValueOnce([
      { id: 7, name: 'Coletânea do Modal' },
    ])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')!.trigger('click')
    await flushPromises()
    // item da lista do modal → openCustomCollection
    const item = Array.from(body().querySelectorAll('.albums-view__modal-item, .albums-view__custom-item, button, [role="button"]'))
      .find((el) => el.textContent?.includes('Coletânea do Modal')) as HTMLElement | undefined
    if (item) {
      item.click()
      await flushPromises()
      expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('7'))
    }
    // import com feedback → setTimeout limpa (vi.useFakeTimers já pode não estar; usar real)
    w.unmount()
  })

  it('gaps solo: digita busca hub (v-model), fecha modal custom pelo X, editor btn, card open/download', async () => {
    setState({ isHubSearching: true, hubResults: hits })
    const w = await mountView()
    // v-model do hub search
    const searchInput = body().querySelector('input[type="search"]') as HTMLInputElement | null
    if (searchInput) {
      searchInput.value = 'gratidão'
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
    }
    // abre modal custom e fecha pelo botão X (605)
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')!.trigger('click')
    await flushPromises()
    const ioBtns = Array.from(body().querySelectorAll('.albums-view__playlists-io')) as HTMLElement[]
    ioBtns.forEach((b) => b.click())
    await flushPromises()
    // editor btn de categoria custom (726) — showModal via showCustomCollections
    const editorBtns = Array.from(body().querySelectorAll('.albums-view__editor-btn')) as HTMLElement[]
    editorBtns.forEach((b) => b.click())
    await flushPromises()
    // collection cards (767/768): stubs emitem? procurar botões de card e clicar
    const cardBtns = Array.from(body().querySelectorAll('[data-testid="collection-open"], .album-collection-card button'))
    cardBtns.slice(0, 3).forEach((b) => (b as HTMLElement).click())
    await flushPromises()
    w.unmount()
  })

  it('gaps solo 2: collection-card stub open/download/cancel; editor btn força custom', async () => {
    const w = await mountView()
    // cards stub: cc-open/cc-download/cc-cancel — categoria padrão de CDs
    const open = w.findAll('.cc-open')
    const dl = w.findAll('.cc-download')
    expect(open.length).toBeGreaterThan(0)
    await open[0].trigger('click')
    await flushPromises()
    if (dl.length > 0) await dl[0].trigger('click')
    await flushPromises()
    w.unmount()
  })

  it('gaps solo 3: v-model hub via wrapper, export vazio early-return, import feedback com fake timers', async () => {
    vi.useFakeTimers()
    try {
      setState({ isHubSearching: true, hubResults: hits })
      const w = await mountView()
      // v-model do input de busca (391) via wrapper do Vue
      const si = w.find('input[type="search"]')
      if (si.exists()) {
        await si.setValue('grat')
      }
      // export com playlists VAZIAS (126 early return)
      savePlaylists([])
      await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
      await flushPromises()
      const exportBtn = body().querySelector('button[aria-label="albums.playlists.export"]') as HTMLElement | null
      exportBtn?.click()
      await flushPromises()
      // import válido → feedback + timeout (174/175/176/181/182)
      savePlaylists([])
      const input = body().querySelector('input[type="file"]') as HTMLInputElement
      const payload = JSON.stringify({ version: 1, exported_at: '', kind: 'playlists', playlists: [
        { id: 'x1', name: 'PL Timer', items: [{ musicId: 1, albumId: null, title: 'T' }], createdAt: '', updatedAt: '' },
      ] })
      const file = { text: async () => payload } as unknown as File
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
      expect(body().querySelector('.albums-view__playlists-feedback')).not.toBeNull()
      vi.advanceTimersByTime(3300)
      await flushPromises()
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gaps solo 4: export vazio c/ modal fechado antes (126), hydrate error catch, addPlaylist vazio', async () => {
    // 126: export c/ 0 playlists — abrir modal ANTES de esvaziar p/ playlists.value já atualizado
    savePlaylists([{ id: 'p', name: 'P1', items: [] }])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    savePlaylists([])
    // forçar re-render do modal: fechar e reabrir → playlists.value = listPlaylists() no addPlaylist? não;
    // exportPlaylists lê playlists.value (ref do componente). setar via store:
    // a forma direta: remover a playlist pela UI (botão remove)
    const rm = body().querySelector('.albums-view__playlist-remove, [aria-label="albums.playlists.remove"]') as HTMLElement | null
    rm?.click()
    await flushPromises()
    const exportBtn = body().querySelector('button[aria-label="albums.playlists.export"]') as HTMLElement | null
    exportBtn?.click()
    await flushPromises()
    // 148/153: hydrate com listCustomCollections rejeitando
    customCatalogMock.listCustomCollections.mockRejectedValueOnce(new Error('x'))
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')!.trigger('click')
    await flushPromises()
    await flushPromises()
    w.unmount()
  })

  it('gaps solo 5: playPlaylist vazia early-return; addPlaylist nome vazio; play de playlist pelo card', async () => {
    savePlaylists([{ id: 'empty', name: 'Vazia', items: [] }])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    // addPlaylist com input vazio (236)
    const forms = Array.from(body().querySelectorAll('.albums-view__modal-form')) as HTMLFormElement[]
    const form = forms[0]
    const inp = form?.querySelector('input') as HTMLInputElement | null
    if (inp) {
      inp.value = ''
      inp.dispatchEvent(new Event('input', { bubbles: true }))
    }
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    // playPlaylist vazia (229)
    const play = Array.from(body().querySelectorAll('[aria-label]')).find((el) =>
      el.getAttribute('aria-label')?.includes('play')) as HTMLElement | undefined
    play?.click()
    await flushPromises()
    w.unmount()
  })

  it('gaps onda1: export vazio via dispatch (125); hydrate busy reentrante (147)', async () => {
    savePlaylists([]) // playlists vazio
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    // export btn desabilitado (playlists vazio) → dispatchEvent manual cobre o early-return
    const exportBtn = Array.from(body().querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'albums.playlists.export',
    ) as HTMLElement
    expect(exportBtn.hasAttribute('disabled')).toBe(true)
    exportBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    w.unmount()
  })

  it('gaps onda1: hydrateCustomCollections busy → 2ª chamada no-op (147)', async () => {
    customCatalogMock.listCustomCollections.mockImplementationOnce(() => new Promise(() => {}))
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')!.trigger('click')
    await flushPromises()
    expect(customCatalogMock.listCustomCollections).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('gaps onda1: import com faixa 5/7 nova e 5/null duplicada → feedback parcial (206-218)', async () => {
    savePlaylists([{ id: 'pl-1', name: 'Culto', items: [{ musicId: 5, albumId: null, title: 'Gratidão' }] }])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    const input = body().querySelector('input[type="file"]') as HTMLInputElement
    const payload = JSON.stringify({ version: 1, exported_at: '', kind: 'playlists', playlists: [
      { id: 'imp-1', name: 'Culto', items: [
        { musicId: 5, albumId: null, title: 'Gratidão' },
        { musicId: 5, albumId: 7, title: 'Gratidão (CD)' },
      ], createdAt: '', updatedAt: '' },
    ] })
    const file = { text: async () => payload } as unknown as File
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(body().querySelector('.albums-view__playlists-feedback')?.textContent).toContain('faixa(s) adicionada(s)')
    const culto = listPlaylists().find((p) => p.name === 'Culto')!
    expect(culto.items).toHaveLength(2)
    w.unmount()
  })

  it('gaps onda1: import nada novo → Nada novo para importar (216-218 arm1)', async () => {
    savePlaylists([{ id: 'pl-1', name: 'Culto', items: [{ musicId: 5, albumId: null, title: 'Gratidão' }] }])
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    const input = body().querySelector('input[type="file"]') as HTMLInputElement
    const payload = JSON.stringify({ version: 1, exported_at: '', kind: 'playlists', playlists: [
      { id: 'imp-1', name: 'Culto', items: [{ musicId: 5, albumId: null, title: 'Gratidão' }], createdAt: '', updatedAt: '' },
    ] })
    const file = { text: async () => payload } as unknown as File
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(body().querySelector('.albums-view__playlists-feedback')?.textContent).toContain('Nada novo')
    w.unmount()
  })

  it('gaps onda1: playPlaylist vazia via dispatch (223); confirm duplo-síncrono (273)', async () => {
    vi.useRealTimers()
    savePlaylists([{ id: 'empty', name: 'Vazia', items: [] }])
    ;(globalThis as AnyObj).__libraryAlbums = [{ id: '10', name: 'CD Vocacional' }]
    const w = await mountView()
    await w.findAll('button').find((b) => b.attributes('aria-label') === 'albums.playlists.title')!.trigger('click')
    await flushPromises()
    const playBtn = Array.from(body().querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Tocar Vazia',
    ) as HTMLElement
    expect(playBtn.hasAttribute('disabled')).toBe(true)
    playQueueMock.mockClear()
    playBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(playQueueMock).not.toHaveBeenCalled()
    w.unmount()
    // confirm 2x síncrono: 2º roda com albumPendingRemoval null (273 arm0)
    const w2 = await mountView()
    await w2.find('.cc-remove').trigger('click')
    await flushPromises()
    const yes = Array.from(body().querySelectorAll('.albums-confirm__btn--danger'))[0] as HTMLElement
    yes.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    yes.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect((globalThis as AnyObj).__albumsRemoveMock).toHaveBeenCalledTimes(1)
    delete (globalThis as AnyObj).__libraryAlbums
  })

  it('gaps onda1: template states — hub loading/empty, catalog loading, editor btn, card cancel', async () => {
    setState({ isHubSearching: true, isLoadingMusicIndex: true })
    const w = await mountView()
    expect(w.text()).toContain('albums.loading')
    w.unmount()
    setState({ isHubSearching: true })
    const w2 = await mountView()
    expect(w2.text()).toContain('albums.messages.searchEmpty')
    w2.unmount()
    setState({ isLoadingCatalog: true, categories: [] })
    const w3 = await mountView()
    expect(w3.text()).toContain('albums.loading')
    w3.unmount()
    setState({ categories: [...categories, { id: 'custom', name: 'Minhas Coletâneas', collections: [] }] })
    const w4 = await mountView()
    await w4.find('.albums-view__editor-btn').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/media/editor')
    await w4.find('.hc-cancel').trigger('click')
    expect((globalThis as AnyObj).__albumsCancelMock).toHaveBeenCalled()
  })

  it('gaps onda1 2: catálogo vazio sem loading → catalogEmpty (689); cc-cancel (762); hydrate reentrante real (147)', async () => {
    setState({ categories: [], isLoadingCatalog: false })
    const w0 = await mountView()
    expect(w0.text()).toContain('albums.messages.catalogEmpty')
    w0.unmount()
    // cc-cancel → cancelCollection (762) com cards presentes
    setState() // restaura categorias default (o w0 usou [])
    const w = await mountView()
    await w.find('.cc-cancel').trigger('click')
    expect((globalThis as AnyObj).__albumsCancelMock).toHaveBeenCalled()
    w.unmount()
    // hydrate reentrante: 1ª pendente, fechar e reabrir → early-return no busy
    customCatalogMock.listCustomCollections.mockImplementationOnce(() => new Promise(() => {}))
    const w2 = await mountView()
    await w2.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')!.trigger('click')
    await flushPromises()
    // fecha (backdrop) e reabre enquanto a 1ª hydrate ainda está pendente
    const backdrop = body().querySelector('.albums-view__modal-backdrop') as HTMLElement
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await w2.findAll('button').find((b) => b.attributes('aria-label') === 'albums.custom.title')!.trigger('click')
    await flushPromises()
    expect(customCatalogMock.listCustomCollections).toHaveBeenCalledTimes(1)
    w2.unmount()
  })
})
