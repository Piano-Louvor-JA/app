import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useAnnouncementsStore } from '../../../announcements/stores/useAnnouncementsStore'
import { createAnnouncementsHandlers } from '../announcements-handlers'

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
function setup() {
  const store = useAnnouncementsStore()
  store.addAnnouncement({ id: 'text-1', kind: 'text', title: 'Aviso', plainText: 'Reunião', html: '<p>Reunião</p>', titleColor: '' })
  store.addAnnouncement({ id: 'url-1', kind: 'url', title: 'Site', url: 'https://example.com' })
  const carousel = { status: ref('idle'), index: ref(0), total: ref(0), currentSlide: ref(null), start: vi.fn(async () => true), pause: vi.fn(), resume: vi.fn(), next: vi.fn(), prev: vi.fn(), stop: vi.fn(), setSlideMs: vi.fn(), setLoop: vi.fn() }
  const project = vi.fn(async () => ({ ok: true as const }))
  return { store, carousel, project, handler: createAnnouncementsHandlers({ store, carousel, project }) }
}
describe('anúncios controlados pelo APK', () => {
  it('espelha listas e conteúdo sem expor caminhos locais', () => {
    const { handler, store } = setup()
    const state = handler.snapshot()
    expect(state.activeListId).toBe(store.activeListId)
    expect(state.lists[0].items).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'text-1', title: 'Aviso', text: 'Reunião', inCarousel: true })]))
  })
  it('seleciona lista, abre aviso real e rejeita identificador inválido', async () => {
    const { handler, store, project } = setup()
    expect(await handler.execute('announcements.open', { targetId: 'text-1' })).toBe(true)
    expect(project).toHaveBeenCalledWith(expect.objectContaining({ id: 'text-1' }))
    expect(await handler.execute('announcements.open', { targetId: 'missing' })).toBe(false)
    const id = store.createList('Segunda')
    store.setActiveList(store.lists[0]!.id)
    expect(await handler.execute('announcements.selectList', { targetId: id })).toBe(true)
    expect(store.activeListId).toBe(id)
    expect(await handler.execute('announcements.selectList', { targetId: 'missing' })).toBe(false)
  })
  it('configura carrossel, controla transporte e preserva exclusões', async () => {
    const { handler, store, carousel } = setup()
    expect(await handler.execute('announcements.setCarousel', { durationMs: 10000, enabled: false })).toBe(true)
    expect(store.carousel).toEqual({ slideMs: 10000, loop: false })
    expect(await handler.execute('announcements.setCarousel', { durationMs: -1 })).toBe(false)
    expect(await handler.execute('announcements.include', { targetId: 'url-1', enabled: true })).toBe(false)
    expect(await handler.execute('announcements.include', { targetId: 'text-1', enabled: false })).toBe(true)
    expect(await handler.execute('announcements.start', {})).toBe(true)
    expect(carousel.start).toHaveBeenCalledWith(store.activeList.items, store.carousel)
    for (const action of ['pause', 'resume', 'next', 'previous', 'stop']) expect(await handler.execute(`announcements.${action}`, {})).toBe(true)
    expect(carousel.prev).toHaveBeenCalledOnce()
    expect(await handler.execute('announcements.unknown', {})).toBe(false)
  })
})
