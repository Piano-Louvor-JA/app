import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { saveFontSelection } from '@shared/services/font-preferences'
import { useProjectionFont } from '../useProjectionFont'
const loader = vi.hoisted(() => ({ load: vi.fn(async (id: string) => `'${id}'`) }))
vi.mock('@shared/services/font-loader', () => ({ loadLocalFont: loader.load }))
describe('projection font runtime', () => {
  it('keeps factory typography and resolves independent per-window families and live inheritance', async () => {
    localStorage.clear()
    const component = (scope: string) => defineComponent({ setup() { return { style: useProjectionFont(scope) } }, template: '<div :style="style" />' })
    const bible = mount(component('bible'))
    const hymns = mount(component('hymns'))
    expect(bible.attributes('style') ?? '').not.toContain('font-family')
    saveFontSelection('global', 'inter')
    saveFontSelection('bible', 'lora')
    await flushPromises(); await nextTick()
    expect(bible.attributes('style')).toContain('lora')
    expect(hymns.attributes('style')).toContain('inter')
    saveFontSelection('bible', null)
    await flushPromises()
    expect(bible.attributes('style')).toContain('inter')
    bible.unmount(); hymns.unmount()
  })
  it('falls back safely for missing files and ignores stale asynchronous loads', async () => {
    localStorage.clear()
    saveFontSelection('bible', 'inter')
    let finish: ((v: string) => void) | undefined
    loader.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const w = mount(defineComponent({ setup() { return { style: useProjectionFont('bible') } }, template: '<div :style="style" />' }))
    saveFontSelection('bible', 'lora')
    await flushPromises()
    finish?.("'inter'")
    await flushPromises()
    expect(w.attributes('style')).toContain('lora')
    loader.load.mockImplementation(async (id: string) => { if (id === 'merriweather') throw new Error('missing'); return `'${id}'` })
    saveFontSelection('bible', 'merriweather')
    await flushPromises()
    expect(w.attributes('style')).toContain('Plus Jakarta Sans')
    w.unmount()
  })
})
