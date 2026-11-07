// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

import countdownLocale from '@modules/countdown/locales/pt-BR'
import type { CountdownRuntimeState } from '@modules/countdown/types/countdown'
import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'

import sabbathSchoolLocale from '../../locales/pt-BR'
import SabbathSchoolChrome from '../SabbathSchoolChrome.vue'

const route = reactive<{ name: string }>({ name: 'utilities-sabbath-school' })
const push = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const stage = vi.hoisted(() => ({ current: { backgroundColor: null as string | null, backgroundImage: '' } }))
const resolveBg = vi.hoisted(() => vi.fn((): string | null => null))

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push }) }))
vi.mock('@modules/settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => stage.current,
  subscribeStageSettings: () => () => {},
}))
vi.mock('@modules/settings/types/stage-settings', () => ({ resolveBackgroundImage: resolveBg }))
vi.mock('@modules/countdown/components/CountdownPreview.vue', () => ({
  default: { name: 'CountdownPreview', props: { config: null, runtime: null, stage: null, muted: Boolean }, template: '<div class="preview-stub" />' },
}))

const runtime = (status: CountdownRuntimeState['status']) =>
  ({ status, segmentStartedAt: null, accumulatedMs: 0, durationMs: 4_500_000, savedTimesMs: [], finished: false }) as unknown as CountdownRuntimeState

