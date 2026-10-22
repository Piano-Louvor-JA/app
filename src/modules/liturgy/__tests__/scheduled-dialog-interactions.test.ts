import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Dialog from '../components/LiturgyScheduledDialog.vue'
import { useScheduledStore } from '../stores/useScheduledStore'

const mocks = vi.hoisted(() => ({ bridge: vi.fn(), catalog: vi.fn(), episodes: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))
vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge: mocks.bridge }))
vi.mock('@shared/services/user-preferences', () => ({ getUserPreference: (_key: string, fallback: unknown) => fallback, setUserPreference: vi.fn() }))
vi.mock('@modules/sync/services/sync-outbox-service', () => ({ enqueueOperatorState: vi.fn(), scheduleOutboxFlush: vi.fn() }))
vi.mock('../services/liturgy-catalog', () => ({ loadLiturgyMusicOptions: mocks.catalog, filterLiturgyMusicOptions: (items: unknown[]) => items }))
vi.mock('../services/provai-e-vede-source', () => ({ extractProvaiEVedeEpisodes: mocks.episodes }))
let wrapper: VueWrapper
function open() {
  wrapper = mount(Dialog, { props: { open: true }, global: { stubs: { teleport: true } } })
  return wrapper
}
async function clickText(text: string) {
  const button = wrapper.findAll('button').find(b => b.text() === text)
  expect(button, text).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
beforeEach(() => {
  setActivePinia(createPinia())
  mocks.bridge.mockReturnValue(null)
  mocks.catalog.mockResolvedValue([{ id: 15, name: 'Adoração', albumNames: 'Hinário' }])
  mocks.episodes.mockReturnValue([{ dateISO: '2099-10-03', title: 'Episódio', url: 'https://example.org/episode.mp4' }])
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<html />' }))
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('diálogo de programação — interação real', () => {
  it('seleciona uma música, salva na rotação padrão e permite remover a entrada', async () => {
    open()
    await flushPromises()
    await wrapper.get('input[type=search]').setValue('Adoração')
    await wrapper.get('.scheduled-dialog__music-option').trigger('click')
    await wrapper.get('.scheduled-dialog__quick-add').trigger('submit')
    const store = useScheduledStore()
    expect(store.items).toHaveLength(1)
    expect(store.items[0]?.content).toMatchObject({ kind: 'music', musicId: 15, musicMode: 'audio' })
    expect(wrapper.get('input[type=search]').element.value).toBe('')
    await wrapper.get('.scheduled-dialog__entry button').trigger('click')
    expect(store.items).toHaveLength(0)
  })

  it('seleciona vídeo local, infere o título e salva o caminho completo', async () => {
    mocks.bridge.mockReturnValue({ dialog: { openFile: vi.fn().mockResolvedValue(['C:\\Videos\\Culto.mp4']) } })
    open()
    await wrapper.get('select').setValue('file')
    await clickText('liturgy.fields.selectVideoButton')
    await wrapper.get('.scheduled-dialog__quick-add').trigger('submit')
    expect(useScheduledStore().items[0]).toMatchObject({ name: 'Culto', content: { kind: 'file', filePath: 'C:\\Videos\\Culto.mp4' } })
  })

  it('salva vídeo online sem exigir uma rotação manual', async () => {
    open()
    await wrapper.get('select').setValue('online_video')
    await wrapper.get('input[type=url]').setValue('https://example.org/video')
    await wrapper.get('.scheduled-dialog__quick-add').trigger('submit')
    expect(useScheduledStore().items[0]).toMatchObject({ name: 'Vídeo', content: { kind: 'online_video', url: 'https://example.org/video' } })
  })

  it('importa episódios selecionados sem disco como vídeo online utilizável', async () => {
    open()
    await wrapper.get('.scheduled-dialog__new-rot input').setValue('Programação')
    await wrapper.get('.scheduled-dialog__new-rot').trigger('submit')
    await clickText('liturgy.messages.scheduledFetchProvai')
    expect(wrapper.findAll('.scheduled-dialog__pv-row')).toHaveLength(1)
    await clickText('liturgy.messages.scheduledDownloadSelected')
    expect(useScheduledStore().items[0]?.content).toEqual({ kind: 'online_video', url: 'https://example.org/episode.mp4' })
  })

  it('fecha pelo botão ou pelo fundo sem alterar programação', async () => {
    open()
    await wrapper.get('.scheduled-dialog__close').trigger('click')
    await wrapper.get('.liturgy-dialog-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
  it('importa em um clique sem disco e conserva a URL de cada episódio futuro', async () => {
    open()
    await clickText('liturgy.messages.scheduledPvOneClick')
    expect(useScheduledStore().items[0]?.content).toEqual({ kind: 'online_video', url: 'https://example.org/episode.mp4' })
    expect(wrapper.text()).toContain('liturgy.messages.scheduledPvDone')
  })

  it('baixa em um clique pela ponte desktop e conserva o arquivo local', async () => {
    const downloadToMedia = vi.fn().mockResolvedValue('/media/episode.mp4')
    const fetchText = vi.fn().mockResolvedValue('<html />')
    mocks.bridge.mockReturnValue({ workspace: { fetchText, downloadToMedia } })
    open()
    await clickText('liturgy.messages.scheduledPvOneClick')
    expect(fetchText).toHaveBeenCalledOnce()
    expect(downloadToMedia).toHaveBeenCalledWith('https://example.org/episode.mp4', 'episode.mp4')
    expect(useScheduledStore().items[0]?.content).toEqual({ kind: 'file', filePath: '/media/episode.mp4' })
  })

  it.each(['empty', 'past', 'http', 'network'])('informa ausência de episódios importáveis: %s', async (failure) => {
    if (failure === 'empty') mocks.episodes.mockReturnValue([])
    if (failure === 'past') mocks.episodes.mockReturnValue([{ dateISO: '2000-01-01', title: 'Antigo', url: 'https://example.org/old.mp4' }])
    if (failure === 'http') vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    if (failure === 'network') vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    open()
    await clickText('liturgy.messages.scheduledPvOneClick')
    expect(useScheduledStore().items).toHaveLength(0)
    expect(wrapper.text()).toContain(failure === 'past' ? 'liturgy.messages.scheduledPvNothing' : 'liturgy.messages.scheduledPvUnavailable')
    expect(wrapper.findAll('button').find(b => b.text() === 'liturgy.messages.scheduledPvOneClick')!.attributes('disabled')).toBeUndefined()
  })

  it('impede importação duplicada enquanto a busca está pendente', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve }) as Promise<Response>)
    open()
    const button = wrapper.findAll('button').find(b => b.text() === 'liturgy.messages.scheduledPvOneClick')!
    await button.trigger('click')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(fetch).toHaveBeenCalledOnce()
    finish({ ok: false })
    await flushPromises()
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('cria uma rotação, cancela seleção e remove a rotação sem fechar o diálogo', async () => {
    open()
    await wrapper.get('.scheduled-dialog__new-rot input').setValue('  Hinos  ')
    await wrapper.get('.scheduled-dialog__new-rot').trigger('submit')
    expect(useScheduledStore().categories[0]?.name).toBe('Hinos')
    await clickText('liturgy.actions.cancel')
    expect(wrapper.find('.scheduled-dialog__right-head').exists()).toBe(false)
    await wrapper.get('.scheduled-dialog__rot').trigger('click')
    expect(wrapper.get('.scheduled-dialog__right-head').text()).toBe('Hinos')
    await wrapper.get('.scheduled-dialog__rot-del').trigger('click')
    expect(useScheduledStore().categories).toHaveLength(0)
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('importa um trimestre colado e volta à lista de entradas', async () => {
    open()
    await clickText('liturgy.messages.scheduledPasteQuarter')
    await wrapper.get('textarea').setValue('03/10\ninicial: 15 - Adoração')
    await clickText('liturgy.messages.scheduledApplyPaste')
    expect(useScheduledStore().items[0]).toMatchObject({ content: { kind: 'music', musicId: 15 } })
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('duplicar trimestre usa a primeira entrada da rotação selecionada', async () => {
    open()
    await flushPromises()
    await wrapper.get('.scheduled-dialog__new-rot input').setValue('Hinos')
    await wrapper.get('.scheduled-dialog__new-rot').trigger('submit')
    await clickText('liturgy.messages.scheduledDuplicateQuarter')
    expect(useScheduledStore().items).toHaveLength(0)
    await wrapper.get('input[type=search]').setValue('Adoração')
    await wrapper.get('.scheduled-dialog__music-option').trigger('click')
    await wrapper.get('.scheduled-dialog__quick-add').trigger('submit')
    await clickText('liturgy.messages.scheduledDuplicateQuarter')
    expect(useScheduledStore().items).toHaveLength(2)
    expect(useScheduledStore().items[0]?.date).not.toBe(useScheduledStore().items[1]?.date)
  })

})
