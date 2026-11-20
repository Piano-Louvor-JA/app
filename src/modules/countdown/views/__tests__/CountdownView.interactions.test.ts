import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import View from '../CountdownView.vue'
import Duration from '../../components/CountdownDurationInput.vue'
import Saved from '../../components/CountdownSavedList.vue'
import StageDialog from '../../../settings/components/StageCustomizationDialog.vue'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG } from '../../types/countdown'

const mocks = vi.hoisted(() => ({ feature: null as any, push: vi.fn(), closed: null as (() => void) | null, unsub: vi.fn(), background: 'https://example.org/bg.jpg' as string | null }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@shared/composables/useMinimizablePage', () => ({ useMinimizablePage: () => ({ minimize: vi.fn(), prepare: vi.fn() }) }))
vi.mock('@shared/components/PageBackStack.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))
vi.mock('../../composables/useCountdown', () => ({ useCountdownFeature: () => mocks.feature }))
vi.mock('../../composables/useCountdownStage', () => ({ useCountdownStage: (config: unknown) => ({ effectiveConfig: config, stage: ref({ backgroundColor: '#000000', backgroundImage: 'bg' }) }) }))
vi.mock('../../../settings/types/stage-settings', () => ({ stageBgCss: (value: string) => value, resolveBackgroundImage: () => mocks.background }))
vi.mock('../../../settings/components/StageCustomizationDialog.vue', () => ({ default: { name: 'StageCustomizationDialog', props: ['open'], template: '<div />' } }))
vi.mock('../../components/CountdownDurationInput.vue', () => ({ default: { name: 'CountdownDurationInput', props: ['durationMs', 'disabled'], template: '<div />' } }))
vi.mock('../../components/CountdownSavedList.vue', () => ({ default: { name: 'CountdownSavedList', props: ['items'], template: '<div />' } }))
let wrapper: VueWrapper
function open() {
  wrapper = mount(View)
}
beforeEach(() => {
  mocks.background = 'https://example.org/bg.jpg'
  mocks.feature = {
    config: ref({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG }), runtime: ref({ status: 'idle', durationMs: 600000, mode: 'duration', savedTimesMs: [1000] }),
    isProjecting: ref(false), configOpen: ref(false), isRunning: ref(false),
  }
  for (const key of ['openConfig','closeConfig','setDurationMs','reset','saveMark','removeSavedMark','clearSavedMarks','refreshProjectionState']) mocks.feature[key] = vi.fn()
  vi.stubGlobal('louvorja', { projection: { onPopupsClosed: (callback: () => void) => { mocks.closed = callback; return mocks.unsub } } })
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('tela do Timer — ações', () => {
  it('delega duração e marcas salvas', async () => {
    open()
    const input = wrapper.getComponent(Duration)
    input.vm.$emit('update:duration-ms', 120000)
    expect(mocks.feature.setDurationMs).toHaveBeenCalledWith(120000)
    await wrapper.get('.countdown-view__ctrl--reset').trigger('click')
    await wrapper.get('.countdown-view__ctrl--save').trigger('click')
    wrapper.getComponent(Saved).vm.$emit('remove', 0)
    wrapper.getComponent(Saved).vm.$emit('clear')
    expect(mocks.feature.reset).toHaveBeenCalledOnce()
    expect(mocks.feature.saveMark).toHaveBeenCalledOnce()
    expect(mocks.feature.removeSavedMark).toHaveBeenCalledWith(0)
    expect(mocks.feature.clearSavedMarks).toHaveBeenCalledOnce()
  })
  it('personalizar abre o palco e a assinatura da projeção é limpa ao sair', async () => {
    open()
    await wrapper.get('[aria-label="countdown.personalize"]').trigger('click')
    expect(mocks.feature.openConfig).toHaveBeenCalledOnce()
    wrapper.getComponent(StageDialog).vm.$emit('close')
    expect(mocks.feature.closeConfig).toHaveBeenCalledOnce()
    mocks.closed!()
    expect(mocks.feature.refreshProjectionState).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(mocks.unsub).toHaveBeenCalledOnce()
  })
  it('mostra projeção ativa e remove fundo ausente', async () => {
    mocks.background = null
    open()
    mocks.feature.isProjecting.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.countdown-view__projecting').exists()).toBe(true)
    expect(wrapper.get('.countdown-view__preview').attributes('style')).not.toContain('url(')
  })
})

describe('tela do Timer — independente da Escola Sabatina', () => {
  it('não tem aviso de canal ocupado: duração e reiniciar ficam livres com a contagem parada', () => {
    open()
    expect(wrapper.find('[data-testid=countdown-session-busy]').exists()).toBe(false)
    expect(wrapper.getComponent(Duration).props('disabled')).toBe(false)
    expect(wrapper.get('.countdown-view__ctrl--reset').attributes('disabled')).toBeUndefined()
  })
})
