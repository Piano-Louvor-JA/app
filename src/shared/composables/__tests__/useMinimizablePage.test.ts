// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { useMinimizedPagesStore } from '@shared/stores/useMinimizedPagesStore'

const genie = vi.hoisted(() => ({
  calls: [] as Array<{ el: unknown; target: unknown; direction: string; itemsAtStart: number }>,
  target: { left: 1, top: 2, width: 3, height: 4 },
}))
vi.mock('@shared/services/genie-animation', async () => {
  const { useMinimizedPagesStore } = await import('@shared/stores/useMinimizedPagesStore')
  return {
    predictMinimizedTarget: () => genie.target,
    playGenie: async (el: unknown, target: unknown, direction: string) => {
      genie.calls.push({ el, target, direction, itemsAtStart: useMinimizedPagesStore().items.length })
    },
  }
})
const instant = vi.hoisted(() => ({ requests: 0 }))
vi.mock('@shared/composables/useInstantPageTransition', () => ({
  requestInstantPageTransition: () => {
    instant.requests++
  },
}))
import { useNavigationHistoryStore } from '@shared/stores/useNavigationHistoryStore'

import { installNavigationHistory } from '../useNavigationHistory'
import { useMinimizablePage } from '../useMinimizablePage'
import { VIEW_SCROLL_MEMORY, type ViewScrollMemory } from '../useViewScrollMemory'

const originalBridge = window.louvorja
let router: Router
let uninstall: () => void
let minimize: () => Promise<void>
let takeRestoredState: () => unknown
let prepare: () => void

const main = document.createElement('main')
main.getBoundingClientRect = () => ({ x: 0, y: 100, width: 1600, height: 700 }) as DOMRect

function scrollMemory(): ViewScrollMemory {
  return {
    restore: vi.fn(),
    captureCurrent: vi.fn(() => [{ path: [0], top: 480, left: 0 }]),
    seed: vi.fn(),
    getRoot: () => main,
  }
}

async function mountPage(
  path: string,
  { provideScroll = true, extra = {} as Record<string, unknown> } = {},
) {
  await router.push(path)
  const Page = defineComponent({
    setup() {
      ;({ minimize, takeRestoredState, prepare } = useMinimizablePage({
        describe: () => ({ title: 'Hinário Adventista', icon: 'ti-book', summary: 'Busca: santo' }),
        capture: () => ({ collectionId: '5', searchQuery: 'santo' }),
        fallbackRoute: { name: 'albums' },
        ...extra,
      }))
      return () => null
    },
  })
  return mount(
    defineComponent({
      setup() {
        return () => h(Page)
      },
      provide: provideScroll ? { [VIEW_SCROLL_MEMORY as symbol]: scrollMemory() } : {},
    }),
    { global: { plugins: [router] } },
  )
}

beforeEach(async () => {
  sessionStorage.clear()
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: {} },
      { path: '/albums', name: 'albums', component: {} },
      { path: '/albums/:collectionId', name: 'albums-collection', component: {} },
    ],
  })
  uninstall = installNavigationHistory({ router })
  window.louvorja = {
    ...originalBridge,
    isElectron: true,
    zoom: { getFactor: () => 1 },
    window: { capturePreview: vi.fn(async () => 'data:image/jpeg;base64,AA') },
  } as unknown as typeof window.louvorja
})

afterEach(() => {
  uninstall()
  window.louvorja = originalBridge
  vi.useRealTimers()
})

describe('useMinimizablePage', () => {
  it('minimizar guarda o retrato completo da página', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: 1_700_000_000_000 })
    await router.push('/')
    const w = await mountPage('/albums/5')
    await minimize()
    expect(useMinimizedPagesStore().items).toEqual([
      {
        fullPath: '/albums/5',
        routeName: 'albums-collection',
        title: 'Hinário Adventista',
        icon: 'ti-book',
        summary: 'Busca: santo',
        state: { collectionId: '5', searchQuery: 'santo' },
        scroll: [{ path: [0], top: 480, left: 0 }],
        preview: 'data:image/jpeg;base64,AA',
        minimizedAt: 1_700_000_000_000,
      },
    ])
    w.unmount()
  })

  it('com tela anterior no histórico, minimizar volta para ela (Q1)', async () => {
    await router.push('/')
    const w = await mountPage('/albums/5')
    expect(useNavigationHistoryStore().canGoBack).toBe(true)
    await minimize()
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/'))
    w.unmount()
  })

  it('sem tela anterior, minimizar vai para a rota de reserva', async () => {
    const w = await mountPage('/albums/5')
    expect(useNavigationHistoryStore().canGoBack).toBe(false)
    await minimize()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('albums')
    w.unmount()
  })

  it('fora do AppShell (sem memória de rolagem): sem rolagem e sem miniatura', async () => {
    const w = await mountPage('/albums/5', { provideScroll: false })
    await minimize()
    const [item] = useMinimizedPagesStore().items
    expect(item.scroll).toEqual([])
    expect(item.preview).toBeNull()
    w.unmount()
  })

  it('rota sem nome guarda routeName null', async () => {
    router.addRoute({ path: '/livre', component: {} })
    const w = await mountPage('/livre')
    await minimize()
    expect(useMinimizedPagesStore().items[0].routeName).toBeNull()
    w.unmount()
  })

  it('takeRestoredState entrega o retrato pendente desta página uma vez só', async () => {
    const store = useMinimizedPagesStore()
    store.minimize({
      fullPath: '/albums/5',
      routeName: 'albums-collection',
      title: 'Hinário Adventista',
      icon: 'ti-book',
      summary: '',
      state: { collectionId: '5', searchQuery: 'santo' },
      scroll: [],
      preview: null,
      minimizedAt: 1,
    })
    store.reopen('/albums/5')
    const w = await mountPage('/albums/5')
    expect(takeRestoredState()).toEqual({ collectionId: '5', searchQuery: 'santo' })
    expect(takeRestoredState()).toBeNull()
    w.unmount()
  })
})

