// @vitest-environment jsdom
/**
 * Cobertura: AppTitlebar.vue (task t_86847917).
 * Titlebar custom do Electron — só visível na janela principal de desktop
 * (isDesktopApp) fora de projeção. Testa: visibilidade, controles
 * (minimize/maximize/close), estado maximized, plataforma mac, sync da
 * CSS var --app-titlebar-height e cleanup no unmount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

vi.mock('@assets/brand/logo-louvor-ja.svg', () => ({ default: 'logo.svg' }))

import AppTitlebar from '@layouts/AppTitlebar.vue'

type WindowControl = (action: string) => Promise<unknown>

const originalLouvorja = window.louvorja

function setBridge(bridge: unknown) {
  Object.defineProperty(window, 'louvorja', {
    value: bridge,
    configurable: true,
    writable: true,
  })
}

function makeBridge() {
  return {
    isElectron: true,
    platform: 'linux',
    window: {
      control: vi.fn(async (action: string) =>
        action === 'is-maximized' ? false : undefined,
      ) as WindowControl,
      onMaximizedState: vi.fn(() => () => {}),
    },
  }
}

let router: Router

beforeEach(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()
})

afterEach(() => {
  setBridge(originalLouvorja)
  document.documentElement.classList.remove('electron-shell')
  document.documentElement.style.removeProperty('--app-titlebar-height')
  vi.restoreAllMocks()
})

function mountBar() {
  return mount(AppTitlebar, {
    global: {
      plugins: [router],
    },
  })
}

describe('AppTitlebar', () => {
  it('não renderiza no browser (sem bridge Electron)', async () => {
    setBridge(undefined)
    const w = mountBar()
    await flushPromises()
    expect(w.find('.app-titlebar').exists()).toBe(false)
    // Documento NÃO pode receber a classe electron-shell
    expect(document.documentElement.classList.contains('electron-shell')).toBe(false)
    w.unmount()
  })

  it('não renderiza na janela de projeção (rota projection)', async () => {
    const routerProj = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        {
          path: '/popup',
          name: 'projection-popup',
          component: { template: '<div />' },
          meta: { projection: true },
        },
      ],
    })
    await routerProj.push('/popup')
    await routerProj.isReady()
    setBridge(makeBridge())
    const w = mount(AppTitlebar, { global: { plugins: [routerProj] } })
    await flushPromises()
    expect(w.find('.app-titlebar').exists()).toBe(false)
    w.unmount()
  })

  it('renderiza no desktop e sincroniza --app-titlebar-height', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = mountBar()
    await flushPromises()

    expect(w.find('.app-titlebar').exists()).toBe(true)
    expect(document.documentElement.classList.contains('electron-shell')).toBe(true)
    expect(
      document.documentElement.style.getPropertyValue('--app-titlebar-height'),
    ).toBe('32px')

    // Consulta estado maximized no mount
    expect(bridge.window.control).toHaveBeenCalledWith('is-maximized')
    w.unmount()
  })

  it('controles chamam window.control (minimize/maximize/close)', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = mountBar()
    await flushPromises()

    const btns = w.findAll('.app-titlebar__btn')
    expect(btns.length).toBe(3)
    await btns[0].trigger('click')
    await btns[1].trigger('click')
    await btns[2].trigger('click')
    await flushPromises()

    const calls = (bridge.window.control as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toContainEqual(['minimize'])
    expect(calls).toContainEqual(['maximize'])
    expect(calls).toContainEqual(['close'])
    w.unmount()
  })

  it('reflete estado maximized no ícone e via callback do bridge', async () => {
    let cb: ((state: boolean) => void) | null = null
    const bridge = makeBridge()
    ;(bridge.window.onMaximizedState as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (state: boolean) => void) => {
        cb = fn
        return () => {
          cb = null
        }
      },
    )
    ;(bridge.window.control as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (action: string) => (action === 'is-maximized' ? true : undefined),
    )
    setBridge(bridge)
    const w = mountBar()
    await flushPromises()

    // maximizado → ícone ti-copy (2º botão)
    expect(w.findAll('.app-titlebar__btn i')[1].classes()).toContain('ti-copy')

    // callback do main desmaximiza → volta ti-square
    cb?.(false)
    await w.vm.$nextTick()
    const icons = w.findAll('.app-titlebar__btn i')
    expect(icons[1].classes()).toContain('ti-square')
    w.unmount()
  })

  it('título exibe o nome do produto', async () => {
    setBridge(makeBridge())
    const w = mountBar()
    await flushPromises()
    expect(w.find('.app-titlebar__title').text()).toBe('LouvorJA - PIANO')
    w.unmount()
  })

  it('desfaz a CSS var e listeners no unmount', async () => {
    setBridge(makeBridge())
    const w = mountBar()
    await flushPromises()
    w.unmount()
    expect(document.documentElement.classList.contains('electron-shell')).toBe(false)
    expect(
      document.documentElement.style.getPropertyValue('--app-titlebar-height'),
    ).toBe('0px')
  })

  it('plataforma mac: controles de tráfego no lado esquerdo', async () => {
    const bridge = makeBridge()
    ;(bridge as { platform: string }).platform = 'darwin'
    setBridge(bridge)
    const w = mountBar()
    await flushPromises()

    expect(w.find('.app-titlebar--mac').exists()).toBe(true)
    const macBtns = w.findAll('.app-titlebar__mac-btn')
    expect(macBtns.length).toBe(3)
    // Ordem mac: close, minimize, maximize
    await macBtns[0].trigger('click')
    await macBtns[1].trigger('click')
    await macBtns[2].trigger('click')
    await flushPromises()
    const calls = (bridge.window.control as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toContainEqual(['close'])
    expect(calls).toContainEqual(['minimize'])
    expect(calls).toContainEqual(['maximize'])
    w.unmount()
  })

  it('blur/focus alterna o estado de foco dos controles mac', async () => {
    const bridge = makeBridge()
    ;(bridge as { platform: string }).platform = 'darwin'
    setBridge(bridge)
    const w = mountBar()
    await flushPromises()

    window.dispatchEvent(new Event('blur'))
    await w.vm.$nextTick()
    expect(w.find('.app-titlebar__mac-controls--unfocused').exists()).toBe(true)

    window.dispatchEvent(new Event('focus'))
    await w.vm.$nextTick()
    expect(w.find('.app-titlebar__mac-controls--unfocused').exists()).toBe(false)
    w.unmount()
  })
})
