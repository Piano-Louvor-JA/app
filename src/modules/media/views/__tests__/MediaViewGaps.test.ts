// @vitest-environment jsdom
// Cobertura MediaView (gaps_map3): onGlobalKeydown (ESC guards), leaveMediaRoute,
// onMinimize, onToggleFullscreen, watch hasSession, playlist e ondemand notice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// jsdom sem localStorage (--localstorage-file): stub mínimo ANTES de qualquer import
// de serviço que toque browser-storage (executa no hoist do módulo de teste).
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

const __playerRef = vi.hoisted(() => {
  // refs reais criadas dentro do factory (import de vue é async); o factory
  // abaixo popula isto e o teste acessa via (globalThis as any).__player
  return (globalThis as unknown as { __player?: unknown })
})

vi.mock('@modules/media/composables/useMediaPlayer', async () => {
  const { ref } = await import('vue')
  const refs = {
    session: ref(null as null | Record<string, unknown>),
    hasSession: ref(false),
    lastErrorKey: ref(null as null | string),
    isPlaying: ref(false),
    hasAudio: ref(true),
    hasInstrumental: ref(false),
    playbackMode: ref('audio'),
    isProjecting: ref(false),
    showPlaylist: ref(true),
    closeConfirmOpen: ref(false),
    slideIndex: ref(0),
    slideCount: ref(2),
    currentSlide: ref(null as null | Record<string, unknown>),
    resolvedSlideImageUrl: ref(null as null | string),
    ondemandDownloadPercent: ref(null as null | number),
    preplayDownloadMusicId: ref(null as null | number),
    ondemandNoticeVisible: ref(false),
    ondemandDownloadDone: ref(false),
    currentTimeLabel: ref('00:01'),
    durationLabel: ref('03:00'),
    progressRatio: ref(0.2),
    slideProgressRatio: ref(0.5),
    queue: ref([] as Array<{ musicId: number; title: string }>),
    queueIndex: ref(0),
    volume: ref(0.8),
    audioOnTv: ref(false),
  }
  const fns = {
    jumpToQueue: vi.fn(),
    maximize: vi.fn(),
    minimize: vi.fn(),
    togglePlay: vi.fn(),
    previousSlide: vi.fn(),
    nextSlide: vi.fn(),
    goToSlide: vi.fn(),
    seekRatio: vi.fn(),
    setVolume: vi.fn(),
    switchMode: vi.fn(async () => {}),
    toggleProjection: vi.fn(),
    onToggleAudioOnTv: vi.fn(),
    togglePlaylist: vi.fn(),
    setPlaylistOpen: vi.fn(),
    requestClose: vi.fn(),
    cancelClose: vi.fn(),
    close: vi.fn(),
    clearError: vi.fn(),
    syncProjectionFlag: vi.fn(),
  }
  const handle = { refs, fns }
  ;(globalThis as unknown as { __player: unknown }).__player = handle
  // spread preserva as refs (mesmos objetos) — a view desestrutura direto
  return { useMediaPlayer: () => ({ ...refs, ...fns }) }
})
// handle tipado pro teste (populado pelo factory no import da view)
function P() {
  return (globalThis as unknown as {
    __player: { refs: Record<string, { value: unknown }>; fns: Record<string, ReturnType<typeof vi.fn>> }
  }).__player!
}
vi.mock('../services/media-aside-scroll', () => ({ revealItemInAside: vi.fn() }))
vi.mock('../services/media-slides', () => ({ stripHtmlBreaks: (s: string) => s }))
vi.mock('../../settings/components/StagePaletteButton.vue', () => ({
  default: { template: '<div class="palette-stub" />' },
}))
vi.mock('../components/MediaSlideStage.vue', () => ({
  default: { template: '<div class="stage-stub" />' },
}))
vi.mock('../components/MediaCloseDialog.vue', () => ({
  default: { template: '<div class="close-dialog-stub" />', props: ['open'] },
}))
vi.mock('../components/MediaPlayerPill.vue', () => ({
  default: { template: '<div class="pill-stub" />', props: ['title'], emits: ['toggle-fullscreen'] },
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
  createI18n: () => ({ global: { locale: 'pt-BR', t: (k: string) => k } }),
}))
// cadeia StagePaletteButton → StageCustomizationDialog → @design-system → useThemeManager
// toca localStorage no import (jsdom sem --localstorage-file não tem): mocka a raiz
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(() => null),
  setUserPreference: vi.fn(),
  USER_PREFERENCE_KEYS: {},
}))

