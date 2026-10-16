// @vitest-environment jsdom
/**
 * TimerChrome — prévia + iniciar/pausar + projetar flutuantes do Cronômetro:
 * visível no Cronômetro e, fora dele, enquanto projeta ou roda; arrastável
 * com posição salva.
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

import timerLocale from '../../locales/pt-BR'
import type { TimerDisplayConfig, TimerRuntimeState } from '../../types/timer'
import TimerChrome from '../TimerChrome.vue'

const route = reactive<{ name: string }>({ name: 'utilities-timer' })
const push = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}))

type Stage = {
  backgroundColor: string | null
  backgroundImage: string
  fontSize: number
  timer?: Partial<TimerDisplayConfig>
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
vi.mock('../TimerPreview.vue', () => ({
  default: {
    name: 'TimerPreview',
    props: ['config', 'runtime', 'stage'],
    template: '<div class="timer-preview-stub" />',
  },
}))

function idleRuntime(): TimerRuntimeState {
  return { status: 'idle', segmentStartedAt: null, accumulatedMs: 0, savedTimesMs: [] }
}

const store = reactive({
  config: { timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' } as TimerDisplayConfig,
  runtime: idleRuntime(),
  isProjecting: false,
  isRunning: false,
  start: vi.fn(),
  pause: vi.fn(),
  toggleProjection: vi.fn().mockResolvedValue(undefined),
  clearProjection: vi.fn(),
})

vi.mock('../../stores/useTimerStore', () => ({
  useTimerStore: () => store,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': timerLocale },
})

const KEY = USER_PREFERENCE_KEYS.timerChromePosition
const RECT = { left: 600, top: 500, width: 400, height: 150 }

let wrapper: VueWrapper | null = null

function mountChrome() {
  wrapper = mount(TimerChrome, { global: { plugins: [i18n] } })
  return wrapper
}

function previewProps(w: VueWrapper) {
  return w.findComponent({ name: 'TimerPreview' }).props() as {
    config: TimerDisplayConfig
    runtime: TimerRuntimeState
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
  route.name = 'utilities-timer'
  stageState.current = { backgroundColor: '#101010', backgroundImage: 'stage:x', fontSize: 96 } satisfies Stage
  stageState.subscribers = []
  store.config = { timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' }
  store.runtime = idleRuntime()
  store.isProjecting = false
  store.isRunning = false
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

describe('TimerChrome — visibilidade', () => {
  it('no Cronômetro: prévia, iniciar e projetar, sem o botão de abrir o Cronômetro', () => {
    const w = mountChrome()
    expect(w.find('.timer-preview-stub').exists()).toBe(true)
    expect(w.find('.timer-chrome__toggle--start').exists()).toBe(true)
    expect(w.find('.timer-project-fab').exists()).toBe(true)
    expect(w.find('.timer-chrome__icon-btn').exists()).toBe(false)
  })

  it('fora do Cronômetro: some parado e fica flutuando enquanto projeta ou roda', async () => {
    route.name = 'liturgy'
    const w = mountChrome()
    expect(w.find('.timer-chrome').exists()).toBe(false)

    store.isProjecting = true
    await nextTick()
    expect(w.find('.timer-project-fab--active').exists()).toBe(true)

    store.isProjecting = false
    store.isRunning = true
    await nextTick()
    expect(w.find('.timer-chrome__toggle--pause').exists()).toBe(true)

    store.isRunning = false
    await nextTick()
    expect(w.find('.timer-chrome').exists()).toBe(false)
  })
})

describe('TimerChrome — ações', () => {
  it('iniciar/pausar é um botão só que alterna com o estado', async () => {
    const w = mountChrome()
    const start = w.find('.timer-chrome__toggle--start')
    expect(start.attributes('aria-label')).toBe(timerLocale.timer.start)
    expect(w.find('.timer-chrome__toggle--pause').exists()).toBe(false)
    await start.trigger('click')
    expect(store.start).toHaveBeenCalledTimes(1)

    store.isRunning = true
    await nextTick()
    expect(w.find('.timer-chrome__toggle--start').exists()).toBe(false)
    const pause = w.find('.timer-chrome__toggle--pause')
    expect(pause.attributes('aria-label')).toBe(timerLocale.timer.pause)
    await pause.trigger('click')
    expect(store.pause).toHaveBeenCalledTimes(1)
  })

  it('projetar e retirar da projeção', async () => {
    const w = mountChrome()
    await w.find('.timer-project-fab').trigger('click')
    expect(store.toggleProjection).toHaveBeenCalledTimes(1)

    store.isProjecting = true
    await nextTick()
    await w.find('.timer-project-fab').trigger('click')
    expect(store.clearProjection).toHaveBeenCalledTimes(1)
  })

  it('botão de abrir o Cronômetro: só fora dele e leva de volta à tela', async () => {
    route.name = 'bible'
    store.isProjecting = true
    const w = mountChrome()
    const open = w.find('.timer-chrome__icon-btn')
    expect(open.attributes('aria-label')).toBe(timerLocale.timer.openStopwatch)
    await open.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'utilities-timer' })
  })
})

describe('TimerChrome — miniatura', () => {
  it('usa cor e imagem do palco do Cronômetro', () => {
    const style = mountChrome().find('.timer-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(16, 16, 16)')
    expect(style).toContain('bg.png')
  })

  it('sem cor nem imagem no palco: fundo preto e sem url()', () => {
    stageState.current = { backgroundColor: null, backgroundImage: '', fontSize: 96 } satisfies Stage
    resolveBg.mockReturnValueOnce(null)
    const style = mountChrome().find('.timer-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(0, 0, 0)')
    expect(style).not.toContain('url(')
  })

  it('prévia recebe o runtime real e a config com as características do palco', async () => {
    stageState.current = {
      backgroundColor: '#101010',
      backgroundImage: '',
      fontSize: 96,
      timer: { timeFormat: 'mm:ss' },
    } satisfies Stage
    const w = mountChrome()
    expect(previewProps(w).runtime).toEqual(store.runtime)
    expect(previewProps(w).config.timeFormat).toBe('mm:ss')

    stageState.current = { backgroundColor: '#202020', backgroundImage: '', fontSize: 120 } satisfies Stage
    stageState.subscribers.forEach((cb) => cb())
    await nextTick()
    expect(previewProps(w).stage.fontSize).toBe(120)
    expect(previewProps(w).config.timeFormat).toBe('hh:mm:ss')
  })

  it('desmontar cancela a inscrição no palco', () => {
    const w = mountChrome()
    expect(stageState.subscribers).toHaveLength(1)
    w.unmount()
    wrapper = null
    expect(stageState.subscribers).toHaveLength(0)
  })
})

describe('TimerChrome — arrastar', () => {
  it('arrasta pela prévia e salva a posição só do Cronômetro', async () => {
    const w = mountChrome()
    const preview = w.find('.timer-chrome__preview')
    expect(preview.attributes('title')).toBe(timerLocale.timer.chromeDragHint)

    preview.element.dispatchEvent(pointer('pointerdown', 650, 520))
    window.dispatchEvent(pointer('pointermove', 450, 320))
    await nextTick()
    expect(w.find('.timer-chrome').classes()).toContain('timer-chrome--dragging')

    window.dispatchEvent(pointer('pointerup', 450, 320))
    await nextTick()
    const root = w.find('.timer-chrome').element as HTMLElement
    expect(root.style.left).toBe('400px')
    expect(root.style.top).toBe('300px')
    expect(loadFloatingPosition(KEY)).toEqual({ x: 400, y: 300 })
    expect(loadFloatingPosition(USER_PREFERENCE_KEYS.countdownChromePosition)).toBeNull()
  })

  it('reabre na posição salva e o duplo clique volta ao canto', async () => {
    saveFloatingPosition(KEY, { x: 100, y: 100 })
    const w = mountChrome()
    const root = () => w.find('.timer-chrome').element as HTMLElement
    expect(root().style.left).toBe('100px')

    await w.find('.timer-chrome__preview').trigger('dblclick')
    expect(root().style.left).toBe('')
    expect(loadFloatingPosition(KEY)).toBeNull()
  })
})
