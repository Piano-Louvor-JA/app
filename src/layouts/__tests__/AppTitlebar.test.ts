// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive } from 'vue'

vi.mock('@assets/brand/logo-louvor-ja.svg', () => ({ default: 'logo.svg' }))

const routeState = reactive({
  name: 'media' as string | undefined,
  path: '/media',
  meta: {} as Record<string, unknown>,
})
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
}))

type ControlAction = 'minimize' | 'maximize' | 'close' | 'is-maximized'
const controlMock = vi.fn(async (_action: ControlAction) => true as boolean | null)
const onMaximizedCb = { fn: null as ((state: boolean) => void) | null }
const unsubscribeMaximized = vi.fn(() => {
  onMaximizedCb.fn = null
})
const onMaximizedMock = vi.fn((cb: (state: boolean) => void) => {
  onMaximizedCb.fn = cb
  return unsubscribeMaximized
})

function setBridge(bridge: unknown | null) {
  ;(window as unknown as { louvorja?: unknown }).louvorja = bridge
}

import AppTitlebar from '@layouts/AppTitlebar.vue'

describe('AppTitlebar.vue', () => {
  beforeEach(() => {
    controlMock.mockReset()
    controlMock.mockImplementation(async () => true)
    onMaximizedMock.mockClear()
    unsubscribeMaximized.mockClear()
    onMaximizedCb.fn = null
    routeState.name = 'media'
    routeState.meta = {}
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
    window.history.replaceState({}, '', '/media')
    vi.stubGlobal('window', window)
  })

  afterEach(() => {
    setBridge(null)
    vi.unstubAllGlobals()
  })

  it('não renderiza fora do desktop app (sem bridge)', () => {
    setBridge(null)
    const wrapper = mount(AppTitlebar)
    expect(wrapper.find('.app-titlebar').exists()).toBe(false)
    expect(document.documentElement.classList.contains('electron-shell')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--app-titlebar-height')).toBe('0px')
    wrapper.unmount()
  })

  it('renderiza controles Windows quando bridge.isElectron', async () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(wrapper.find('.app-titlebar').exists()).toBe(true)
    expect(wrapper.find('.app-titlebar--mac').exists()).toBe(false)
    expect(wrapper.find('.app-titlebar__title').text()).toBeTruthy()
    // consulta estado inicial de maximizado
    expect(controlMock).toHaveBeenCalledWith('is-maximized')
    // assina mudanças de maximizado
    expect(onMaximizedMock).toHaveBeenCalled()
    wrapper.unmount()
    expect(unsubscribeMaximized).toHaveBeenCalled()
  })

  it('remove listeners e classe no unmount', () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(AppTitlebar)
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function))
    expect(document.documentElement.classList.contains('electron-shell')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--app-titlebar-height')).toBe('0px')
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('clique nos botões chama control(minimize/maximize/close)', async () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    const btns = wrapper.findAll('.app-titlebar__btn')
    expect(btns).toHaveLength(3)
    await btns[0]!.trigger('click')
    await btns[1]!.trigger('click')
    await btns[2]!.trigger('click')
    await flushPromises()
    expect(controlMock).toHaveBeenCalledWith('minimize')
    expect(controlMock).toHaveBeenCalledWith('maximize')
    expect(controlMock).toHaveBeenCalledWith('close')
    wrapper.unmount()
  })

  it('ícone do botão maximizar reflete estado via callback onMaximizedState', async () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    controlMock.mockImplementation(async (action: ControlAction) => (action === 'is-maximized' ? true : null))
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(controlMock).toHaveBeenCalledWith('is-maximized')
    expect(wrapper.find('.ti-copy').exists()).toBe(true)
    // callback externo altera estado
    onMaximizedCb.fn?.(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ti-copy').exists()).toBe(false)
    expect(wrapper.find('.ti-square').exists()).toBe(true)
    wrapper.unmount()
  })

  it('is-maximized retornando false não marca maximizado', async () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    controlMock.mockImplementation(async (action: ControlAction) => (action === 'is-maximized' ? false : null))
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(wrapper.find('.ti-square').exists()).toBe(true)
    wrapper.unmount()
  })

  it('bridge sem window: não consulta maximizado nem assina', async () => {
    setBridge({ isElectron: true, platform: 'win32' })
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(controlMock).not.toHaveBeenCalled()
    expect(onMaximizedMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('bridge.window com funções retornando null (bridge antiga): cliques no-op sem erro', async () => {
    const nullControl = vi.fn(async () => null)
    setBridge({ isElectron: true, platform: 'win32', window: { control: nullControl, onMaximizedState: onMaximizedMock } })
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    const btns = wrapper.findAll('.app-titlebar__btn')
    await btns[0]!.trigger('click')
    await flushPromises()
    expect(nullControl).toHaveBeenCalledWith('minimize')
    wrapper.unmount()
  })

  it('platform darwin renderiza controles mac (close/minimize/maximize + título central)', async () => {
    setBridge({ isElectron: true, platform: 'darwin', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(wrapper.find('.app-titlebar--mac').exists()).toBe(true)
    const macBtns = wrapper.findAll('.app-titlebar__mac-btn')
    expect(macBtns).toHaveLength(3)
    await macBtns[0]!.trigger('click') // close
    await macBtns[1]!.trigger('click') // minimize
    await macBtns[2]!.trigger('click') // maximize
    await flushPromises()
    expect(controlMock).toHaveBeenCalledWith('close')
    expect(controlMock).toHaveBeenCalledWith('minimize')
    expect(controlMock).toHaveBeenCalledWith('maximize')
    expect(wrapper.find('.app-titlebar__mac-title').text()).toBeTruthy()
    wrapper.unmount()
  })

  it('blur remove foco dos controles mac; focus restaura', async () => {
    setBridge({ isElectron: true, platform: 'darwin', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(wrapper.find('.app-titlebar__mac-controls--unfocused').exists()).toBe(false)
    window.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-titlebar__mac-controls--unfocused').exists()).toBe(true)
    window.dispatchEvent(new Event('focus'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-titlebar__mac-controls--unfocused').exists()).toBe(false)
    wrapper.unmount()
  })

  it('rota de projeção (meta.projection) esconde titlebar e zera altura', async () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    routeState.meta = { projection: true }
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(wrapper.find('.app-titlebar').exists()).toBe(false)
    expect(document.documentElement.classList.contains('electron-shell')).toBe(false)
    wrapper.unmount()
  })

  it('rota projection-popup esconde titlebar', () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    routeState.name = 'projection-popup'
    const wrapper = mount(AppTitlebar)
    expect(wrapper.find('.app-titlebar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('location /popup esconde titlebar (isProjectionPopupLocation)', () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    window.history.replaceState({}, '', '/popup')
    const wrapper = mount(AppTitlebar)
    expect(wrapper.find('.app-titlebar').exists()).toBe(false)
    wrapper.unmount()
    window.history.replaceState({}, '', '/media')
  })

  it('watch(visible): sair de rota de projeção adiciona classe electron-shell', async () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    routeState.meta = { projection: true }
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(document.documentElement.classList.contains('electron-shell')).toBe(false)
    routeState.meta = {}
    // routeState é reactive: watch(visible) dispara o callback syncTitlebarHeight(true)
    await flushPromises()
    expect(document.documentElement.classList.contains('electron-shell')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--app-titlebar-height')).toBe('32px')
    wrapper.unmount()
  })

  it('is-maximized retornando null (bridge antiga) trata como não maximizado', async () => {
    setBridge({ isElectron: true, platform: 'win32', window: { control: controlMock, onMaximizedState: onMaximizedMock } })
    controlMock.mockImplementation(async () => null)
    const wrapper = mount(AppTitlebar)
    await flushPromises()
    expect(wrapper.find('.ti-square').exists()).toBe(true)
    wrapper.unmount()
  })
})

