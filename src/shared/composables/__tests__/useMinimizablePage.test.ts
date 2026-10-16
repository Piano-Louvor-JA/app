// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { useMinimizedPagesStore } from '@shared/stores/useMinimizedPagesStore'
import { useNavigationHistoryStore } from '@shared/stores/useNavigationHistoryStore'

import { installNavigationHistory } from '../useNavigationHistory'
import { useMinimizablePage } from '../useMinimizablePage'
import { VIEW_SCROLL_MEMORY, type ViewScrollMemory } from '../useViewScrollMemory'

const originalBridge = window.louvorja
let router: Router
let uninstall: () => void
let minimize: () => Promise<void>
let takeRestoredState: () => unknown

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

async function mountPage(path: string, { provideScroll = true } = {}) {
  await router.push(path)
  const Page = defineComponent({
    setup() {
      ;({ minimize, takeRestoredState } = useMinimizablePage({
        describe: () => ({ title: 'Hinário Adventista', icon: 'ti-book', summary: 'Busca: santo' }),
        capture: () => ({ collectionId: '5', searchQuery: 'santo' }),
        fallbackRoute: { name: 'albums' },
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