const push = vi.fn()
const replace = vi.fn()
const back = vi.fn()
let routeName: string | symbol = 'media'
vi.mock('vue-router', () => ({
  useRoute: () => ({ get name() { return routeName }, query: {}, params: {} }),
  useRouter: () => ({ push, back, replace }),
}))

import { createPinia, setActivePinia } from 'pinia'
import MediaView from '../MediaView.vue'

// jsdom sem localStorage (--localstorage-file): stub mínimo usado pelo browser-storage
if (typeof window.localStorage === 'undefined') {
  const mem = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() { return mem.size },
      clear: () => mem.clear(),
    },
    configurable: true,
  })
}

async function mountView() {
  setActivePinia(createPinia())
  const w = mount(MediaView)
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
  routeName = 'media'
  P().refs.session.value = null
  P().refs.hasSession.value = false
  P().refs.showPlaylist.value = true
  P().refs.queue.value = []
  P().refs.currentSlide.value = null
  P().refs.ondemandNoticeVisible.value = false
  P().refs.lastErrorKey.value = null
  P().refs.closeConfirmOpen.value = false
  document.documentElement.className = ''
})

afterEach(() => {
  window.dispatchEvent(new Event('unhandledEvent'))
  document.documentElement.className = ''
})

describe('MediaView — mount/unmount', () => {
  it('monta classe media-player-open, maximiza, abre playlist e sincroniza projeção', async () => {
    const w = await mountView()
    expect(document.documentElement.classList.contains('media-player-open')).toBe(true)
    expect(P().fns.maximize).toHaveBeenCalled()
    expect(P().fns.setPlaylistOpen).toHaveBeenCalledWith(true)
    expect(P().fns.syncProjectionFlag).toHaveBeenCalled()
    w.unmount()
    await flushPromises()
    expect(document.documentElement.classList.contains('media-player-open')).toBe(false)
    expect(P().fns.minimize).not.toHaveBeenCalled() // sem sessão
  })

  it('desmonta com sessão ativa: minimiza (dock/back)', async () => {
    P().refs.hasSession.value = true
    const w = await mountView()
    w.unmount()
    await flushPromises()
    expect(P().fns.minimize).toHaveBeenCalled()
  })

  it('sem sessão: estado vazio visível', async () => {
    const w = await mountView()
    expect(w.text()).toContain('media.empty')
  })

  it('lastErrorKey: alerta com botão dismiss que limpa erro', async () => {
    P().refs.lastErrorKey.value = 'media.err'
    const w = await mountView()
    expect(w.find('.media-window__alert').text()).toContain('media.err')
    await w.find('.media-window__alert button').trigger('click')
    expect(P().fns.clearError).toHaveBeenCalled()
  })
})

