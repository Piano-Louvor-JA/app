import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import View from '../CountdownView.vue'
import Duration from '../../components/CountdownDurationInput.vue'
import Config from '../../components/CountdownConfigDialog.vue'
import Saved from '../../components/CountdownSavedList.vue'
import StageDialog from '../../../settings/components/StageCustomizationDialog.vue'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG } from '../../types/countdown'

const mocks = vi.hoisted(() => ({ feature: null as any, push: vi.fn(), closed: null as (() => void) | null, unsub: vi.fn(), background: 'https://example.org/bg.jpg' as string | null }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@shared/composables/useMinimizablePage', () => ({ useMinimizablePage: () => ({ minimize: vi.fn(), prepare: vi.fn() }) }))
vi.mock('@shared/components/PageBackStack.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))
vi.mock('../../composables/useCountdown', () => ({ useCountdownFeature: () => mocks.feature }))
vi.mock('../../composables/useCountdownStage', () => ({ useCountdownStage: (config: unknown) => ({ effectiveConfig: config, stage: ref({ backgroundColor: '#000000', backgroundImage: 'bg' }) }) }))
vi.mock('../../../settings/types/stage-settings', () => ({ stageBgCss: (value: string) => value, resolveBackgroundImage: () => mocks.background }))
vi.mock('../../../settings/components/StageCustomizationDialog.vue', () => ({ default: { name: 'StageCustomizationDialog', props: ['open'], template: '<div />' } }))
vi.mock('../../components/CountdownDurationInput.vue', () => ({ default: { name: 'CountdownDurationInput', props: ['durationMs', 'disabled'], template: '<div />' } }))
vi.mock('../../components/CountdownConfigDialog.vue', () => ({ default: { name: 'CountdownConfigDialog', props: ['open', 'config'], template: '<div />' } }))
vi.mock('../../components/CountdownSavedList.vue', () => ({ default: { name: 'CountdownSavedList', props: ['items'], template: '<div />' } }))
let wrapper: VueWrapper
function open(mode = 'standard', sabbathConfig: unknown = undefined) {
  mocks.feature.config.value = { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, mode, sabbathConfig }
  wrapper = mount(View)
}
beforeEach(() => {
  mocks.background = 'https://example.org/bg.jpg'
  mocks.feature = {
    config: ref({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG }), runtime: ref({ durationMs: 600000, mode: 'duration', savedTimesMs: [1000] }),
    isProjecting: ref(false), configOpen: ref(false), displayConfigOpen: ref(false), isRunning: ref(false), audioMuted: ref(false), audioVolume: ref(0.5),
  }
  for (const key of ['setTimeFormat','setBgColor','setTextColor','resetDisplayToDefault','openConfig','closeConfig','openDisplayConfig','closeDisplayConfig','setDurationMs','setCountdownMode','setUntilTime','setAllowNegative','setAlertTonePreset','setAudioMuted','setAudioVolume','stopAudio','setMode','setSabbathConfig','adjustTime','reset','saveMark','removeSavedMark','clearSavedMarks','refreshProjectionState']) mocks.feature[key] = vi.fn()
  vi.stubGlobal('louvorja', { projection: { onPopupsClosed: (callback: () => void) => { mocks.closed = callback; return mocks.unsub } } })
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('tela do cronômetro — ações e horários', () => {
  it('delega duração, modo de contagem, horário alvo e marcas salvas', async () => {
    open()
    const input = wrapper.getComponent(Duration)
    input.vm.$emit('update:duration-ms', 120000)
    input.vm.$emit('update:mode', 'until')
    input.vm.$emit('update:until', 18, 30)
    expect(mocks.feature.setDurationMs).toHaveBeenCalledWith(120000)
    expect(mocks.feature.setCountdownMode).toHaveBeenCalledWith('until')
    expect(mocks.feature.setUntilTime).toHaveBeenCalledWith(18, 30)
    await wrapper.get('.countdown-view__ctrl--reset').trigger('click')
    await wrapper.get('.countdown-view__ctrl--save').trigger('click')
    wrapper.getComponent(Saved).vm.$emit('remove', 0)
    wrapper.getComponent(Saved).vm.$emit('clear')
    expect(mocks.feature.reset).toHaveBeenCalledOnce()
    expect(mocks.feature.saveMark).toHaveBeenCalledOnce()
    expect(mocks.feature.removeSavedMark).toHaveBeenCalledWith(0)
    expect(mocks.feature.clearSavedMarks).toHaveBeenCalledOnce()
  })
  it('converte início e término em ms e preserva o restante do agendamento ao editar', () => {
    open('sabbath', { scheduleMode: 'start', startTime: '09:00', endTime: '10:15' })
    const inputs = wrapper.findAllComponents(Duration)
    expect(inputs[0]!.props('durationMs')).toBe(9 * 3600000)
    expect(inputs[1]!.props('durationMs')).toBe((10 * 60 + 15) * 60000)
    inputs[0]!.vm.$emit('update:duration-ms', 9.5 * 3600000)
    inputs[1]!.vm.$emit('update:duration-ms', 11 * 3600000)
    expect(mocks.feature.setSabbathConfig).toHaveBeenCalledWith({ scheduleMode: 'start', startTime: '09:30', endTime: '10:15' })
    expect(mocks.feature.setSabbathConfig).toHaveBeenCalledWith({ scheduleMode: 'start', startTime: '09:00', endTime: '11:00' })
  })
  it.each(['Escape', 'outside'])('fecha agendamento com %s e mantém aberto ao clicar dentro', async how => {
    open('sabbath', { scheduleMode: 'endOnly', endTime: '10:15' })
    await wrapper.get('[data-testid=sabbath-schedule-toggle]').trigger('click')
    await wrapper.get('.countdown-view__sabbath-popover').trigger('click')
    expect(wrapper.find('.countdown-view__sabbath-popover').exists()).toBe(true)
    await wrapper.get('input[value=start]').setValue()
    expect(mocks.feature.setSabbathConfig).toHaveBeenCalledWith({ scheduleMode: 'start', endTime: '10:15' })
    await wrapper.get('input[value=endOnly]').setValue()
    expect(mocks.feature.setSabbathConfig).toHaveBeenCalledWith({ scheduleMode: 'endOnly', endTime: '10:15' })
    document.dispatchEvent(how === 'Escape' ? new KeyboardEvent('keydown', { key: 'Escape' }) : new MouseEvent('click'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.countdown-view__sabbath-popover').exists()).toBe(false)
  })
  it('configura fim padrão quando a agenda ainda não existe', async () => {
    open('sabbath')
    await wrapper.get('[data-testid=sabbath-schedule-toggle]').trigger('click')
    await wrapper.get('input[value=start]').setValue()
    await wrapper.get('input[value=endOnly]').setValue()
    expect(mocks.feature.setSabbathConfig.mock.calls).toEqual([[{ scheduleMode: 'start', endTime: '10:15' }], [{ scheduleMode: 'endOnly', endTime: '10:15' }]])
  })
  it('ajusta tempo, mute e volume no modo sabatina', async () => {
    open('sabbath', { scheduleMode: 'endOnly', endTime: '10:15' })
    for (const label of ['addMinute','addFiveMinutes','subMinute','subFiveMinutes']) await wrapper.get(`[aria-label="countdown.${label}"]`).trigger('click')
    expect(mocks.feature.adjustTime.mock.calls).toEqual([[60000],[300000],[-60000],[-300000]])
    await wrapper.get('[aria-label="countdown.muteAudio"]').trigger('click')
    expect(mocks.feature.setAudioMuted).toHaveBeenCalledWith(true)
    mocks.feature.audioMuted.value = true
    await wrapper.vm.$nextTick()
    await wrapper.get('[aria-label="countdown.unmuteAudio"]').trigger('click')
    expect(mocks.feature.setAudioMuted).toHaveBeenCalledWith(false)
    await wrapper.get('input[type=range]').setValue('0.25')
    expect(mocks.feature.setAudioVolume).toHaveBeenCalledWith(0.25)
  })
  it('encaminha configuração visual e limpa a assinatura ao sair', async () => {
    open('sabbath')
    await wrapper.get('[aria-label="countdown.config"]').trigger('click')
    await wrapper.get('[aria-label="countdown.personalize"]').trigger('click')
    expect(mocks.feature.openDisplayConfig).toHaveBeenCalledOnce()
    expect(mocks.feature.openConfig).toHaveBeenCalledOnce()
    const config = wrapper.getComponent(Config)
    for (const [event, method, value] of [['close','closeDisplayConfig',undefined],['update:time-format','setTimeFormat','mm:ss'],['update:bg-color','setBgColor','#123456'],['update:text-color','setTextColor','#ffffff'],['update:allow-negative','setAllowNegative',true],['update:mode','setMode','standard'],['update:sabbath-config','setSabbathConfig',{ endTime:'11:00' }],['reset','resetDisplayToDefault',undefined]] as const) {
      config.vm.$emit(event, value)
      expect(mocks.feature[method]).toHaveBeenCalled()
    }
    wrapper.getComponent(StageDialog).vm.$emit('close')
    expect(mocks.feature.closeConfig).toHaveBeenCalledOnce()
    mocks.closed!()
    expect(mocks.feature.refreshProjectionState).toHaveBeenCalledOnce()
    expect(mocks.feature.stopAudio).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(mocks.unsub).toHaveBeenCalledOnce()
  })
  it('alterna modo, mostra projeção ativa e remove fundo ausente', async () => {
    mocks.background = null
    open()
    await wrapper.get('.countdown-view__mode-switch-input').setValue(true)
    await wrapper.get('.countdown-view__mode-switch-input').setValue(false)
    expect(mocks.feature.setMode.mock.calls).toEqual([['sabbath'],['standard']])
    mocks.feature.isProjecting.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.countdown-view__projecting').exists()).toBe(true)
    expect(wrapper.get('.countdown-view__preview').attributes('style')).not.toContain('url(')
  })
})