const store = reactive({
  runtime: runtime('idle'),
  isRunning: false,
  isIdle: true,
  isProjecting: false,
  inAppPreview: false,
  rehearsing: false,
  allowed: true,
  canStart(): boolean { return this.allowed },
  start: vi.fn(),
  pause: vi.fn(),
  stopAudio: vi.fn(),
  toggleProjection: vi.fn().mockResolvedValue(undefined),
  clearProjection: vi.fn(),
})
const appearance = reactive({ config: { timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' } })

vi.mock('../../stores/useSabbathSchoolStore', () => ({
  SABBATH_SCHOOL_ROUTE: 'utilities-sabbath-school',
  useSabbathSchoolStore: () => store,
}))
vi.mock('@modules/countdown/stores/useCountdownStore', () => ({ useCountdownStore: () => appearance }))

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': { ...countdownLocale, ...sabbathSchoolLocale } } })
let wrapper: VueWrapper | null = null

function mountChrome() {
  wrapper = mount(SabbathSchoolChrome, { global: { plugins: [i18n] } })
  return wrapper
}

function setStatus(status: CountdownRuntimeState['status']) {
  store.runtime = runtime(status)
  store.isRunning = status === 'running'
  store.isIdle = status === 'idle'
}

beforeEach(() => {
  route.name = 'utilities-sabbath-school'
  stage.current = { backgroundColor: null, backgroundImage: '' }
  resolveBg.mockReturnValue(null)
  setStatus('idle')
  store.isProjecting = false
  store.inAppPreview = false
  store.rehearsing = false
  store.allowed = true
  useInAppProjectionMinimized('countdown').value = false
  vi.clearAllMocks()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('prévia flutuante da Escola Sabatina', () => {
  it('na tela dela: título, prévia da própria contagem, iniciar e projetar, sem abrir nem fechar', () => {
    const w = mountChrome()
    expect(w.find('.floating-preview-title').text()).toBe('Escola Sabatina')
    expect(w.findComponent({ name: 'CountdownPreview' }).props('runtime')).toEqual(store.runtime)
    // o som do vídeo personalizado sai só da projeção
    expect(w.findComponent({ name: 'CountdownPreview' }).props('muted')).toBe(true)
    expect(w.find('[data-testid=sabbath-chrome-start]').exists()).toBe(true)
    expect(w.find('.countdown-project-fab').exists()).toBe(true)
    expect(w.find('[data-testid=sabbath-chrome-open]').exists()).toBe(false)
    expect(w.findComponent({ name: 'MiniPlayerCloseButton' }).exists()).toBe(false)
    expect(w.get('.sabbath-chrome__preview').attributes('style')).toContain('background-color: rgb(0, 0, 0)')
  })

  it('fora da tela: some parada e aparece contando, pausada ou projetando', async () => {
    route.name = 'home'
    const w = mountChrome()
    expect(w.find('[data-testid=sabbath-chrome]').exists()).toBe(false)
    setStatus('paused')
    await nextTick()
    expect(w.find('[data-testid=sabbath-chrome]').exists()).toBe(true)
    setStatus('idle')
    store.isProjecting = true
    await nextTick()
    expect(w.find('[data-testid=sabbath-chrome]').exists()).toBe(true)
  })

  it('iniciar respeita o que a agenda permite; pausar aparece contando', async () => {
    stage.current = { backgroundColor: '#222222', backgroundImage: 'stage:x' }
    resolveBg.mockReturnValue('http://localhost/bg.png')
    store.allowed = false
    const w = mountChrome()
    expect(w.get('.sabbath-chrome__preview').attributes('style')).toContain('bg.png')
    expect(w.get('[data-testid=sabbath-chrome-start]').attributes('disabled')).toBeDefined()
    store.rehearsing = true
    await nextTick()
    expect(w.get('[data-testid=sabbath-chrome-start]').attributes('disabled')).toBeUndefined()
    await w.get('[data-testid=sabbath-chrome-start]').trigger('click')
    expect(store.start).toHaveBeenCalledOnce()
    setStatus('running')
    await nextTick()
    await w.get('[data-testid=sabbath-chrome-pause]').trigger('click')
    expect(store.pause).toHaveBeenCalledOnce()
  })

  it('projetar e retirar da projeção usam a Escola Sabatina', async () => {
    const w = mountChrome()
    await w.get('.countdown-project-fab').trigger('click')
    expect(store.toggleProjection).toHaveBeenCalledOnce()
    store.isProjecting = true
    await nextTick()
    await w.get('.countdown-project-fab').trigger('click')
    expect(store.clearProjection).toHaveBeenCalledOnce()
  })

  it('fora da tela: abrir leva à Escola Sabatina; fechar pausa, corta o som e tira da projeção', async () => {
    route.name = 'home'
    setStatus('running')
    store.isProjecting = true
    const w = mountChrome()
    await w.get('[data-testid=sabbath-chrome-open]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'utilities-sabbath-school' })
    w.findComponent({ name: 'MiniPlayerCloseButton' }).vm.$emit('close')
    await nextTick()
    expect(store.pause).toHaveBeenCalledOnce()
    expect(store.stopAudio).toHaveBeenCalledOnce()
    expect(store.clearProjection).toHaveBeenCalledOnce()
    expect(w.find('[data-testid=sabbath-chrome]').exists()).toBe(false)
    route.name = 'utilities-sabbath-school'
    await nextTick()
    expect(w.find('[data-testid=sabbath-chrome]').exists()).toBe(true)
  })

  it('fechar sem projeção não tenta retirar; voltar a contar reaparece', async () => {
    route.name = 'home'
    setStatus('paused')
    const w = mountChrome()
    w.findComponent({ name: 'MiniPlayerCloseButton' }).vm.$emit('close')
    await nextTick()
    expect(store.clearProjection).not.toHaveBeenCalled()
    setStatus('running')
    await nextTick()
    expect(w.find('[data-testid=sabbath-chrome]').exists()).toBe(true)
    setStatus('idle')
    store.isProjecting = true
    await nextTick()
    w.findComponent({ name: 'MiniPlayerCloseButton' }).vm.$emit('close')
    store.isProjecting = false
    await nextTick()
    store.isProjecting = true
    await nextTick()
    expect(w.find('[data-testid=sabbath-chrome]').exists()).toBe(true)
  })

  it('com a prévia na tela recolhida, abrir a restaura sem navegar', async () => {
    const minimized = useInAppProjectionMinimized('countdown')
    minimized.value = true
    store.inAppPreview = true
    const w = mountChrome()
    await w.get('[data-testid=sabbath-chrome-open]').trigger('click')
    expect(minimized.value).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })
})