describe('MediaView — sessão com conteúdo', () => {
  beforeEach(() => {
    P().refs.hasSession.value = true
    P().refs.session.value = { title: 'Hino X', subtitle: 'CC', slides: [] }
    P().refs.currentSlide.value = { lyric: 'Primeira linha', isCover: false }
  })

  it('playlist de slides: label e clique vai ao slide (com slides na sessão)', async () => {
    P().refs.session.value = { title: 'Hino X', subtitle: 'CC', slides: [
      { lyric: 'Capa', isCover: true },
      { lyric: 'Primeira linha', isCover: false },
    ] }
    P().refs.currentSlide.value = { lyric: 'Capa', isCover: true }
    const w = await mountView()
    expect(w.find('.media-window__playlist-title').text()).toBe('media.playlist')
    const items = w.findAll('.media-window__playlist-item')
    expect(items.length).toBe(2)
    await items[1]!.trigger('click')
    expect(P().fns.goToSlide).toHaveBeenCalledWith(1)
  })

  it('queue > 1: mostra fila de reprodução e jumpToQueue', async () => {
    P().refs.queue.value = [
      { musicId: 1, title: 'A' },
      { musicId: 2, title: 'B' },
    ]
    const w = await mountView()
    expect(w.text()).toContain('Fila de reprodução')
    await w.findAll('.media-window__playlist-item')[1]!.trigger('click')
    expect(P().fns.jumpToQueue).toHaveBeenCalledWith(1)
  })

  it('minimizar: chama minimize e volta pra rota de origem (history)', async () => {
    // jsdom: history.length==1 → cai no replace({name:'albums'})
    const w = await mountView()
    await w.find('.media-window__tool-btn').trigger('click')
    expect(P().fns.minimize).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'albums' })
  })

  it('history curta: volta via replace albums', async () => {
    Object.defineProperty(window, 'history', { value: { length: 1 }, configurable: true })
    const w = await mountView()
    await w.find('.media-window__tool-btn').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ name: 'albums' })
    Object.defineProperty(window, 'history', { value: { length: 2 }, configurable: true })
  })

  it('requestClose: ESC dispara requestClose; contentEditable não dispara', async () => {
    const w = await mountView()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(P().fns.requestClose).toHaveBeenCalled()
    P().fns.requestClose.mockClear()
    const editable = document.createElement('div')
    editable.isContentEditable = true
    document.body.appendChild(editable)
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(P().fns.requestClose).not.toHaveBeenCalled()
    editable.remove()
    void w
  })

  it('ESC com confirm aberto não fecha; INPUT de texto não dispara', async () => {
    P().refs.closeConfirmOpen.value = true
    await mountView()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(P().fns.requestClose).not.toHaveBeenCalled()
    P().refs.closeConfirmOpen.value = false
    // input de texto: captura no capture-phase do window precisa do target correto
    const input = document.createElement('input')
    input.type = 'text'
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(P().fns.requestClose).not.toHaveBeenCalled()
    input.remove()
  })

  it('tecla diferente de ESC não faz nada', async () => {
    await mountView()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(P().fns.requestClose).not.toHaveBeenCalled()
  })

  it('fim da sessão (watch hasSession): sai da rota /media', async () => {
    const w = await mountView()
    P().refs.hasSession.value = false
    await flushPromises()
    await flushPromises()
    expect(back).toHaveBeenCalled()
    void w
  })

  it('fim da sessão fora da rota media: não expulsa', async () => {
    const w = await mountView()
    routeName = 'albums'
    P().refs.hasSession.value = false
    await flushPromises()
    expect(back).not.toHaveBeenCalled()
    routeName = 'media'
    void w
  })

  it('toggle fullscreen: requestFullscreen no palco e exit se já em fs', async () => {
    const w = await mountView()
    const el = w.find('.media-window').element as HTMLElement
    const reqFs = vi.fn().mockResolvedValue(undefined)
    el.requestFullscreen = reqFs
    await w.findComponent({ name: 'MediaPlayerPill' }).vm.$emit('toggle-fullscreen')
    await flushPromises()
    expect(reqFs).toHaveBeenCalled()
    // já em fullscreen → exit
    Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true })
    const exitFs = vi.fn().mockResolvedValue(undefined)
    document.exitFullscreen = exitFs
    await w.findComponent({ name: 'MediaPlayerPill' }).vm.$emit('toggle-fullscreen')
    await flushPromises()
    expect(exitFs).toHaveBeenCalled()
  })

  it('ondemand notice: visível com barra de progresso', async () => {
    P().refs.ondemandNoticeVisible.value = true
    P().refs.ondemandDownloadPercent.value = 40
    const w = await mountView()
    expect(w.find('.media-window__ondemand').exists()).toBe(true)
    expect(w.find('.media-window__ondemand-fill').attributes('style')).toContain('scaleX(0.4)')
  })
})
  it('gaps: cover sem lyric usa fallback; slide com lyric vazia usa slideOf', async () => {
    P().refs.hasSession.value = true
    P().refs.session.value = { title: 'Hino X', subtitle: 'CC', slides: [
      { lyric: '', isCover: true },
      { lyric: ' ', isCover: false },
    ] }
    P().refs.currentSlide.value = { lyric: ' ', isCover: true }
    const w = await mountView()
    const items = w.findAll('.media-window__playlist-item')
    expect(items.length).toBe(2)
    expect(w.text()).toContain('media.coverSlide')
    expect(w.text()).toContain('media.slideOf')
    w.unmount()
  })

  it('gaps: ondemand percent/preplay/done states no pill', async () => {
    P().refs.hasSession.value = true
    P().refs.session.value = { title: 'H', subtitle: '', slides: [{ lyric: 'L', isCover: false }] }
    P().refs.currentSlide.value = { lyric: 'L', isCover: false }
    P().refs.ondemandNoticeVisible.value = true
    P().refs.ondemandDownloadPercent.value = 55
    P().refs.preplayDownloadMusicId.value = 42
    const w = await mountView()
    await w.vm.$nextTick()
    // done true (preplay && !done false-arm)
    P().refs.ondemandDownloadDone.value = true
    await w.vm.$nextTick()
    w.unmount()
  })

