// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@modules/liturgy/components/LiturgyAnnotationStage.vue', () => ({
  default: { name: 'LiturgyAnnotationStage', props: ['embedded'], template: '<div class="annotation-stub" />' },
}))
vi.mock('@shared/services/workspace-api', () => ({ resolveMediaUrl: (p: string) => `local://media/${p}` }))

import { CAROUSEL_RUNTIME_STORAGE_KEY } from '../../services/carousel-runtime'
import AnnouncementsCarouselStage from '../AnnouncementsCarouselStage.vue'

type Listener = (event: MessageEvent) => void
const channels: Array<{ name: string; listeners: Listener[]; closed: boolean }> = []

class FakeChannel {
  listeners: Listener[] = []
  closed = false
  constructor(public name: string) {
    channels.push(this)
  }
  addEventListener(_type: string, fn: Listener) { this.listeners.push(fn) }
  removeEventListener(_type: string, fn: Listener) { this.listeners = this.listeners.filter((l) => l !== fn) }
  close() { this.closed = true }
}

beforeEach(() => {
  localStorage.clear()
  channels.length = 0
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

afterEach(() => vi.unstubAllGlobals())

describe('AnnouncementsCarouselStage', () => {
  it('desligado: tela preta vazia', () => {
    const w = mount(AnnouncementsCarouselStage)
    expect(w.find('.annotation-stub').exists()).toBe(false)
    expect(w.find('[data-test="carousel-image"]').exists()).toBe(false)
  })

  it('lê o estado salvo ao abrir e mostra a imagem', () => {
    localStorage.setItem(CAROUSEL_RUNTIME_STORAGE_KEY, JSON.stringify({ active: true, kind: 'image', relativePath: 'modulos/avisos/a/1.png' }))
    const w = mount(AnnouncementsCarouselStage, { props: { embedded: true } })
    expect(w.find('[data-test="carousel-image"]').attributes('src')).toBe('local://media/modulos/avisos/a/1.png')
    expect(w.classes()).toContain('carousel-stage--embedded')
  })

  it('segue o canal: texto mostra a tela de anotação; ao desmontar fecha o canal', async () => {
    const w = mount(AnnouncementsCarouselStage, { props: { embedded: true } })
    const channel = channels[0]!
    channel.listeners.forEach((l) => l(new MessageEvent('message', { data: { active: true, kind: 'text' } })))
    await flushPromises()
    expect(w.findComponent({ name: 'LiturgyAnnotationStage' }).props('embedded')).toBe(true)
    w.unmount()
    expect(channel.closed).toBe(true)
  })

  it('segue o storage de outra janela e ignora outras chaves', async () => {
    const w = mount(AnnouncementsCarouselStage)
    localStorage.setItem(CAROUSEL_RUNTIME_STORAGE_KEY, JSON.stringify({ active: true, kind: 'image', relativePath: 'modulos/avisos/a/2.png' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra' }))
    await flushPromises()
    expect(w.find('[data-test="carousel-image"]').exists()).toBe(false)
    window.dispatchEvent(new StorageEvent('storage', { key: CAROUSEL_RUNTIME_STORAGE_KEY }))
    await flushPromises()
    expect(w.find('[data-test="carousel-image"]').attributes('src')).toContain('2.png')
    w.unmount()
  })

  it('sem BroadcastChannel ainda funciona pelo storage', () => {
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('não') } })
    expect(() => mount(AnnouncementsCarouselStage).unmount()).not.toThrow()
  })
})
