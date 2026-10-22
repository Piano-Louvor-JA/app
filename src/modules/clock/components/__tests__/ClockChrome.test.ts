import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'
// @vitest-environment jsdom
/**
 * ClockChrome — prévia + projetar flutuantes do Relógio: visível no Relógio
 * e, fora dele, enquanto projeta; arrastável com posição salva.
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

import clockLocale from '../../locales/pt-BR'
import type { ClockConfig } from '../../types/clock'
import ClockChrome from '../ClockChrome.vue'

const route = reactive<{ name: string }>({ name: 'utilities-clock' })
const push = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}))

type Stage = {
  backgroundColor: string | null
  backgroundImage: string
  fontSize: number
  clock?: Partial<ClockConfig>
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
vi.mock('../ClockPreview.vue', () => ({
  default: {
    name: 'ClockPreview',
    props: ['config', 'stage'],
    template: '<div class="clock-preview-stub" />',
  },
}))

const BASE_CONFIG: ClockConfig = {
  style: 'digital',
  showSeconds: true,
  format24h: true,
  bgColor: '#000',
  textColor: '#fff',
}

const store = reactive({
  config: { ...BASE_CONFIG },
  isProjecting: false,
  toggleProjection: vi.fn().mockResolvedValue(undefined),
  clearProjection: vi.fn(),
})

vi.mock('../../stores/useClockStore', () => ({
  useClockStore: () => store,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': clockLocale },
})

const KEY = USER_PREFERENCE_KEYS.clockChromePosition
const RECT = { left: 600, top: 500, width: 400, height: 150 }

let wrapper: VueWrapper | null = null

function mountChrome() {
  wrapper = mount(ClockChrome, { global: { plugins: [i18n] } })
  return wrapper
}

function previewProps(w: VueWrapper) {
  return w.findComponent({ name: 'ClockPreview' }).props() as {
    config: ClockConfig
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
  route.name = 'utilities-clock'
  stageState.current = { backgroundColor: '#101010', backgroundImage: 'stage:x', fontSize: 96 } satisfies Stage
  stageState.subscribers = []
  store.config = { ...BASE_CONFIG }
  store.isProjecting = false
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

describe('ClockChrome — visibilidade', () => {
  it('no Relógio: prévia e projetar, sem o botão de abrir o Relógio', () => {
    const w = mountChrome()
    expect(w.find('.clock-preview-stub').exists()).toBe(true)
    expect(w.find('.clock-project-fab').exists()).toBe(true)
    expect(w.find('.clock-chrome__icon-btn').exists()).toBe(false)
  })

  it('fora do Relógio: só aparece enquanto projeta', async () => {
    route.name = 'liturgy'
    const w = mountChrome()
    expect(w.find('.clock-chrome').exists()).toBe(false)

    store.isProjecting = true
    await nextTick()
    expect(w.find('.clock-project-fab--active').exists()).toBe(true)

    store.isProjecting = false
    await nextTick()
    expect(w.find('.clock-chrome').exists()).toBe(false)
  })
})

describe('ClockChrome — ações', () => {
  it('projetar e retirar da projeção', async () => {
    const w = mountChrome()
    await w.find('.clock-project-fab').trigger('click')
    expect(store.toggleProjection).toHaveBeenCalledTimes(1)

    store.isProjecting = true
    await nextTick()
    await w.find('.clock-project-fab').trigger('click')
    expect(store.clearProjection).toHaveBeenCalledTimes(1)
  })

  it('botão de abrir o Relógio: só fora dele e leva de volta à tela', async () => {
    route.name = 'bible'
    store.isProjecting = true
    const w = mountChrome()
    const open = w.find('.clock-chrome__icon-btn')
    expect(open.attributes('aria-label')).toBe(clockLocale.clock.openClock)
    await open.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'utilities-clock' })
  })
})

describe('ClockChrome — miniatura', () => {
  it('usa cor e imagem do palco do Relógio', () => {
    const style = mountChrome().find('.clock-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(16, 16, 16)')
    expect(style).toContain('bg.png')
  })

  it('sem cor nem imagem no palco: fundo preto e sem url()', () => {
    stageState.current = { backgroundColor: null, backgroundImage: '', fontSize: 96 } satisfies Stage
    resolveBg.mockReturnValueOnce(null)
    const style = mountChrome().find('.clock-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(0, 0, 0)')
    expect(style).not.toContain('url(')
  })

  it('prévia recebe a config com as características do palco', async () => {
    stageState.current = {
      backgroundColor: '#101010',
      backgroundImage: '',
      fontSize: 96,
      clock: { style: 'analog' },
    } satisfies Stage
    const w = mountChrome()
    expect(previewProps(w).config).toMatchObject({ style: 'analog', format24h: true })

    stageState.current = { backgroundColor: '#202020', backgroundImage: '', fontSize: 120 } satisfies Stage
    stageState.subscribers.forEach((cb) => cb())
    await nextTick()
    expect(previewProps(w).stage.fontSize).toBe(120)
    expect(previewProps(w).config.style).toBe('digital')
  })

  it('desmontar cancela a inscrição no palco', () => {
    const w = mountChrome()
    expect(stageState.subscribers).toHaveLength(1)
    w.unmount()
    wrapper = null
    expect(stageState.subscribers).toHaveLength(0)
  })
})

describe('ClockChrome — arrastar', () => {
  it('arrasta pela prévia e salva a posição só do Relógio', async () => {
    const w = mountChrome()
    const preview = w.find('.clock-chrome__preview')
    expect(preview.attributes('title')).toBe(clockLocale.clock.chromeDragHint)

    preview.element.dispatchEvent(pointer('pointerdown', 650, 520))
    window.dispatchEvent(pointer('pointermove', 450, 320))
    await nextTick()
    expect(w.find('.clock-chrome').classes()).toContain('clock-chrome--dragging')

    window.dispatchEvent(pointer('pointerup', 450, 320))
    await nextTick()
    const root = w.find('.clock-chrome').element as HTMLElement
    expect(root.style.left).toBe('400px')
    expect(root.style.top).toBe('300px')
    expect(loadFloatingPosition(KEY)).toEqual({ x: 400, y: 300 })
    expect(loadFloatingPosition(USER_PREFERENCE_KEYS.timerChromePosition)).toBeNull()
  })

  it('reabre na posição salva e o duplo clique volta ao canto', async () => {
    saveFloatingPosition(KEY, { x: 100, y: 100 })
    const w = mountChrome()
    const root = () => w.find('.clock-chrome').element as HTMLElement
    expect(root().style.left).toBe('100px')

    await w.find('.clock-chrome__preview').trigger('dblclick')
    expect(root().style.left).toBe('')
    expect(loadFloatingPosition(KEY)).toBeNull()
  })
})

describe('ClockChrome — título da prévia', () => {
  it('mostra "Relógio" acima da prévia flutuante', () => {
    const w = mountChrome()
    const title = w.find('.floating-preview-title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('Relógio')
  })
})


it('restaura a projeção recolhida pelo controle existente sem navegar', async () => {
  const minimized = useInAppProjectionMinimized('clock')
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
