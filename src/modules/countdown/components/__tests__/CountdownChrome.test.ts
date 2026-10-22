import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'
// @vitest-environment jsdom
/**
 * CountdownChrome — prévia + iniciar/pausar + projetar flutuantes do Timer:
 * visível no Timer e, fora dele, enquanto projeta ou roda; arrastável com
 * posição salva.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  loadFloatingPosition,
  saveFloatingPosition,
} from '@shared/services/floating-position'

import countdownLocale from '../../locales/pt-BR'
import type { CountdownDisplayConfig, CountdownRuntimeState } from '../../types/countdown'
import CountdownChrome from '../CountdownChrome.vue'

const route = reactive<{ name: string }>({ name: 'utilities-countdown' })
const push = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}))

type Stage = {
  backgroundColor: string | null
  backgroundImage: string
  fontSize: number
  countdown?: Partial<CountdownDisplayConfig>
}
const stageState = vi.hoisted(() => ({
  current: null as unknown,
  subscribers: [] as Array<() => void>,
}))
const resolveBg = vi.hoisted(() => vi.fn((): string | null => 'http://localhost/img/bg.png'))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => stageState.current,
  subscribeStageSettings: (cb: () => void) => {
    stageState.subscribers.push(cb)
    return () => {
      stageState.subscribers = stageState.subscribers.filter((fn) => fn !== cb)
    }
  },
}))
vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: resolveBg,
}))
vi.mock('../CountdownPreview.vue', () => ({
  default: {
    name: 'CountdownPreview',
    props: ['config', 'runtime', 'stage'],
    template: '<div class="countdown-preview-stub" />',
  },
}))

function idleRuntime(): CountdownRuntimeState {
  return {
    status: 'idle',
    segmentStartedAt: null,
    accumulatedMs: 0,
    durationMs: 300_000,
    savedTimesMs: [],
    finished: false,
  } as CountdownRuntimeState
}

const store = reactive({
  config: { timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' } as CountdownDisplayConfig,
  runtime: idleRuntime(),
  isProjecting: false,
  isRunning: false,
  canStart: true,
  start: vi.fn(),
  pause: vi.fn(),
  toggleProjection: vi.fn().mockResolvedValue(undefined),
  clearProjection: vi.fn(),
})

vi.mock('../../stores/useCountdownStore', () => ({
  useCountdownStore: () => store,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': countdownLocale },
})

const KEY = USER_PREFERENCE_KEYS.countdownChromePosition
const RECT = { left: 600, top: 500, width: 400, height: 150 }

let wrapper: VueWrapper | null = null

function mountChrome() {
  wrapper = mount(CountdownChrome, { global: { plugins: [i18n] } })
  return wrapper
}

function previewProps(w: VueWrapper) {
  return w.findComponent({ name: 'CountdownPreview' }).props() as {
    config: CountdownDisplayConfig
    runtime: CountdownRuntimeState
    stage: Stage
  }
}

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

beforeEach(() => {
  localStorage.clear()
  route.name = 'utilities-countdown'
  stageState.current = { backgroundColor: '#101010', backgroundImage: 'stage:x', fontSize: 96 } satisfies Stage
  stageState.subscribers = []
  store.config = { timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' }
  store.runtime = idleRuntime()
  store.isProjecting = false
  store.isRunning = false
  store.canStart = true
  store.start.mockClear()
  store.pause.mockClear()
  store.toggleProjection.mockClear()
  store.clearProjection.mockClear()
  push.mockClear()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...RECT,
    x: RECT.left,
    y: RECT.top,
    right: RECT.left + RECT.width,
    bottom: RECT.top + RECT.height,
    toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

describe('CountdownChrome — visibilidade', () => {
  it('no Timer: prévia, iniciar e projetar, sem o botão de abrir o Timer', () => {
    const w = mountChrome()
    expect(w.find('.countdown-preview-stub').exists()).toBe(true)
    expect(w.find('.countdown-chrome__toggle--start').exists()).toBe(true)
    expect(w.find('.countdown-project-fab').exists()).toBe(true)
    expect(w.find('.countdown-chrome__icon-btn').exists()).toBe(false)
  })

  it('fora do Timer: some parado e fica flutuando enquanto projeta ou roda', async () => {
    route.name = 'liturgy'
    const w = mountChrome()
    expect(w.find('.countdown-chrome').exists()).toBe(false)

    store.isProjecting = true
    await nextTick()
    expect(w.find('.countdown-project-fab--active').exists()).toBe(true)

    store.isProjecting = false
    store.isRunning = true
    await nextTick()
    expect(w.find('.countdown-chrome__toggle--pause').exists()).toBe(true)

    store.isRunning = false
    await nextTick()
    expect(w.find('.countdown-chrome').exists()).toBe(false)
  })
})

describe('CountdownChrome — ações', () => {
  it('iniciar/pausar é um botão só que alterna com o estado', async () => {
    const w = mountChrome()
    const start = w.find('.countdown-chrome__toggle--start')
    expect(start.attributes('aria-label')).toBe(countdownLocale.countdown.start)
    expect(w.find('.countdown-chrome__toggle--pause').exists()).toBe(false)
    await start.trigger('click')
    expect(store.start).toHaveBeenCalledTimes(1)

    store.isRunning = true
    await nextTick()
    expect(w.find('.countdown-chrome__toggle--start').exists()).toBe(false)
    const pause = w.find('.countdown-chrome__toggle--pause')
    expect(pause.attributes('aria-label')).toBe(countdownLocale.countdown.pause)
    await pause.trigger('click')
    expect(store.pause).toHaveBeenCalledTimes(1)
  })

  it('iniciar desabilitado quando o Timer não pode começar', () => {
    store.canStart = false
    const w = mountChrome()
    expect(w.find('.countdown-chrome__toggle--start').attributes('disabled')).toBeDefined()
  })

  it('projetar e retirar da projeção', async () => {
    const w = mountChrome()
    await w.find('.countdown-project-fab').trigger('click')
    expect(store.toggleProjection).toHaveBeenCalledTimes(1)

    store.isProjecting = true
    await nextTick()
    await w.find('.countdown-project-fab').trigger('click')
    expect(store.clearProjection).toHaveBeenCalledTimes(1)
  })

  it('botão de abrir o Timer: só fora do Timer e leva de volta à tela', async () => {
    route.name = 'bible'
    store.isProjecting = true
    const w = mountChrome()
    const open = w.find('.countdown-chrome__icon-btn')
    expect(open.attributes('aria-label')).toBe(countdownLocale.countdown.openTimer)
    await open.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'utilities-countdown' })
  })
})

describe('CountdownChrome — miniatura', () => {
  it('usa cor e imagem do palco do Timer', () => {
    const style = mountChrome().find('.countdown-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(16, 16, 16)')
    expect(style).toContain('bg.png')
  })

  it('sem cor nem imagem no palco: fundo preto e sem url()', () => {
    stageState.current = { backgroundColor: null, backgroundImage: '', fontSize: 96 } satisfies Stage
    resolveBg.mockReturnValueOnce(null)
    const style = mountChrome().find('.countdown-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(0, 0, 0)')
    expect(style).not.toContain('url(')
  })

  it('prévia recebe o runtime real e a config com as características do palco', async () => {
    stageState.current = {
      backgroundColor: '#101010',
      backgroundImage: '',
      fontSize: 96,
      countdown: { timeFormat: 'mm:ss' },
    } satisfies Stage
    const w = mountChrome()
    expect(previewProps(w).runtime).toEqual(store.runtime)
    expect(previewProps(w).config.timeFormat).toBe('mm:ss')
    expect(previewProps(w).config.allowNegative).toBe(false)

    stageState.current = { backgroundColor: '#202020', backgroundImage: '', fontSize: 120 } satisfies Stage
    stageState.subscribers.forEach((cb) => cb())
    await nextTick()
    expect(previewProps(w).stage.fontSize).toBe(120)
    expect(previewProps(w).config.timeFormat).toBe('hh:mm:ss')
  })

  it('Escola Sabatina parada: prévia mostra a duração do agendamento', () => {
    store.config = {
      ...store.config,
      mode: 'sabbath',
      sabbathConfig: { scheduleMode: 'start', startTime: '09:00', endTime: '10:15' },
    }
    const w = mountChrome()
    expect(previewProps(w).runtime.durationMs).toBe(75 * 60_000)
  })

  it('desmontar cancela a inscrição no palco', () => {
    const w = mountChrome()
    expect(stageState.subscribers).toHaveLength(1)
    w.unmount()
    wrapper = null
    expect(stageState.subscribers).toHaveLength(0)
  })
})

describe('CountdownChrome — arrastar', () => {
  it('arrasta pela prévia e salva a posição só do Timer', async () => {
    const w = mountChrome()
    const preview = w.find('.countdown-chrome__preview')
    expect(preview.attributes('title')).toBe(countdownLocale.countdown.chromeDragHint)

    preview.element.dispatchEvent(pointer('pointerdown', 650, 520))
    window.dispatchEvent(pointer('pointermove', 450, 320))
    await nextTick()
    expect(w.find('.countdown-chrome').classes()).toContain('countdown-chrome--dragging')

    window.dispatchEvent(pointer('pointerup', 450, 320))
    await nextTick()
    const root = w.find('.countdown-chrome').element as HTMLElement
    expect(root.style.left).toBe('400px')
    expect(root.style.top).toBe('300px')
    expect(loadFloatingPosition(KEY)).toEqual({ x: 400, y: 300 })
    expect(loadFloatingPosition(USER_PREFERENCE_KEYS.bibleChromePosition)).toBeNull()
  })

  it('reabre na posição salva e o duplo clique volta ao canto', async () => {
    saveFloatingPosition(KEY, { x: 100, y: 100 })
    const w = mountChrome()
    const root = () => w.find('.countdown-chrome').element as HTMLElement
    expect(root().style.left).toBe('100px')

    await w.find('.countdown-chrome__preview').trigger('dblclick')
    expect(root().style.left).toBe('')
    expect(loadFloatingPosition(KEY)).toBeNull()
  })
})

describe('CountdownChrome — título da prévia', () => {
  it('mostra "Timer" acima da prévia flutuante', () => {
    const w = mountChrome()
    const title = w.find('.floating-preview-title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('Timer')
  })
})


it('restaura a projeção recolhida pelo controle existente sem navegar', async () => {
  const minimized = useInAppProjectionMinimized('countdown')
  minimized.value = true
  const w = mountChrome()
  try {
    const button = w.find('button:has(.ti-arrows-maximize)')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    expect(minimized.value).toBe(false)
    expect(push).not.toHaveBeenCalled()
  } finally { minimized.value = false; w.unmount() }
})