describe('useMinimizablePage — janelas (ex.: Playlists)', () => {
  it('fullPath próprio vira o endereço do item na barra', async () => {
    const onMinimized = vi.fn()
    const w = await mountPage('/albums', {
      extra: { fullPath: () => '/albums?painel=playlists', onMinimized },
    })
    await minimize()
    expect(useMinimizedPagesStore().items[0].fullPath).toBe('/albums?painel=playlists')
    w.unmount()
  })

  it('onMinimized substitui a navegação (a janela só fecha)', async () => {
    await router.push('/')
    const onMinimized = vi.fn()
    const w = await mountPage('/albums', { extra: { onMinimized } })
    expect(useNavigationHistoryStore().canGoBack).toBe(true)
    await minimize()
    await flushPromises()
    expect(onMinimized).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.fullPath).toBe('/albums')
    w.unmount()
  })
})

describe('useMinimizablePage — efeito gênio e desempenho', () => {
  beforeEach(() => {
    genie.calls.length = 0
    instant.requests = 0
  })

  it('o efeito começa já no clique (antes de o item entrar na barra) e a troca de página é instantânea', async () => {
    const pageRoot = document.createElement('section')
    main.innerHTML = ''
    main.appendChild(pageRoot)
    await router.push('/')
    const w = await mountPage('/albums/5')
    const navigation = vi.fn()
    const off = router.beforeEach(() => {
      navigation(genie.calls.length, instant.requests)
    })

    await minimize()
    await flushPromises()

    expect(genie.calls).toHaveLength(1)
    expect(genie.calls[0]).toMatchObject({ el: pageRoot, target: genie.target, direction: 'minimize', itemsAtStart: 0 })
    expect(useMinimizedPagesStore().items).toHaveLength(1)
    // navegação só depois do efeito, já com o pedido de troca instantânea
    expect(navigation).toHaveBeenCalledWith(1, 1)
    off()
    w.unmount()
  })

  it('janela (onMinimized) não pede troca de página instantânea', async () => {
    const w = await mountPage('/albums', { extra: { onMinimized: vi.fn() } })
    await minimize()
    expect(instant.requests).toBe(0)
    w.unmount()
  })

  it('animateEl troca o que anima (ex.: janela)', async () => {
    const panel = document.createElement('div')
    const w = await mountPage('/albums', { extra: { animateEl: () => panel, onMinimized: vi.fn() } })
    await minimize()
    expect(genie.calls[0].el).toBe(panel)
    w.unmount()
  })

  it('prepare captura a miniatura antes; minimize usa a pronta sem capturar de novo', async () => {
    const capture = (window.louvorja as any).window.capturePreview as ReturnType<typeof vi.fn>
    const w = await mountPage('/albums/5')
    prepare()
    prepare() // já em andamento: não repete
    await flushPromises()
    expect(capture).toHaveBeenCalledTimes(1)
    await minimize()
    expect(capture).toHaveBeenCalledTimes(1)
    expect(useMinimizedPagesStore().items[0].preview).toBe('data:image/jpeg;base64,AA')
    w.unmount()
  })

  it('miniatura preparada há muito tempo é capturada de novo', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: 0 })
    const capture = (window.louvorja as any).window.capturePreview as ReturnType<typeof vi.fn>
    const w = await mountPage('/albums/5')
    prepare()
    await flushPromises()
    vi.setSystemTime(10_000)
    await minimize()
    expect(capture).toHaveBeenCalledTimes(2)
    w.unmount()
  })
})
