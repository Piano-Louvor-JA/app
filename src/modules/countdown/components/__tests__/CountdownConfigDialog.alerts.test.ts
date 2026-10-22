import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import Dialog from '../CountdownConfigDialog.vue'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG } from '../../types/countdown'

const mocks = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn(), rename: vi.fn(), update: vi.fn(), addMarker: vi.fn(), removeMarker: vi.fn(), taken: vi.fn(), play: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))
vi.mock('../../services/alert-tone-library', () => ({ listLibraryTones: mocks.list, addLibraryTone: mocks.add, removeLibraryTone: mocks.remove, renameLibraryTone: mocks.rename }))
vi.mock('../../stores/useCountdownStore', () => ({ useCountdownStore: () => ({ runtime: { durationMs: 1000 }, updateAlertMarker: mocks.update, addAlertMarker: mocks.addMarker, removeAlertMarker: mocks.removeMarker, isOffsetTaken: mocks.taken }) }))
vi.mock('../../services/alert-tone', async importOriginal => ({ ...await importOriginal<typeof import('../../services/alert-tone')>(), playAlertTone: mocks.play }))
let wrapper: VueWrapper
const tone = { id: 'sound1', name: 'Alerta', dataUrl: 'data:audio/mp3;base64,AAA', createdAt: 1 }
function open(markers = [{ id: 'one', offsetMs: 60000, preset: 'beep' }]) {
  wrapper = mount(Dialog, { props: { open: true, config: reactive({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, alertMarkers: markers }) }, global: { stubs: { teleport: true } } })
}
beforeEach(() => {
  mocks.list.mockReturnValue([tone])
  mocks.update.mockReturnValue(true)
  mocks.taken.mockReturnValue(false)
})
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('configuração — alertas e biblioteca', () => {
  it('mostra sons já salvos ao abrir e atualiza a biblioteca ao reabrir', async () => {
    open()
    expect(wrapper.get('.countdown-config__library-name').element.value).toBe('Alerta')
    await wrapper.setProps({ open: false })
    mocks.list.mockReturnValue([{ ...tone, name: 'Renomeado' }])
    await wrapper.setProps({ open: true })
    expect(wrapper.get('.countdown-config__library-name').element.value).toBe('Renomeado')
  })
  it('troca preset e offset, e informa valores inválidos ou ocupados', async () => {
    open()
    await wrapper.get('select.countdown-config__tone-select').setValue('gong')
    expect(mocks.update).toHaveBeenCalledWith('one', { preset: 'gong' })
    const offset = wrapper.get('.countdown-config__offset-input')
    await offset.setValue('2.5')
    expect(mocks.update).toHaveBeenCalledWith('one', { offsetMs: 150000 })
    await offset.setValue('-1')
    expect(wrapper.text()).toContain('countdown.markerInvalidOffset')
    mocks.update.mockReturnValue(false)
    await offset.setValue('3')
    expect(wrapper.text()).toContain('countdown.markerOffsetTaken')
  })
  it('adiciona no próximo offset livre, remove e impede adicionar quando todos estão ocupados', async () => {
    open()
    mocks.taken.mockImplementation((offset: number) => offset === 180000)
    await wrapper.get('[data-testid=add-marker]').trigger('click')
    expect(mocks.addMarker).toHaveBeenCalledWith(240000, 'beep')
    await wrapper.get('[aria-label="countdown.markerRemove"]').trigger('click')
    expect(mocks.removeMarker).toHaveBeenCalledWith('one')
    mocks.taken.mockReturnValue(true)
    await wrapper.get('[data-testid=add-marker]').trigger('click')
    expect(mocks.addMarker).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('countdown.markerOffsetTaken')
  })
  it('renomeia e remove som, devolvendo somente os marcos associados para beep', async () => {
    open([{ id: 'custom', offsetMs: 0, preset: 'custom:sound1' }, { id: 'other', offsetMs: 60000, preset: 'none' }])
    await wrapper.get('.countdown-config__library-name').setValue('Novo nome')
    expect(mocks.rename).toHaveBeenCalledWith('sound1', 'Novo nome')
    await wrapper.get('[aria-label="countdown.libraryRemove"]').trigger('click')
    expect(mocks.update).toHaveBeenCalledWith('custom', { preset: 'beep' })
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith('sound1')
  })
  it('prévia de preset e de som salvo respeitam suas fontes', async () => {
    const play = vi.fn().mockRejectedValue(new Error('autoplay'))
    vi.stubGlobal('Audio', class { constructor(public src: string) {} play = play })
    open()
    await wrapper.get('.countdown-config__tone-row [aria-label="countdown.markerPreview"]').trigger('click')
    await flushPromises()
    expect(mocks.play).toHaveBeenCalledWith('beep')
    await wrapper.get('.countdown-config__library-item [aria-label="countdown.markerPreview"]').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledOnce()
  })
  it('carrega um áudio selecionado e informa falha de quota sem perder a biblioteca', async () => {
    vi.stubGlobal('FileReader', class {
      result = 'data:audio/mp3;base64,CCC'
      onload: (() => void) | null = null
      readAsDataURL() { this.onload?.() }
    })
    open()
    const upload = wrapper.get('[data-testid=library-upload]')
    await upload.trigger('change')
    expect(mocks.add).not.toHaveBeenCalled()
    Object.defineProperty(upload.element, 'files', { value: [new File(['audio'], 'Meu alerta.mp3', { type: 'audio/mpeg' })], configurable: true })
    await upload.trigger('change')
    expect(mocks.add).toHaveBeenCalledWith('Meu alerta', 'data:audio/mp3;base64,CCC')
    mocks.add.mockImplementationOnce(() => { throw new Error('quota') })
    await upload.trigger('change')
    expect(wrapper.text()).toContain('countdown.customToneTooLarge')
  })
  it('exibe duração e aviso para alertas mais longos que o cronômetro; não reproduz none ou custom por preset', async () => {
    open([
      { id: 'long', offsetMs: 0, preset: '1min_es' },
      { id: 'custom', offsetMs: 60000, preset: 'custom:sound1' },
      { id: 'missing', offsetMs: 120000, preset: 'custom:missing' },
      { id: 'none', offsetMs: 180000, preset: 'none' },
    ])
    expect(wrapper.text()).toContain('1min 6s')
    expect(wrapper.text()).toContain('countdown.toneDuration')
    expect(wrapper.text()).toContain('countdown.toneMinDurationWarning')
    const previews = wrapper.findAll('.countdown-config__tone-row [aria-label="countdown.markerPreview"]')
    await previews[1]!.trigger('click')
    await previews[3]!.trigger('click')
    await flushPromises()
    expect(mocks.play).not.toHaveBeenCalled()
    await wrapper.setProps({ config: { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, alertMarkers: [] } })
    expect(wrapper.text()).not.toContain('countdown.toneMinDurationWarning')
  })

})
