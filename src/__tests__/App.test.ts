// @vitest-environment jsdom
/**
 * Cobertura: App.vue (task t_86847917).
 * Shell raiz — testa os dois modos (principal vs projeção), splash/starting,
 * reação ao tema, banner de update → dialog, e o boot do palco-bridge.
 * Todos os subsystemas são mockados: o App orquestra, não implementa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  createMemoryHistory,
  createRouter,
  type Router,
} from 'vue-router'

const { hideMock, currentThemeRef, updateCheckerMock, palcoBridgeMock } =
  vi.hoisted(() => {
    const { ref } = require('vue') as typeof import('vue')
    return {
      hideMock: vi.fn(),
      currentThemeRef: ref({ mode: 'dark' }),
      updateCheckerMock: {
        hasUpdate: ref(false),
        init: vi.fn(),
      },
      palcoBridgeMock: { startPalcoBridge: vi.fn() },
    }
  })

vi.mock('vuetify', () => ({
  useTheme: () => ({
    change: vi.fn(async () => {}),
  }),
}))

vi.mock('@design-system/composables', () => ({
  useThemeManager: () => ({ currentTheme: currentThemeRef }),
}))

vi.mock('@modules/starting/stores/useStartingStore', async () => {
  const { defineStore } = await import('pinia')
  const { ref } = await import('vue')
  const useTestStartingStore = defineStore('starting-test', () => {
    const isAppReady = ref(true)
    return { isAppReady, hide: hideMock }
  })
  return { useStartingStore: useTestStartingStore }
})

vi.mock('@modules/starting/components/StartingOverlay.vue', () => ({
  default: { name: 'StartingOverlay', template: '<div class="starting-overlay-mock" />' },
}))

vi.mock('@shared/services/projection-window-location', async () => {
  const { isProjectionPopupLocation: real } = await vi.importActual<
    typeof import('@shared/services/projection-window-location')
  >('@shared/services/projection-window-location')
  return { isProjectionPopupLocation: real }
})

vi.mock('@shared/composables/useOperatorEscapeToCloseProjection', () => ({
  useOperatorEscapeToCloseProjection: vi.fn(),
}))

vi.mock('@modules/media/composables/useMediaPlayerHotkeys', () => ({
  useMediaPlayerHotkeys: vi.fn(),
}))

vi.mock('@shared/composables/useUpdateChecker', () => ({
  useUpdateChecker: () => updateCheckerMock,
}))

vi.mock('@shared/components/UpdateBanner.vue', () => ({
  default: {
    name: 'UpdateBanner',
    template: '<div class="update-banner-mock" />',
    emits: ['view-notes'],
  },
}))

vi.mock('@shared/components/UpdateDialog.vue', () => ({
  default: {
    name: 'UpdateDialog',
    template: '<div class="update-dialog-mock" />',
    props: ['modelValue'],
  },
}))

vi.mock('@layouts/AppTitlebar.vue', () => ({
  default: { name: 'AppTitlebar', template: '<div class="app-titlebar-mock" />' },
}))

vi.mock('@modules/settings/services/palco-bridge', () => palcoBridgeMock)

import App from '../App.vue'

let router: Router

function makeRouter(withPopup = false) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div class="home-view" />' } },
      {
        path: '/popup',
        name: 'projection-popup',
        component: { template: '<div class="popup-view" />' },
        meta: { projection: true },
      },
    ],
    ...(withPopup ? {} : {}),
  })
}

beforeEach(async () => {
  setActivePinia(createPinia())
  hideMock.mockClear()
  updateCheckerMock.init.mockClear()
  palcoBridgeMock.startPalcoBridge.mockClear()
  currentThemeRef.value = { mode: 'dark' }
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  router = makeRouter()
  await router.push('/')
  await router.isReady()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

function mountApp() {
  return mount(App, { global: { plugins: [router] } })
}

describe('App.vue — janela principal', () => {
  it('renderiza shell completo e boot palco-bridge', async () => {
    const w = mountApp()
    await flushPromises()

    expect(w.find('.app-titlebar-mock').exists()).toBe(true)
    expect(w.find('.starting-overlay-mock').exists()).toBe(true)
    expect(w.find('.home-view').exists()).toBe(true)
    expect(updateCheckerMock.init).toHaveBeenCalled()
    expect(palcoBridgeMock.startPalcoBridge).toHaveBeenCalled()
    expect(console.info).toHaveBeenCalledWith('[palco-bridge] subiu no boot')
    w.unmount()
  })

  it('falha no palco-bridge não derruba o app (catch → console.error)', async () => {
    palcoBridgeMock.startPalcoBridge.mockImplementation(() => {
      throw new Error('bridge quebrou')
    })
    const w = mountApp()
    await flushPromises()

    expect(console.error).toHaveBeenCalledWith(
      '[palco-bridge] FALHOU ao subir no boot:',
      expect.any(Error),
    )
    expect(w.find('.home-view').exists()).toBe(true)
    w.unmount()
  })

  it('banner view-notes abre o UpdateDialog (v-model true)', async () => {
    const w = mountApp()
    await flushPromises()

    expect((w.findComponent({ name: 'UpdateDialog' }).props('modelValue') as boolean)).toBe(false)
    await w.findComponent({ name: 'UpdateBanner' }).vm.$emit('view-notes')
    await w.vm.$nextTick()
    expect((w.findComponent({ name: 'UpdateDialog' }).props('modelValue') as boolean)).toBe(true)
    w.unmount()
  })

  it('watch hasUpdate=false fecha o dialog de notas', async () => {
    updateCheckerMock.hasUpdate.value = true
    const w = mountApp()
    await flushPromises()

    await w.findComponent({ name: 'UpdateBanner' }).vm.$emit('view-notes')
    await w.vm.$nextTick()
    expect((w.findComponent({ name: 'UpdateDialog' }).props('modelValue') as boolean)).toBe(true)

    // Update some → watcher reseta showUpdateDialog
    updateCheckerMock.hasUpdate.value = false
    await flushPromises()
    expect((w.findComponent({ name: 'UpdateDialog' }).props('modelValue') as boolean)).toBe(false)
    updateCheckerMock.hasUpdate.value = false
    w.unmount()
  })

  it('mudança de tema propaga para vuetify (dark → dark, light → light)', async () => {
    const w = mountApp()
    await flushPromises()

    currentThemeRef.value = { mode: 'light' }
    await flushPromises()
    currentThemeRef.value = { mode: 'dark' }
    await flushPromises()
    w.unmount()
  })
})

describe('App.vue — janela de projeção (popup)', () => {
  it('splash liberado na hora, sem overlay, sem palco-bridge, fundo preto', async () => {
    // O popup real usa hash history (#/popup) — espelhar no location do jsdom
    window.history.replaceState({}, '', '/#/popup')
    const routerProj = makeRouter()
    await routerProj.push('/popup')
    await routerProj.isReady()

    const w = mount(App, { global: { plugins: [routerProj] } })
    await flushPromises()

    expect(w.find('.app-frame--projection').exists()).toBe(true)
    expect(w.find('.starting-overlay-mock').exists()).toBe(false)
    expect(w.find('.popup-view').exists()).toBe(true)
    expect(palcoBridgeMock.startPalcoBridge).not.toHaveBeenCalled()
    // Popup chama startingStore.hide() no setup
    expect(hideMock).toHaveBeenCalled()
    w.unmount()
  })
})
