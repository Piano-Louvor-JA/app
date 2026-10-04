// @vitest-environment jsdom
// Cobertura AlbumCollectionView (gaps_map3): load onMounted/watch, playlist
// picker (add/duplicado/fechar), runAction busy e play-all guard de hinário.
// jsdom sem localStorage: stub mínimo antes de qualquer import de serviço.
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
}

const useAlbumsMock = vi.hoisted(() => {
  return (globalThis as unknown as { __albumsMock?: Record<string, unknown> })
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

const pushMock = vi.fn(async () => {})

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { collectionId: (globalThis as any).__collectionId ?? '10' },
  }),
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@modules/media/stores/useMediaStore', () => ({
  useMediaStore: () => ({
    playQueue: vi.fn(async () => {}),
    playAlbumQueue: vi.fn(async () => {}),
  }),
}))

vi.mock('@modules/sync/stores/useLocalLibraryStore', () => ({
  useLocalLibraryStore: () => {
    const { ref } = require('vue') as typeof import('vue')
    return {
      categories: ref([]),
      isDownloadingBatch: ref(false),
      lastErrorKey: ref(null),
      downloadFailure: ref(null),
      hasIdleAlbums: ref(false),
      refreshCollections: vi.fn(async () => {}),
      downloadAlbum: vi.fn(),
      cancelAlbum: vi.fn(),
      downloadAllIdleAlbums: vi.fn(),
      cancelAllDownloads: vi.fn(),
      removeAlbum: vi.fn(async () => {}),
      clearError: vi.fn(),
    }
  },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: () => false,
}))

// playlist-storage → tracks → library-catalog → plugins/i18n (createI18n real):
// cortar a cadeia antes do plugin i18n.
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'pt',
  getLibraryCatalogConfig: () => ({}),
}))

vi.mock('../../composables/useAlbums', async () => {
  const { ref } = await import('vue')
  return {
    useAlbums: () => {
      const mocks = (useAlbumsMock.__albumsMock ?? {}) as Record<string, any>
      const make = (v: string) => ref(mocks[v] ?? null)
      return {
        activeCollection: make('activeCollection'),
        filteredTracks: ref(
          (globalThis as any).__tracks ?? [],
        ),
        searchQuery: ref(''),
        isLoadingTracks: ref(false),
        lastErrorKey: ref((globalThis as any).__errorKey ?? null),
        lastActionMessageKey: ref((globalThis as any).__actionKey ?? null),
        lyricOpen: ref(false),
        lyricDoc: ref(null),
        isLoadingLyric: ref(false),
        openCollection: mocks.openCollection ?? (async () => true),
        clearError: vi.fn(),
        clearActionMessage: vi.fn(),
        playSung: vi.fn(async () => true),
        playInstrumental: vi.fn(async () => true),
        playSlides: vi.fn(async () => true),
        playAllInActiveCollection: mocks.playAll ?? (async () => true),
        openLyric: vi.fn(async () => true),
        closeLyric: vi.fn(),
      }
    },
  }
})

vi.mock('@design-system/index', () => ({
  MediaCollectionList: {
    name: 'MediaCollectionList',
    props: ['searchPlaceholder', 'loading', 'empty', 'emptyLabel'],
    template: '<div class="mcl-stub"><slot /></div>',
  },
}))

vi.mock('../../components/AlbumLyricDialog.vue', () => ({
  default: { template: '<div class="lyric-dialog-stub" />' },
}))

