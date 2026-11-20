// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive, ref } from 'vue'

const mocks = vi.hoisted(() => ({ countdown: null as any, store: null as any, push: vi.fn(), closed: null as (() => void) | null, unsub: vi.fn(), minimizeOptions: null as any, confirm: vi.fn(), pick: vi.fn() }))
vi.mock('@shared/composables/useAppConfirm', () => ({ appConfirm: mocks.confirm }))
vi.mock('../../services/sabbath-video', () => ({ pickAndImportSabbathVideo: mocks.pick }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@shared/composables/useMinimizablePage', () => ({
  useMinimizablePage: (options: unknown) => {
    mocks.minimizeOptions = options
    return { minimize: vi.fn(), prepare: vi.fn() }
  },
}))
vi.mock('@shared/components/PageBackStack.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))
vi.mock('@modules/countdown/stores/useCountdownStore', () => ({ useCountdownStore: () => mocks.countdown }))
vi.mock('../../stores/useSabbathSchoolStore', () => ({ useSabbathSchoolStore: () => mocks.store }))
vi.mock('@modules/countdown/composables/useCountdownStage', () => ({ useCountdownStage: (config: () => unknown) => ({ effectiveConfig: ref(config()), stage: ref({ backgroundColor: '#000000', backgroundImage: 'bg' }) }) }))
vi.mock('@modules/settings/types/stage-settings', () => ({ stageBgCss: (value: string) => value, resolveBackgroundImage: (value: string) => (value ? 'https://example.org/bg.jpg' : null) }))
vi.mock('@modules/settings/components/StageCustomizationDialog.vue', () => ({ default: { name: 'StageCustomizationDialog', props: ['open', 'scope'], template: '<div />' } }))
vi.mock('@modules/countdown/components/CountdownDurationInput.vue', () => ({ default: { name: 'CountdownDurationInput', props: ['durationMs', 'disabled'], template: '<div />' } }))
vi.mock('../../components/SabbathSchoolConfigDialog.vue', () => ({ default: { name: 'SabbathSchoolConfigDialog', props: ['open', 'config'], template: '<div />' } }))

import View from '../SabbathSchoolView.vue'

let wrapper: VueWrapper

const MIN = 60_000
const DURATION = { scheduleMode: 'duration', durationMs: 45 * MIN, endTime: '10:15' }
const END_TIME = { scheduleMode: 'endOnly', durationMs: 45 * MIN, endTime: '10:15' }
const VIDEO_MODE = { scheduleMode: 'video', durationMs: 45 * MIN, endTime: '10:15' }
const VIDEO = { relativePath: 'modulos/escola-sabatina/video/video-1.mp4', name: 'Tema da ES.mp4', durationMs: 3_725_000 }

function open(schedule: Record<string, unknown> = DURATION) {
  mocks.store.config.schedule = schedule
  wrapper = mount(View)
}

beforeEach(() => {
  mocks.countdown = reactive({
    config: { timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' },
    setTimeFormat: vi.fn(),
    setBgColor: vi.fn(),
    setTextColor: vi.fn(),
    setAllowNegative: vi.fn(),
    resetDisplayToDefault: vi.fn(),
  })
  mocks.store = reactive({
    config: { schedule: DURATION, audioLang: 'auto', alertMarkers: [], customVideo: null },
    runtime: { status: 'idle' },
    isRunning: false,
    isIdle: true,
    isProjecting: false,
    audioMuted: false,
    audioVolume: 0.5,
    refreshIdle: vi.fn(),
    refreshProjectionState: vi.fn(),
    adjustTime: vi.fn(),
    stop: vi.fn(),
    rehearsing: false,
    toggleFinalMinutes: vi.fn(),
    hasOpening: true,
    openingPlayback: 'stopped',
    toggleOpening: vi.fn(),
    setSchedule: vi.fn(),
    setCustomVideo: vi.fn(),
    canStart: vi.fn(() => true),
    start: vi.fn(),
    pause: vi.fn(),
    seekVideo: vi.fn(),
    videoMuted: false,
    videoVolume: 0.8,
    setVideoMuted: vi.fn(),
    setVideoVolume: vi.fn(),
    setAudioLang: vi.fn(),
    setAudioMuted: vi.fn(),
    setAudioVolume: vi.fn(),
  })
  vi.stubGlobal('louvorja', { projection: { onPopupsClosed: (callback: () => void) => { mocks.closed = callback; return mocks.unsub } } })
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('tela da Escola Sabatina', () => {
  it('abrir atualiza a duração da agenda; voltar leva a Utilitários; minimizar descreve a tela', async () => {
    open()
    expect(mocks.store.refreshIdle).toHaveBeenCalledOnce()
    await wrapper.get('.sabbath-school-view__back').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ name: 'utilities' })
    expect(mocks.minimizeOptions.fallbackRoute).toEqual({ name: 'utilities' })
    expect(mocks.minimizeOptions.describe()).toEqual({ title: 'sabbathSchool.title', icon: 'ti-book-2', summary: '' })
    expect(mocks.minimizeOptions.capture()).toBeNull()
  })

  it('a modalidade fica à vista acima do campo, com a atual marcada; trocar preserva a agenda', async () => {
    open()
    const duration = () => wrapper.get('[data-testid=sabbath-mode-duration]')
    const endTime = () => wrapper.get('[data-testid=sabbath-mode-endOnly]')
    expect(wrapper.find('.sabbath-school-view__preview [role=radiogroup]').exists()).toBe(true)
    expect([duration().text(), endTime().text()]).toEqual(['sabbathSchool.scheduleModeDuration', 'sabbathSchool.scheduleModeEndTime'])
    expect([duration().attributes('aria-checked'), endTime().attributes('aria-checked')]).toEqual(['true', 'false'])
    await endTime().trigger('click')
    expect(mocks.store.setSchedule).toHaveBeenCalledWith(END_TIME)
    mocks.store.config.schedule = END_TIME
    await wrapper.vm.$nextTick()
    expect([duration().attributes('aria-checked'), endTime().attributes('aria-checked')]).toEqual(['false', 'true'])
    await duration().trigger('click')
    expect(mocks.store.setSchedule).toHaveBeenLastCalledWith(DURATION)
  })

  it('com a contagem rodando, não troca de modalidade', async () => {
    open()
    mocks.store.isRunning = true
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid=sabbath-mode-duration]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid=sabbath-mode-endOnly]').attributes('disabled')).toBeDefined()
  })

  it('duração: um só campo com a duração; editar preserva o restante da agenda', () => {
    open()
    const inputs = wrapper.findAllComponents({ name: 'CountdownDurationInput' })
    expect(inputs).toHaveLength(1)
    expect(wrapper.find('.sabbath-school-view__time-label').exists()).toBe(false)
    expect(inputs[0]!.props('durationMs')).toBe(45 * MIN)
    inputs[0]!.vm.$emit('update:duration-ms', 30 * MIN)
    expect(mocks.store.setSchedule).toHaveBeenCalledWith({ ...DURATION, durationMs: 30 * MIN })
  })

  it('hora do término: um só campo com o horário; contagem rodando trava o campo', async () => {
    open(END_TIME)
    const [input] = wrapper.findAllComponents({ name: 'CountdownDurationInput' })
    expect(wrapper.findAllComponents({ name: 'CountdownDurationInput' })).toHaveLength(1)
    expect(wrapper.find('.sabbath-school-view__time-label').exists()).toBe(false)
    expect(input!.props('durationMs')).toBe((10 * 60 + 15) * MIN)
    input!.vm.$emit('update:duration-ms', 11 * 60 * MIN)
    expect(mocks.store.setSchedule).toHaveBeenCalledWith({ ...END_TIME, endTime: '11:00' })
    mocks.store.isRunning = true
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent({ name: 'CountdownDurationInput' }).props('disabled')).toBe(true)
  })

  it.each(['Escape', 'outside'])('agenda e idioma no popover, que fecha com %s e fica aberto ao clicar dentro', async (how) => {
    open()
    await wrapper.get('[data-testid=sabbath-schedule-toggle]').trigger('click')
    await wrapper.get('.sabbath-school-view__popover').trigger('click')
    expect(wrapper.find('.sabbath-school-view__popover').exists()).toBe(true)
    expect(wrapper.find('.sabbath-school-view__popover [role=radiogroup]').exists()).toBe(false)
    await wrapper.get('[data-testid=sabbath-audio-lang]').setValue('fr')
    expect(mocks.store.setAudioLang).toHaveBeenCalledWith('fr')
    document.dispatchEvent(how === 'Escape' ? new KeyboardEvent('keydown', { key: 'Escape' }) : new MouseEvent('click'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sabbath-school-view__popover').exists()).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  })

  it('ajusta tempo, para, mudo e volume; ajuste e parar só com a contagem em andamento', async () => {
    open()
    expect(wrapper.get('[aria-label="sabbathSchool.addMinute"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid=sabbath-stop]').attributes('disabled')).toBeDefined()
    mocks.store.isIdle = false
    await wrapper.vm.$nextTick()
    for (const label of ['addMinute', 'addFiveMinutes', 'subMinute', 'subFiveMinutes']) await wrapper.get(`[aria-label="sabbathSchool.${label}"]`).trigger('click')
    expect(mocks.store.adjustTime.mock.calls).toEqual([[60000], [300000], [-60000], [-300000]])
    await wrapper.get('[data-testid=sabbath-stop]').trigger('click')
    expect(mocks.store.stop).toHaveBeenCalledOnce()
    await wrapper.get('[aria-label="sabbathSchool.muteAudio"]').trigger('click')
    expect(mocks.store.setAudioMuted).toHaveBeenCalledWith(true)
    mocks.store.audioMuted = true
    await wrapper.vm.$nextTick()
    await wrapper.get('[aria-label="sabbathSchool.unmuteAudio"]').trigger('click')
    expect(mocks.store.setAudioMuted).toHaveBeenCalledWith(false)
    await wrapper.get('input[type=range]').setValue('0.25')
    expect(mocks.store.setAudioVolume).toHaveBeenCalledWith(0.25)
  })

  it('player manual agrupa a abertura e os últimos 5 min', () => {
    open()
    const group = wrapper.get('[data-testid=sabbath-manual-player]')
    expect(group.attributes('role')).toBe('group')
    expect(group.attributes('aria-label')).toBe('sabbathSchool.manualPlayer')
    expect(group.text()).toContain('sabbathSchool.manualPlayer')
    expect(group.find('[data-testid=sabbath-play-opening]').exists()).toBe(true)
    expect(group.find('[data-testid=rehearse-final-minutes]').exists()).toBe(true)
  })

  it('abertura alterna play e pausa conforme o áudio', async () => {
    open()
    const button = wrapper.get('[data-testid=sabbath-play-opening]')
    expect(button.text()).toContain('sabbathSchool.playOpening')
    expect(button.attributes('title')).toBe('sabbathSchool.playOpeningHint')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.find('.ti-player-play').exists()).toBe(true)
    await button.trigger('click')
    expect(mocks.store.toggleOpening).toHaveBeenCalledOnce()
    mocks.store.openingPlayback = 'playing'
    await wrapper.vm.$nextTick()
    expect(button.find('.ti-player-pause').exists()).toBe(true)
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('title')).toBe('sabbathSchool.pauseOpening')
    mocks.store.openingPlayback = 'paused'
    await wrapper.vm.$nextTick()
    expect(button.find('.ti-player-play').exists()).toBe(true)
  })

  it('abertura: sem som de abertura ou no mudo (parada) fica desabilitada; tocando, dá para pausar no mudo', async () => {
    open()
    const button = wrapper.get('[data-testid=sabbath-play-opening]')
    mocks.store.isRunning = true
    await wrapper.vm.$nextTick()
    expect(button.attributes('disabled')).toBeUndefined()
    mocks.store.audioMuted = true
    await wrapper.vm.$nextTick()
    expect(button.attributes('disabled')).toBeDefined()
    mocks.store.openingPlayback = 'playing'
    await wrapper.vm.$nextTick()
    expect(button.attributes('disabled')).toBeUndefined()
    mocks.store.openingPlayback = 'stopped'
    mocks.store.audioMuted = false
    mocks.store.hasOpening = false
    await wrapper.vm.$nextTick()
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('últimos 5 min alterna play e pausa, inclusive com a contagem rodando', async () => {
    open()
    const button = wrapper.get('[data-testid=rehearse-final-minutes]')
    expect(button.text()).toContain('sabbathSchool.rehearseFinalMinutes')
    expect(button.attributes('title')).toBe('sabbathSchool.rehearseFinalMinutesHint')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.find('.ti-hourglass-low').exists()).toBe(true)
    await button.trigger('click')
    await flushPromises()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.store.toggleFinalMinutes).toHaveBeenCalledOnce()
    Object.assign(mocks.store, { rehearsing: true, isRunning: true, isIdle: false })
    await wrapper.vm.$nextTick()
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('title')).toBe('sabbathSchool.pauseFinalMinutes')
    expect(button.find('.ti-player-pause').exists()).toBe(true)
    await button.trigger('click')
    await flushPromises()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.store.toggleFinalMinutes).toHaveBeenCalledTimes(2)
  })

  it.each([['rodando', true], ['pausada', false]])('com a contagem real %s, confirma antes de substituí-la', async (_label, isRunning) => {
    open()
    Object.assign(mocks.store, { isRunning, isIdle: false, rehearsing: false })
    await wrapper.vm.$nextTick()
    const button = wrapper.get('[data-testid=rehearse-final-minutes]')
    mocks.confirm.mockResolvedValueOnce(false)
    await button.trigger('click')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'sabbathSchool.finalMinutesConfirmTitle',
      message: 'sabbathSchool.finalMinutesConfirmMessage',
      confirmLabel: 'sabbathSchool.finalMinutesConfirm',
      cancelLabel: 'sabbathSchool.cancel',
    }))
    expect(mocks.store.toggleFinalMinutes).not.toHaveBeenCalled()
    mocks.confirm.mockResolvedValueOnce(true)
    await button.trigger('click')
    await flushPromises()
    expect(mocks.store.toggleFinalMinutes).toHaveBeenCalledOnce()
  })

  it('não tem aviso de Timer ocupado', () => {
    open()
    expect(wrapper.find('[data-testid=sabbath-timer-busy]').exists()).toBe(false)
  })

  it('selo de projeção acompanha a projeção da Escola Sabatina', async () => {
    mocks.store.isProjecting = true
    open()
    expect(wrapper.find('.sabbath-school-view__projecting').exists()).toBe(true)
    expect(wrapper.get('.sabbath-school-view__preview').attributes('style')).toContain('bg.jpg')
    mocks.store.isProjecting = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sabbath-school-view__projecting').exists()).toBe(false)
  })

  it('aparência vai para a tela de contagem compartilhada; assinatura da projeção é limpa ao sair', async () => {
    open()
    await wrapper.get('[data-testid=sabbath-settings]').trigger('click')
    const config = wrapper.getComponent({ name: 'SabbathSchoolConfigDialog' })
    expect(config.props('open')).toBe(true)
    for (const [event, method, value] of [['update:time-format', 'setTimeFormat', 'mm:ss'], ['update:bg-color', 'setBgColor', '#123456'], ['update:text-color', 'setTextColor', '#ffffff'], ['update:allow-negative', 'setAllowNegative', true], ['reset', 'resetDisplayToDefault', undefined]] as const) {
      config.vm.$emit(event, value)
      expect(mocks.countdown[method]).toHaveBeenCalled()
    }
    config.vm.$emit('close')
    await wrapper.vm.$nextTick()
    expect(config.props('open')).toBe(false)
    await wrapper.get('[aria-label="sabbathSchool.personalize"]').trigger('click')
    const stage = wrapper.getComponent({ name: 'StageCustomizationDialog' })
    expect(stage.props()).toMatchObject({ open: true, scope: 'countdown' })
    stage.vm.$emit('close')
    await wrapper.vm.$nextTick()
    expect(stage.props('open')).toBe(false)
    mocks.closed!()
    expect(mocks.store.refreshProjectionState).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(mocks.unsub).toHaveBeenCalledOnce()
  })

  it('aba de vídeo personalizado: ao passar o mouse explica o recurso; escolher troca para ela', async () => {
    open()
    const tab = wrapper.get('[data-testid=sabbath-mode-video]')
    expect(tab.text()).toBe('sabbathSchool.scheduleModeVideo')
    expect(tab.attributes('title')).toBe('sabbathSchool.scheduleModeVideoHint')
    expect(wrapper.get('[data-testid=sabbath-mode-duration]').attributes('title')).toBeUndefined()
    await tab.trigger('click')
    expect(mocks.store.setSchedule).toHaveBeenCalledWith(VIDEO_MODE)
  })

  it('modo vídeo sem vídeo: no lugar do campo, convida a escolher; escolher salva o vídeo', async () => {
    open(VIDEO_MODE)
    expect(wrapper.findAllComponents({ name: 'CountdownDurationInput' })).toHaveLength(0)
    expect(wrapper.get('[data-testid=sabbath-video-field]').text()).toContain('sabbathSchool.videoEmpty')
    const pick = wrapper.get('[data-testid=sabbath-video-pick]')
    expect(pick.text()).toContain('sabbathSchool.videoChoose')
    mocks.pick.mockResolvedValueOnce({ ok: true, video: VIDEO })
    await pick.trigger('click')
    await flushPromises()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.store.setCustomVideo).toHaveBeenCalledWith(VIDEO)
  })

  it('com vídeo: mostra nome e duração; trocar pede confirmação porque o anterior é apagado', async () => {
    mocks.store.config.customVideo = VIDEO
    open(VIDEO_MODE)
    const field = wrapper.get('[data-testid=sabbath-video-field]')
    expect(field.text()).toContain('Tema da ES.mp4')
    expect(field.text()).toContain('1:02:05')
    const pick = wrapper.get('[data-testid=sabbath-video-pick]')
    expect(pick.text()).toContain('sabbathSchool.videoReplace')
    mocks.confirm.mockResolvedValueOnce(false)
    await pick.trigger('click')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'sabbathSchool.videoReplaceConfirmTitle',
      message: 'sabbathSchool.videoReplaceConfirmMessage',
      confirmLabel: 'sabbathSchool.videoReplace',
      cancelLabel: 'sabbathSchool.cancel',
    }))
    expect(mocks.pick).not.toHaveBeenCalled()
    mocks.confirm.mockResolvedValueOnce(true)
    mocks.pick.mockResolvedValueOnce({ ok: true, video: { ...VIDEO, name: 'Novo.mp4', durationMs: 65_000 } })
    await pick.trigger('click')
    await flushPromises()
    expect(mocks.store.setCustomVideo).toHaveBeenCalledWith({ ...VIDEO, name: 'Novo.mp4', durationMs: 65_000 })
  })

  it('duração curta aparece em minutos e segundos', () => {
    mocks.store.config.customVideo = { ...VIDEO, durationMs: 65_400 }
    open(VIDEO_MODE)
    expect(wrapper.get('[data-testid=sabbath-video-field]').text()).toContain('1:05')
  })

  it('cancelar o diálogo não muda nada nem mostra erro', async () => {
    open(VIDEO_MODE)
    mocks.pick.mockResolvedValueOnce({ ok: false, reason: 'cancelled' })
    await wrapper.get('[data-testid=sabbath-video-pick]').trigger('click')
    await flushPromises()
    expect(mocks.store.setCustomVideo).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid=sabbath-video-error]').exists()).toBe(false)
  })

  it.each([
    ['invalid_video', 'sabbathSchool.videoInvalid', true],
    ['unsupported_format', 'sabbathSchool.videoUnsupported', false],
    ['unavailable', 'sabbathSchool.videoDesktopOnly', false],
    ['copy_failed', 'sabbathSchool.videoError', false],
  ])('falha %s avisa com %s', async (reason, message, clearsVideo) => {
    open(VIDEO_MODE)
    mocks.pick.mockResolvedValueOnce({ ok: false, reason })
    await wrapper.get('[data-testid=sabbath-video-pick]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid=sabbath-video-error]').text()).toBe(message)
    // o vídeo que não abre já foi apagado da pasta: a config não pode apontar para ele
    expect(mocks.store.setCustomVideo).toHaveBeenCalledTimes(clearsVideo ? 1 : 0)
    if (clearsVideo) expect(mocks.store.setCustomVideo).toHaveBeenCalledWith(null)
    mocks.pick.mockResolvedValueOnce({ ok: true, video: VIDEO })
    await wrapper.get('[data-testid=sabbath-video-pick]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid=sabbath-video-error]').exists()).toBe(false)
  })

  it('modo vídeo: sem ajuste de tempo, áudio dos avisos nem player manual; só o parar', async () => {
    open(VIDEO_MODE)
    for (const label of ['addMinute', 'addFiveMinutes', 'subMinute', 'subFiveMinutes']) {
      expect(wrapper.find(`[aria-label="sabbathSchool.${label}"]`).exists()).toBe(false)
    }
    expect(wrapper.find('[data-testid=operator-audio-controls]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=sabbath-manual-player]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=sabbath-video-player] [data-testid=sabbath-stop]').exists()).toBe(true)
    mocks.store.config.schedule = DURATION
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label="sabbathSchool.addMinute"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=operator-audio-controls]').exists()).toBe(true)
  })

  it('com a contagem em andamento não troca o vídeo; parar continua disponível', async () => {
    mocks.store.config.customVideo = VIDEO
    open(VIDEO_MODE)
    Object.assign(mocks.store, { isIdle: false, runtime: { status: 'paused', videoPath: VIDEO.relativePath } })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid=sabbath-video-pick]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid=sabbath-stop]').attributes('disabled')).toBeUndefined()
  })

  it('vídeo ainda na contagem depois de trocar de modo: o ajuste fino fica travado', async () => {
    open()
    Object.assign(mocks.store, { isIdle: false, runtime: { status: 'paused', videoPath: VIDEO.relativePath } })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-label="sabbathSchool.addMinute"]').attributes('disabled')).toBeDefined()
  })

  it('player do vídeo: play inicia, com a contagem rodando vira pausa, stop para', async () => {
    mocks.store.config.customVideo = VIDEO
    open(VIDEO_MODE)
    const play = () => wrapper.get('[data-testid=sabbath-video-play]')
    expect(play().attributes('aria-label')).toBe('sabbathSchool.videoPlay')
    expect(play().find('.ti-player-play').exists()).toBe(true)
    expect(wrapper.get('[data-testid=sabbath-stop]').attributes('disabled')).toBeDefined()
    await play().trigger('click')
    expect(mocks.store.start).toHaveBeenCalledOnce()
    Object.assign(mocks.store, { isRunning: true, isIdle: false, runtime: { status: 'running', videoPath: VIDEO.relativePath, durationMs: 3 * MIN, accumulatedMs: 0, segmentStartedAt: Date.now() } })
    await wrapper.vm.$nextTick()
    expect(play().attributes('aria-label')).toBe('sabbathSchool.videoPause')
    expect(play().find('.ti-player-pause').exists()).toBe(true)
    await play().trigger('click')
    expect(mocks.store.pause).toHaveBeenCalledOnce()
    await wrapper.get('[data-testid=sabbath-stop]').trigger('click')
    expect(mocks.store.stop).toHaveBeenCalledOnce()
  })

  it('sem vídeo para tocar, o play fica desabilitado', () => {
    mocks.store.canStart = vi.fn(() => false)
    open(VIDEO_MODE)
    expect(wrapper.get('[data-testid=sabbath-video-play]').attributes('disabled')).toBeDefined()
  })

  it('barra de andamento: mostra decorrido e total, anda com o tempo e pula ao arrastar', async () => {
    vi.useFakeTimers()
    try {
      mocks.store.config.customVideo = VIDEO
      mocks.store.runtime = { status: 'idle', videoPath: VIDEO.relativePath, durationMs: 3 * MIN, accumulatedMs: 0, segmentStartedAt: null }
      open(VIDEO_MODE)
      const bar = () => wrapper.get('[data-testid=sabbath-video-progress]')
      const times = () => wrapper.findAll('.sabbath-school-view__player-time').map((el) => el.text())
      expect(bar().attributes('disabled')).toBeDefined()
      expect(bar().attributes('max')).toBe(String(3 * MIN))
      expect(times()).toEqual(['0:00', '3:00'])
      Object.assign(mocks.store, { isRunning: true, isIdle: false, runtime: { ...mocks.store.runtime, status: 'running', segmentStartedAt: Date.now() } })
      await wrapper.vm.$nextTick()
      vi.advanceTimersByTime(65_000)
      await wrapper.vm.$nextTick()
      expect(times()).toEqual(['1:05', '3:00'])
      expect((bar().element as HTMLInputElement).value).toBe('65000')
      await bar().setValue('120000')
      expect(mocks.store.seekVideo).toHaveBeenCalledWith(120000)
      Object.assign(mocks.store, { isRunning: false, runtime: { ...mocks.store.runtime, status: 'paused', accumulatedMs: 999 * MIN, segmentStartedAt: null } })
      await wrapper.vm.$nextTick()
      expect(times()).toEqual(['3:00', '3:00'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('player do vídeo tem mudo e volume próprios', async () => {
    open(VIDEO_MODE)
    const player = wrapper.get('[data-testid=sabbath-video-player]')
    const mute = () => player.get('[data-testid=sabbath-video-mute]')
    const volume = player.get('[data-testid=sabbath-video-volume]')
    expect((volume.element as HTMLInputElement).value).toBe('0.8')
    expect(volume.attributes('aria-label')).toBe('sabbathSchool.videoVolume')
    await volume.setValue('0.35')
    expect(mocks.store.setVideoVolume).toHaveBeenCalledWith(0.35)
    expect(mute().attributes('aria-label')).toBe('sabbathSchool.muteAudio')
    expect(mute().find('.ti-volume').exists()).toBe(true)
    await mute().trigger('click')
    expect(mocks.store.setVideoMuted).toHaveBeenCalledWith(true)
    mocks.store.videoMuted = true
    await wrapper.vm.$nextTick()
    expect(mute().attributes('aria-label')).toBe('sabbathSchool.unmuteAudio')
    expect(mute().find('.ti-volume-off').exists()).toBe(true)
    await mute().trigger('click')
    expect(mocks.store.setVideoMuted).toHaveBeenLastCalledWith(false)
    expect(mocks.store.setAudioMuted).not.toHaveBeenCalled()
  })
})
