// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { computed, ref } from 'vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  confirm: vi.fn(),
  project: vi.fn(),
  resolve: vi.fn(),
  duplicate: vi.fn(),
  removeFolder: vi.fn(),
  carousel: null as unknown as Record<string, unknown>,
}))

vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string, arg?: unknown) => (arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@shared/composables/useMinimizablePage', () => ({ useMinimizablePage: () => ({ minimize: vi.fn(), prepare: vi.fn() }) }))
vi.mock('@shared/components/PageBackStack.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('@shared/composables/useAppConfirm', () => ({ appConfirm: mocks.confirm }))
vi.mock('@modules/liturgy/services/annotation-projection', () => ({
  useAnnotationProjection: () => ({ projectingItemId: ref('t1') }),
}))
vi.mock('../../services/announcements-projection', () => ({ projectAnnouncement: mocks.project }))
vi.mock('../../services/announcements-files', async (original) => ({
  ...await original<typeof import('../../services/announcements-files')>(),
  resolveAnnouncementFiles: mocks.resolve,
  duplicateAnnouncementWithFiles: mocks.duplicate,
  removeAnnouncementFolder: mocks.removeFolder,
}))
vi.mock('../../composables/useAnnouncementsCarousel', () => ({ useAnnouncementsCarousel: () => mocks.carousel }))
vi.mock('@shared/components/IndependentProjectionButton.vue', () => ({
  default: { name: 'IndependentProjectionButton', props: ['moduleId', 'obs', 'claimed', 'beforeProject'], template: '<button class="independent-stub" />' },
}))
vi.mock('../../components/AnnouncementsCarouselStage.vue', () => ({ default: { template: '<div class="stage-stub" />' } }))
vi.mock('../../components/AnnouncementEditorDialog.vue', () => ({
  default: { name: 'AnnouncementEditorDialog', props: ['item', 'isNew'], emits: ['close', 'save', 'notice'], template: '<div class="editor-stub" />' },
}))
vi.mock('../../components/AnnouncementNameDialog.vue', () => ({
  default: { name: 'AnnouncementNameDialog', props: ['open', 'title', 'initialName'], emits: ['close', 'save'], template: '<div class="name-stub" />' },
}))

import { useAnnouncementsStore } from '../../stores/useAnnouncementsStore'
import AnnouncementsView from '../AnnouncementsView.vue'

let wrapper: VueWrapper | null = null

function makeCarousel() {
  const status = ref<'idle' | 'playing' | 'paused' | 'ended'>('idle')
  return {
    status,
    index: ref(0),
    total: ref(2),
    isActive: computed(() => status.value !== 'idle'),
    start: vi.fn(async () => {
      status.value = 'playing'
      return true
    }),
    pause: vi.fn(() => { status.value = 'paused' }),
    resume: vi.fn(() => { status.value = 'playing' }),
    next: vi.fn(),
    prev: vi.fn(),
    stop: vi.fn(() => { status.value = 'idle' }),
    setSlideMs: vi.fn(),
    setLoop: vi.fn(),
    independent: ref(false),
    prepareIndependent: vi.fn(async () => true),
  }
}

async function mountView() {
  wrapper = mount(AnnouncementsView)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  for (const fn of [mocks.push, mocks.confirm, mocks.project, mocks.resolve, mocks.duplicate, mocks.removeFolder]) fn.mockReset()
  mocks.resolve.mockResolvedValue({ absolutePaths: [], missing: [] })
  mocks.project.mockResolvedValue({ ok: true })
  mocks.carousel = makeCarousel()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
})

describe('AnnouncementsView', () => {
  it('lista vazia mostra o título e o estado vazio', async () => {
    const w = await mountView()
    expect(w.find('[data-test="empty"]').exists()).toBe(true)
    expect(w.find('.announcements-view__title').text()).toBe('announcements.title')
  })

  it('botões de adicionar abrem o editor com rascunho novo do tipo; salvar grava na lista', async () => {
    const w = await mountView()
    expect(w.find('[data-test="add-url"]').text()).toContain('announcements.kinds.url')
    await w.find('[data-test="add-images"]').trigger('click')
    const editor = w.findComponent({ name: 'AnnouncementEditorDialog' })
    expect(editor.props('isNew')).toBe(true)
    expect(editor.props('item')).toMatchObject({ kind: 'images', files: [] })
    editor.vm.$emit('save', { ...editor.props('item'), title: 'Fotos', files: [{ relativePath: 'modulos/avisos/x/1.png', name: '1.png' }] })
    await flushPromises()
    expect(w.findComponent({ name: 'AnnouncementEditorDialog' }).exists()).toBe(false)
    expect(useAnnouncementsStore().activeList.items).toHaveLength(1)
    expect(w.text()).toContain('Fotos')
  })

  it('aviso do editor e fechar sem salvar', async () => {
    const w = await mountView()
    await w.find('[data-test="add-text"]').trigger('click')
    const editor = w.findComponent({ name: 'AnnouncementEditorDialog' })
    editor.vm.$emit('notice', 'announcements.notices.pickFailed')
    editor.vm.$emit('close')
    await flushPromises()
    expect(w.find('[data-test="notice"]').text()).toContain('announcements.notices.pickFailed')
    expect(w.findComponent({ name: 'AnnouncementEditorDialog' }).exists()).toBe(false)
  })

  it('linha: projetar, editar, duplicar, excluir; texto no ar fica marcado', async () => {
    const store = useAnnouncementsStore()
    store.addAnnouncement({ id: 't1', kind: 'text', title: 'Batismo', titleColor: '', html: '<p>x</p>', plainText: 'x' })
    mocks.duplicate.mockImplementation(async (item: { id: string }, id: string) => ({ ...item, id }))
    mocks.confirm.mockResolvedValue(true)
    const w = await mountView()

    expect(w.find('.announcement-row').classes()).toContain('announcement-row--projecting')
    await w.find('[data-test="row-project"]').trigger('click')
    await flushPromises()
    expect(mocks.project).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), expect.anything())

    await w.find('[data-test="row-edit"]').trigger('click')
    expect(w.findComponent({ name: 'AnnouncementEditorDialog' }).props('isNew')).toBe(false)

    await w.find('[data-test="row-duplicate"]').trigger('click')
    await flushPromises()
    expect(store.activeList.items).toHaveLength(2)

    await w.findAll('[data-test="row-remove"]')[1]!.trigger('click')
    await flushPromises()
    expect(store.activeList.items).toHaveLength(1)
  })

  it('falha ao projetar vira aviso de erro, que some sozinho', async () => {
    vi.useFakeTimers()
    useAnnouncementsStore().addAnnouncement({ id: 'v', kind: 'video', title: 'V', file: { relativePath: 'modulos/avisos/v/1.mp4', name: 'v.mp4' } })
    mocks.project.mockResolvedValue({ ok: false, key: 'announcements.notices.missing', params: { names: 'v.mp4' } })
    const w = await mountView()
    await w.find('[data-test="row-project"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="notice"]').text()).toBe('announcements.notices.missing:{"names":"v.mp4"}')
    expect(w.find('[data-test="notice"]').classes()).toContain('announcements-view__notice--error')
    vi.advanceTimersByTime(7000)
    await flushPromises()
    expect(w.find('[data-test="notice"]').exists()).toBe(false)
  })

  it('arquivo ausente marca a linha', async () => {
    useAnnouncementsStore().addAnnouncement({ id: 'v', kind: 'video', title: 'V', file: { relativePath: 'modulos/avisos/v/1.mp4', name: 'v.mp4' } })
    mocks.resolve.mockResolvedValue({ absolutePaths: [], missing: ['v.mp4'] })
    const w = await mountView()
    expect(w.find('[data-test="missing-badge"]').exists()).toBe(true)
  })

  it('listas: criar e renomear pelo diálogo de nome', async () => {
    const w = await mountView()
    await w.find('[data-test="list-create"]').trigger('click')
    const dialog = w.findComponent({ name: 'AnnouncementNameDialog' })
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('title')).toBe('announcements.lists.newTitle')
    dialog.vm.$emit('save', 'Jovens')
    await flushPromises()
    expect(useAnnouncementsStore().activeList.name).toBe('Jovens')

    await w.find('[data-test="list-rename"]').trigger('click')
    expect(dialog.props('title')).toBe('announcements.lists.rename')
    expect(dialog.props('initialName')).toBe('Jovens')
    dialog.vm.$emit('save', 'Culto JA')
    await flushPromises()
    expect(useAnnouncementsStore().activeList.name).toBe('Culto JA')

    await w.find('[data-test="list-create"]').trigger('click')
    dialog.vm.$emit('close')
    await flushPromises()
    expect(dialog.props('open')).toBe(false)
  })

  it('carrossel: iniciar, pausar/continuar, anterior/próximo, parar, tempo e repetição', async () => {
    const w = await mountView()
    const carousel = mocks.carousel as ReturnType<typeof makeCarousel>
    await w.find('[data-test="carousel-start"]').trigger('click')
    await flushPromises()
    expect(carousel.start).toHaveBeenCalledWith([], { slideMs: 5_000, loop: true })
    expect(w.find('[data-test="carousel-position"]').text()).toBe('announcements.carousel.position:{"current":1,"total":2}')

    await w.find('[data-test="carousel-toggle"]').trigger('click')
    expect(carousel.pause).toHaveBeenCalled()
    await w.find('[data-test="carousel-toggle"]').trigger('click')
    expect(carousel.resume).toHaveBeenCalled()
    await w.find('[data-test="carousel-next"]').trigger('click')
    await w.find('[data-test="carousel-prev"]').trigger('click')
    expect(carousel.next).toHaveBeenCalled()
    expect(carousel.prev).toHaveBeenCalled()

    const seconds = w.find('[data-test="carousel-seconds"]')
    await seconds.setValue('8')
    expect(carousel.setSlideMs).toHaveBeenCalledWith(8000)
    await seconds.setValue('0')
    expect(carousel.setSlideMs).toHaveBeenCalledTimes(1)
    await w.find('[data-test="carousel-loop"]').setValue(false)
    expect(carousel.setLoop).toHaveBeenCalledWith(false)
    expect(useAnnouncementsStore().carousel).toEqual({ slideMs: 8000, loop: false })

    await w.find('[data-test="carousel-stop"]').trigger('click')
    expect(w.find('[data-test="carousel-start"]').exists()).toBe(true)
  })

  it('carrossel sem slides avisa; projetar aviso para o carrossel; trocar de lista para', async () => {
    const carousel = mocks.carousel as ReturnType<typeof makeCarousel>
    carousel.start.mockResolvedValueOnce(false)
    useAnnouncementsStore().addAnnouncement({ id: 'v', kind: 'video', title: 'V', file: null })
    const w = await mountView()
    expect(w.text()).toContain('announcements.carousel.skipped')
    await w.find('[data-test="carousel-start"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="notice"]').text()).toContain('announcements.carousel.empty')

    carousel.status.value = 'playing'
    await w.find('[data-test="row-project"]').trigger('click')
    await flushPromises()
    expect(carousel.stop).toHaveBeenCalledTimes(1)

    carousel.status.value = 'playing'
    useAnnouncementsStore().createList('Outra')
    await flushPromises()
    expect(carousel.stop).toHaveBeenCalledTimes(2)
  })

  it('projeção independente do carrossel: botão com conexões remotas, prepara a lista ativa e avisa lista vazia', async () => {
    const carousel = mocks.carousel as ReturnType<typeof makeCarousel>
    const w = await mountView()
    const button = w.findComponent({ name: 'IndependentProjectionButton' })
    expect(button.props('moduleId')).toBe('announcements-carousel')
    expect(button.props('obs')).toBeUndefined()
    expect(button.props('claimed')).toBe(false)
    const prepare = button.props('beforeProject') as () => Promise<boolean>
    await expect(prepare()).resolves.toBe(true)
    expect(carousel.prepareIndependent).toHaveBeenCalledWith([], { slideMs: 5_000, loop: true })
    carousel.prepareIndependent.mockResolvedValueOnce(false)
    await expect(prepare()).resolves.toBe(false)
    await flushPromises()
    expect(w.find('[data-test="notice"]').text()).toContain('announcements.carousel.empty')
  })

  it('ajuda do carrossel abre e fecha; o botão do aviso tira e devolve ao carrossel', async () => {
    useAnnouncementsStore().addAnnouncement({ id: 't1', kind: 'text', title: 'Batismo', titleColor: '', html: '<p>x</p>', plainText: 'x' })
    const w = await mountView()
    expect(w.find('[data-test="carousel-help-box"]').exists()).toBe(false)
    await w.find('[data-test="carousel-help"]').trigger('click')
    expect(w.find('[data-test="carousel-help"]').attributes('aria-expanded')).toBe('true')
    expect(w.find('[data-test="carousel-help-box"]').text()).toContain('announcements.carousel.help.toggle')
    await w.find('[data-test="carousel-help"]').trigger('click')
    expect(w.find('[data-test="carousel-help-box"]').exists()).toBe(false)

    expect(w.text()).not.toContain('announcements.carousel.skipped')
    await w.find('[data-test="row-carousel"]').trigger('click')
    expect(useAnnouncementsStore().activeList.items[0]).toMatchObject({ inCarousel: false })
    expect(w.text()).toContain('announcements.carousel.skipped')
    await w.find('[data-test="row-carousel"]').trigger('click')
    expect(useAnnouncementsStore().activeList.items[0]).not.toHaveProperty('inCarousel')
  })

  it('voltar leva a Utilitários e fechar o aviso o limpa', async () => {
    const w = await mountView()
    await w.find('.announcements-view__back').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ name: 'utilities' })
    await w.find('[data-test="list-duplicate"]').trigger('click')
    mocks.confirm.mockResolvedValue(false)
    await w.find('[data-test="list-remove"]').trigger('click')
    await flushPromises()
    expect(useAnnouncementsStore().lists).toHaveLength(2)
  })
})
