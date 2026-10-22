import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'
// @vitest-environment jsdom
/**
 * RandomChrome — prévia + sortear + projetar flutuantes do Sorteio: visível
 * no Sorteio e, fora dele, enquanto projeta ou sorteia; arrastável com
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

import randomLocale from '../../locales/pt-BR'
import {
  DEFAULT_RANDOM_DISPLAY_CONFIG,
  DEFAULT_RANDOM_RUNTIME,
  type RandomDisplayConfig,
  type RandomRuntimeState,
} from '../../types/random'
import RandomChrome from '../RandomChrome.vue'

const route = reactive<{ name: string }>({ name: 'utilities-random' })
const push = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}))

type Stage = {
  backgroundColor: string | null
  backgroundImage: string
  random?: Partial<RandomDisplayConfig>
}
const stageState = vi.hoisted(() => ({
  current: null as unknown,
  subscribers: [] as Array<() => void>,
}))
const resolveBg = vi.hoisted(() => vi.fn((): string | null => null))

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

const store = reactive({
  config: { ...DEFAULT_RANDOM_DISPLAY_CONFIG, bgColor: '#123456' } as RandomDisplayConfig,
  runtime: { ...DEFAULT_RANDOM_RUNTIME } as RandomRuntimeState,
  isProjecting: false,
  canDraw: true,
  startDraw: vi.fn(),
  toggleProjection: vi.fn().mockResolvedValue(undefined),
  clearProjection: vi.fn(),
})

vi.mock('../../stores/useRandomStore', () => ({
  useRandomStore: () => store,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': randomLocale },
})

const KEY = USER_PREFERENCE_KEYS.randomChromePosition
const RECT = { left: 600, top: 500, width: 400, height: 150 }

let wrapper: VueWrapper | null = null

function mountChrome() {
  wrapper = mount(RandomChrome, { global: { plugins: [i18n] } })
  return wrapper
}

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

beforeEach(() => {
  localStorage.clear()
  route.name = 'utilities-random'
  stageState.current = { backgroundColor: '#101010', backgroundImage: '' } satisfies Stage
  stageState.subscribers = []
  resolveBg.mockReturnValue(null)
  store.config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, bgColor: '#123456' }
  store.runtime = { ...DEFAULT_RANDOM_RUNTIME }
  store.isProjecting = false
  store.canDraw = true
  store.startDraw.mockClear()
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

describe('RandomChrome — visibilidade', () => {
  it('no Sorteio: prévia e projetar; sortear e abrir ficam com a tela', () => {
    const w = mountChrome()
    expect(w.find('.random-chrome__preview').exists()).toBe(true)
    expect(w.find('.random-project-fab').exists()).toBe(true)
    expect(w.find('.random-chrome__draw').exists()).toBe(false)
    expect(w.find('.random-chrome__icon-btn').exists()).toBe(false)
  })

  it('fora do Sorteio: some parado e fica flutuando enquanto projeta ou sorteia', async () => {
    route.name = 'liturgy'
    const w = mountChrome()
    expect(w.find('.random-chrome').exists()).toBe(false)

    store.isProjecting = true
    await nextTick()
    expect(w.find('.random-project-fab--active').exists()).toBe(true)

    store.isProjecting = false
    store.runtime = { ...store.runtime, isDrawing: true }
    await nextTick()
    expect(w.find('.random-chrome__display--drawing').exists()).toBe(true)

    store.runtime = { ...store.runtime, isDrawing: false }
    await nextTick()
    expect(w.find('.random-chrome').exists()).toBe(false)
  })
})

describe('RandomChrome — ações', () => {
  it('fora do Sorteio: sortear dispara o sorteio e fica desabilitado sem candidatos', async () => {
    route.name = 'bible'
    store.isProjecting = true
    const w = mountChrome()
    const draw = w.find('.random-chrome__draw')
    expect(draw.attributes('aria-label')).toBe(randomLocale.random.drawButton)
    await draw.trigger('click')
    expect(store.startDraw).toHaveBeenCalledTimes(1)

    store.canDraw = false
    await nextTick()
    expect(w.find('.random-chrome__draw').attributes('disabled')).toBeDefined()
  })

  it('projetar e retirar da projeção', async () => {
    const w = mountChrome()
    await w.find('.random-project-fab').trigger('click')
    expect(store.toggleProjection).toHaveBeenCalledTimes(1)

    store.isProjecting = true
    await nextTick()
    await w.find('.random-project-fab').trigger('click')
    expect(store.clearProjection).toHaveBeenCalledTimes(1)
  })

  it('botão de abrir o Sorteio: só fora dele e leva de volta à tela', async () => {
    route.name = 'bible'
    store.isProjecting = true
    const w = mountChrome()
    const open = w.find('.random-chrome__icon-btn')
    expect(open.attributes('aria-label')).toBe(randomLocale.random.openRandom)
    await open.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'utilities-random' })
  })
})

describe('RandomChrome — miniatura', () => {
  it('sem imagem do Palco: usa a cor do diálogo do sorteio', () => {
    const style = mountChrome().find('.random-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(18, 52, 86)')
    expect(style).not.toContain('url(')
  })

  it('com imagem do Palco: imagem + cor do Palco (preto se não houver)', () => {
    resolveBg.mockReturnValue('http://localhost/img/bg.png')
    const style = mountChrome().find('.random-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(16, 16, 16)')
    expect(style).toContain('bg.png')
    wrapper?.unmount()

    stageState.current = { backgroundColor: null, backgroundImage: 'stage:x' } satisfies Stage
    const style2 = mountChrome().find('.random-chrome__preview').attributes('style') ?? ''
    expect(style2).toContain('background-color: rgb(0, 0, 0)')
  })

  it('mostra o sorteado com cor e caixa do diálogo; vazio mostra o marcador apagado', async () => {
    const w = mountChrome()
    const display = () => w.find('.random-chrome__display')
    expect(display().text()).toBe(randomLocale.random.placeholderDisplay)
    expect(display().attributes('style')).toContain('opacity: 0.55')
    expect(display().classes()).toContain('random-chrome__display--names')

    store.config = { ...store.config, textColor: '#ff0000', textTransform: 'uppercase' }
    store.runtime = { ...store.runtime, currentDisplay: '42', mode: 'numbers' }
    await nextTick()
    expect(display().text()).toBe('42')
    expect(display().attributes('style')).toContain('color: rgb(255, 0, 0)')
    expect(display().attributes('style')).toContain('text-transform: uppercase')
    expect(display().attributes('style')).toContain('opacity: 1')
    expect(display().classes()).not.toContain('random-chrome__display--names')
  })

  it('diálogo do sorteio tem prioridade sobre o sub-bloco do Palco; palco é reativo', async () => {
    stageState.current = {
      backgroundColor: '#101010',
      backgroundImage: '',
      random: { textColor: '#00ff00' },
    } satisfies Stage
    store.config = { ...store.config, textColor: '#ff0000' }
    const w = mountChrome()
    expect(w.find('.random-chrome__display').attributes('style')).toContain('color: rgb(255, 0, 0)')

    resolveBg.mockReturnValue('http://localhost/img/novo.png')
    stageState.current = { backgroundColor: '#101010', backgroundImage: 'stage:novo' } satisfies Stage
    stageState.subscribers.forEach((cb) => cb())
    await nextTick()
    expect(w.find('.random-chrome__preview').attributes('style')).toContain('novo.png')
  })

  it('desmontar cancela a inscrição no palco', () => {
    const w = mountChrome()
    expect(stageState.subscribers).toHaveLength(1)
    w.unmount()
    wrapper = null
    expect(stageState.subscribers).toHaveLength(0)
  })
})

describe('RandomChrome — arrastar', () => {
  it('arrasta pela prévia e salva a posição só do Sorteio', async () => {
    const w = mountChrome()
    const preview = w.find('.random-chrome__preview')
    expect(preview.attributes('title')).toBe(randomLocale.random.chromeDragHint)

    preview.element.dispatchEvent(pointer('pointerdown', 650, 520))
    window.dispatchEvent(pointer('pointermove', 450, 320))
    await nextTick()
    expect(w.find('.random-chrome').classes()).toContain('random-chrome--dragging')

    window.dispatchEvent(pointer('pointerup', 450, 320))
    await nextTick()
    const root = w.find('.random-chrome').element as HTMLElement
    expect(root.style.left).toBe('400px')
    expect(root.style.top).toBe('300px')
    expect(loadFloatingPosition(KEY)).toEqual({ x: 400, y: 300 })
    expect(loadFloatingPosition(USER_PREFERENCE_KEYS.clockChromePosition)).toBeNull()
  })

  it('reabre na posição salva e o duplo clique volta ao canto', async () => {
    saveFloatingPosition(KEY, { x: 100, y: 100 })
    const w = mountChrome()
    const root = () => w.find('.random-chrome').element as HTMLElement
    expect(root().style.left).toBe('100px')

    await w.find('.random-chrome__preview').trigger('dblclick')
    expect(root().style.left).toBe('')
    expect(loadFloatingPosition(KEY)).toBeNull()
  })
})

describe('RandomChrome — título da prévia', () => {
  it('mostra "Sorteio" acima da prévia flutuante', () => {
    const w = mountChrome()
    const title = w.find('.floating-preview-title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('Sorteio')
  })
})


it('restaura a projeção recolhida pelo controle existente sem navegar', async () => {
  const minimized = useInAppProjectionMinimized('random')
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
