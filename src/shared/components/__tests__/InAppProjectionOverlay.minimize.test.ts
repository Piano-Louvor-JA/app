// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemDisplay } from '@modules/settings/types/projection'

const mocks = vi.hoisted(() => ({ list: vi.fn(), subscribe: vi.fn(), settings: vi.fn() }))
vi.mock('@modules/settings/services/projection-preferences', () => ({ loadProjectionSettings: mocks.settings }))
vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: mocks.list,
  subscribeDisplaysChanged: mocks.subscribe,
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@modules/settings/components/StagePaletteButton.vue', () => ({
  default: { template: '<div />' },
}))
import InAppProjectionOverlay from '../InAppProjectionOverlay.vue'
import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'

const primary = { id: 1, isPrimary: true } as SystemDisplay
const extended = { id: 2, isPrimary: false } as SystemDisplay
let changed: (displays: SystemDisplay[]) => void
const unsubscribe = vi.fn()
const wrappers: ReturnType<typeof mount>[] = []
async function render(scope = 'bible') {
  const wrapper = mount(InAppProjectionOverlay, {
    attachTo: document.body,
    props: { label: 'Bíblia', closeLabel: 'Fechar', hint: 'ESC', scope },
    slots: { default: '<div class="live-stage">Conteúdo ativo</div>' },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers()
  mocks.list.mockResolvedValue([primary])
  mocks.settings.mockReturnValue({ targetDisplayIds: [2] })
  mocks.subscribe.mockImplementation((callback) => { changed = callback; return unsubscribe })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('minimizar projeção interna', () => {
  it('oculta fechar, minimizar, dica e paleta após 5s; movimento mostra tudo', async () => {
    const wrapper = await render()
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('.inapp-projection__toolbar').isVisible()).toBe(false)
    expect(wrapper.get('.inapp-projection__stage-palette').isVisible()).toBe(false)
    window.dispatchEvent(new MouseEvent('mousemove'))
    await nextTick()
    expect(wrapper.get('.inapp-projection__toolbar').isVisible()).toBe(true)
    expect(wrapper.get('.inapp-projection__stage-palette').isVisible()).toBe(true)
  })

  it('abre em fullscreen, sai ao minimizar e retorna ao restaurar', async () => {
    const request = vi.fn().mockResolvedValue(undefined)
    const exit = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
    const wrapper = await render()
    expect(request).toHaveBeenCalledOnce()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: wrapper.element })
    await wrapper.get('[data-testid="minimize-projection"]').trigger('click')
    expect(exit).toHaveBeenCalledOnce()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    useInAppProjectionMinimized('bible').value = false
    await nextTick()
    expect(request).toHaveBeenCalledTimes(2)
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
  })
  it('três monitores conectados com estendidos desmarcados: mostra minimizar', async () => {
    mocks.list.mockResolvedValue([primary, extended, { ...extended, id: 3 }])
    mocks.settings.mockReturnValue({ targetDisplayIds: [] })
    const wrapper = await render()
    expect(wrapper.find('[data-testid="minimize-projection"]').exists()).toBe(true)
    await wrapper.get('[data-testid="minimize-projection"]').trigger('click')
    expect(wrapper.get('.inapp-projection').isVisible()).toBe(false)
    expect(wrapper.find('.inapp-projection-restore').exists()).toBe(false)
    useInAppProjectionMinimized(wrapper.props('scope') as string).value = false
    await nextTick()
    expect(wrapper.get('.inapp-projection').isVisible()).toBe(true)
    mocks.settings.mockReturnValue({ targetDisplayIds: [2] })
    window.dispatchEvent(new MouseEvent('mousemove'))
    await nextTick()
    expect(wrapper.find('[data-testid="minimize-projection"]').exists()).toBe(false)
  })
  it.each(['bible', 'clock', 'timer', 'countdown', 'random'])('oferece minimizar/restaurar no módulo %s', async (scope) => {
    const wrapper = await render(scope)
    await wrapper.get('[data-testid="minimize-projection"]').trigger('click')
    expect(document.documentElement.classList.contains('inapp-projection-open')).toBe(false)
    useInAppProjectionMinimized(wrapper.props('scope') as string).value = false
    await nextTick()
    expect(document.documentElement.classList.contains('inapp-projection-open')).toBe(true)
  })

  it('hotplug prevalece sobre uma leitura inicial atrasada', async () => {
    let resolveList!: (displays: SystemDisplay[]) => void
    mocks.list.mockReturnValue(new Promise<SystemDisplay[]>((resolve) => { resolveList = resolve }))
    const wrapper = await render()
    changed([primary, extended])
    resolveList([primary])
    await flushPromises()
    expect(wrapper.find('[data-testid="minimize-projection"]').exists()).toBe(false)
  })

  it('recolhe só a projeção e restaura o mesmo conteúdo sem encerrar', async () => {
    const wrapper = await render()
    const stage = wrapper.get('.live-stage').element
    await wrapper.get('[data-testid="minimize-projection"]').trigger('click')
    expect(wrapper.get('.inapp-projection').isVisible()).toBe(false)
    expect(wrapper.find('.inapp-projection-restore').exists()).toBe(false)
    expect(wrapper.emitted('close')).toBeUndefined()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeUndefined()
    useInAppProjectionMinimized(wrapper.props('scope') as string).value = false
    await nextTick()
    expect(wrapper.get('.inapp-projection').isVisible()).toBe(true)
    expect(wrapper.get('.live-stage').element).toBe(stage)
  })

  it('oculta em 5 segundos e reinicia o prazo quando o mouse se move', async () => {
    const wrapper = await render()
    await vi.advanceTimersByTimeAsync(4999)
    expect(wrapper.get('[data-testid="minimize-projection"]').isVisible()).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.find('[data-testid="minimize-projection"]').exists()).toBe(false)
    window.dispatchEvent(new MouseEvent('mousemove'))
    await nextTick()
    expect(wrapper.get('[data-testid="minimize-projection"]').isVisible()).toBe(true)
    await vi.advanceTimersByTimeAsync(4000)
    window.dispatchEvent(new MouseEvent('mousemove'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('[data-testid="minimize-projection"]').isVisible()).toBe(true)
  })

  it('não oferece minimizar com estendido, nem se a lista for desconhecida', async () => {
    mocks.list.mockResolvedValue([primary, extended])
    const wrapper = await render()
    expect(wrapper.find('[data-testid="minimize-projection"]').exists()).toBe(false)
    changed([])
    await nextTick()
    expect(wrapper.find('[data-testid="minimize-projection"]').exists()).toBe(false)
    changed([primary])
    await nextTick()
    expect(wrapper.find('[data-testid="minimize-projection"]').exists()).toBe(true)
  })

  it('restaura ao conectar estendido e remove inscrição ao desmontar', async () => {
    const wrapper = await render()
    await wrapper.get('[data-testid="minimize-projection"]').trigger('click')
    changed([primary, extended])
    await nextTick()
    expect(wrapper.get('.inapp-projection').isVisible()).toBe(true)
    expect(wrapper.find('[data-testid="restore-projection"]').exists()).toBe(false)
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