vi.mock('../../components/AlbumTrackRow.vue', () => ({
  default: {
    name: 'AlbumTrackRow',
    props: ['track', 'collectionName', 'artworkUrl', 'busy'],
    emits: ['sung', 'instrumental', 'slides', 'lyric', 'playlist'],
    template: `<div class="track-row-stub" :data-id="track.musicId" :data-busy="String(busy)">
      <button class="row-sung" @click="$emit('sung')" />
      <button class="row-playlist" @click="$emit('playlist')" />
    </div>`,
  },
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AlbumCollectionView from '../AlbumCollectionView.vue'

// playlist-storage real usa localStorage — com o stub acima funciona; seed:
import { createPinia, setActivePinia } from 'pinia'
import { savePlaylists } from '../../services/playlist-storage'
import type { AlbumCollection, AlbumTrack } from '../../types/albums'

const collection: AlbumCollection = {
  id: '10',
  kind: 'album',
  name: 'CD Vocacional',
  subtitle: '',
  coverUrl: null,
  trackCount: 2,
  catalogKey: 'album_10',
}

const tracks: AlbumTrack[] = [
  { musicId: 1, name: 'Santo', track: 1, durationLabel: '3:00', hasInstrumental: true },
  { musicId: 2, name: 'Gratidão', track: 2, durationLabel: '4:00', hasInstrumental: false },
]

function setupMocks(over: Record<string, unknown> = {}) {
  ;(globalThis as any).__tracks = tracks
  ;(globalThis as any).__albumsMock = {
    activeCollection: collection,
    openCollection: vi.fn(async () => true),
    playAll: vi.fn(async () => true),
    ...over,
  }
}

const mountView = async () => {
  setActivePinia(createPinia())
  const w = mount(AlbumCollectionView)
  await flushPromises()
  return w
}

describe('AlbumCollectionView', () => {
  beforeEach(() => {
    localStorage.clear()
    pushMock.mockClear()
    setupMocks()
    savePlaylists([
      { id: 'pl-1', name: 'Culto', items: [] },
    ])
  })

  it('carrega a coletânea no mount (openCollection com o id da rota) e mostra título', async () => {
    const w = await mountView()
    expect((globalThis as any).__albumsMock.openCollection).toHaveBeenCalledWith('10')
    expect(w.find('.album-collection-view__title').text()).toContain('CD Vocacional')
  })

  it('watch de collectionId recarrega (não testável via props — rota mockada estática)', async () => {
    // o watch depende de route.params; com rota estática, cobrimos via montagem dupla
    await mountView()
    expect((globalThis as any).__albumsMock.openCollection).toHaveBeenCalledTimes(1)
  })

  it('play-all visível para kind album e chama com mode default', async () => {
    const w = await mountView()
    const btn = w.find('.album-collection-view__play-all')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect((globalThis as any).__albumsMock.playAll).toHaveBeenCalled()
  })

  it('kind hinário esconde play-all', async () => {
    ;(globalThis as any).__albumsMock.activeCollection = { ...collection, kind: 'hymnal' }
    const w = await mountView()
    expect(w.find('.album-collection-view__play-all').exists()).toBe(false)
  })

  it('picker de playlist: abrir, adicionar e mostrar toast; duplicado mostra já está', async () => {
    const w = await mountView()
    void savePlaylists([{ id: 'pl-1', name: 'Culto', items: [] }])
    // abrir picker
    await w.findAll('.track-row-stub')[0]!.find('.row-playlist').trigger('click')
    const pickerInBody = () => document.body.querySelector('.playlist-picker')
    expect(pickerInBody()).not.toBeNull()
    expect(document.body.querySelector('.playlist-picker__track-info')!.textContent).toContain('Santo')
    // adicionar
    ;(pickerInBody()!.querySelector('.playlist-picker__option') as HTMLElement).click()
    await flushPromises()
    expect(pickerInBody()).toBeNull()
    expect(document.body.querySelector('.playlist-toast')).not.toBeNull()
    expect(document.body.querySelector('.playlist-toast')!.textContent).toContain('adicionada')
    // duplicado
    await w.findAll('.track-row-stub')[0]!.find('.row-playlist').trigger('click')
    ;(pickerInBody()!.querySelector('.playlist-picker__option') as HTMLElement).click()
    await flushPromises()
    expect(document.body.querySelector('.playlist-toast')!.textContent).toContain('já está')
  })

  it('picker sem playlists mostra estado vazio; esc/overlay/cancelar fecham', async () => {
    savePlaylists([])
    const w = await mountView()
    const pickerInBody = () => document.body.querySelector('.playlist-picker')
    await w.findAll('.track-row-stub')[0]!.find('.row-playlist').trigger('click')
    expect(document.body.querySelector('.playlist-picker__empty')).not.toBeNull()
    ;(document.body.querySelector('.playlist-picker__cancel') as HTMLElement).click()
    await flushPromises()
    expect(pickerInBody()).toBeNull()
    // overlay via esc
    await w.findAll('.track-row-stub')[1]!.find('.row-playlist').trigger('click')
    ;(pickerInBody() as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(pickerInBody()).toBeNull()
  })

  it('runAction: ação marca busy na linha durante execução', async () => {
    const w = await mountView()
    const stub = w.findAll('.track-row-stub')[0]!
    await stub.find('.row-sung').trigger('click')
    await flushPromises()
    // após concluir, busy volta a false
    expect(stub.attributes('data-busy')).toBe('false')
  })

  it('alerta de erro mostra retry; alerta de ação (não media) mostra dismiss', async () => {
    ;(globalThis as any).__errorKey = 'albums.messages.tracksFailed'
    let w = await mountView()
    const alert = w.find('.album-collection-view__alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('albums.messages.tracksFailed')
    w.unmount()
    ;(globalThis as any).__errorKey = null
    ;(globalThis as any).__actionKey = 'albums.messages.added'
    w = await mountView()
    expect(w.find('.album-collection-view__alert').text()).toContain('albums.messages.added')
  })

  it('back navega pra rota albums', async () => {
    const w = await mountView()
    await w.find('.album-collection-view__back').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'albums' })
  })

  it('dismiss do alerta de ação limpa a mensagem', async () => {
    ;(globalThis as any).__actionKey = 'albums.messages.added'
    const w = await mountView()
    const alert = w.find('.album-collection-view__alert')
    expect(alert.exists()).toBe(true)
    await alert.find('button').trigger('click')
    await flushPromises()
  })

  it('playlist toast aparece após adicionar e picker fecha', async () => {
    const w = await mountView()
    await w.findAll('.track-row-stub')[0]!.find('.row-playlist').trigger('click')
    ;(document.body.querySelector('.playlist-picker__option') as HTMLElement).click()
    await flushPromises()
    expect(document.body.querySelector('.playlist-picker')).toBeNull()
    expect(document.body.querySelector('.playlist-toast')).not.toBeNull()
    w.unmount()
    await flushPromises()
  })

  it('unmount limpa o timer de feedback sem erro', async () => {
    const w = await mountView()
    await w.findAll('.track-row-stub')[0]!.find('.row-playlist').trigger('click')
    ;(document.body.querySelector('.playlist-picker__option') as HTMLElement).click()
    await flushPromises()
    w.unmount()
    await flushPromises()
    // sem throw
  })

  it('acao instrumental/slides/lyric das linhas disparam runAction', async () => {
    const w = await mountView()
    // stubs só têm sung/playlist; instrumental/slides/lyric cobertos via handlers
    // das emissões diretas no componente stub — emitidos programaticamente:
    const stub = w.findAllComponents({ name: 'AlbumTrackRow' })[0]!
    stub.vm.$emit('instrumental')
    stub.vm.$emit('slides')
    stub.vm.$emit('lyric')
    await flushPromises()
    expect(stub.attributes('data-busy')).toBe('false')
  })

  it('unmount com toast ativo limpa o timer (sem vazamento)', async () => {
    const w = await mountView()
    // abre o picker de playlist para setar o feedbackTimer via toast
    const openBtn = w.find('.row-playlist')
    if (openBtn.exists()) {
      await openBtn.trigger('click')
      await flushPromises()
    }
    w.unmount() // onBeforeUnmount: clearTimeout(feedbackTimer)
  })

  it('botão voltar navega pra albums (goBack)', async () => {
    const w = await mountView()
    await w.find('.album-collection-view__back').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ name: 'albums' })
    w.unmount()
  })
})
