// @vitest-environment jsdom
/**
 * BibleChrome — prévia + play/stop flutuantes da Bíblia: visível na rota da
 * Bíblia e, fora dela, só enquanto projeta; arrastável com posição salva.
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

import bibleLocale from '../../locales/pt-BR'
import type { BibleSelection } from '../../types/bible'
import BibleChrome from '../BibleChrome.vue'

const route = reactive<{ meta: Record<string, unknown> }>({ meta: { navKey: 'bible' } })

vi.mock('vue-router', () => ({
  useRoute: () => route,
}))

const readSettings = vi.hoisted(() =>
  vi.fn(() => ({ backgroundColor: '#101010' as string | null, backgroundImage: 'stage:x' })),
)
const resolveBg = vi.hoisted(() => vi.fn((): string | null => 'http://localhost/img/bg.png'))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: readSettings,
}))
vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: resolveBg,
}))

function emptySelection(): BibleSelection {
  return {
    versionId: null,
    bookId: null,
    versionAbbreviation: '',
    bookName: '',
    chapter: null,
    verses: [],
    scripturalReference: '',
    text: '',
  }
}

const store = reactive({
  isProjecting: false,
  projection: emptySelection(),
  toggleProjection: vi.fn().mockResolvedValue(undefined),
  clearProjectionWindow: vi.fn(),
})

vi.mock('../../stores/useBibleStore', () => ({
  useBibleStore: () => store,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': bibleLocale },
})

const KEY = USER_PREFERENCE_KEYS.bibleChromePosition
const RECT = { left: 600, top: 500, width: 400, height: 150 }

let wrapper: VueWrapper | null = null

function mountChrome() {
  wrapper = mount(BibleChrome, { global: { plugins: [i18n] } })
  return wrapper
}

function selectVerse() {
  store.projection = {
    ...emptySelection(),
    versionId: 1,
    bookId: 1,
    verses: [2],
    scripturalReference: 'Gênesis 6:2 (ARA)',
    text: 'vendo os filhos de Deus que as filhas dos homens eram formosas',
  }
}

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

beforeEach(() => {
  localStorage.clear()
  route.meta = { navKey: 'bible' }
  store.isProjecting = false
  store.projection = emptySelection()
  store.toggleProjection.mockClear()
  store.clearProjectionWindow.mockClear()
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

describe('BibleChrome — visibilidade', () => {
  it('na Bíblia sem versículo: cartão com aviso e play desabilitado', () => {
    const w = mountChrome()
    expect(w.find('.bible-chrome__preview-empty').text()).toBe(bibleLocale.bible.noSelection)
    expect(w.find('.bible-project-fab__btn').attributes('disabled')).toBeDefined()
  })

  it('na Bíblia com versículo: prévia com trecho e referência', () => {
    selectVerse()
    const w = mountChrome()
    expect(w.find('.bible-chrome__preview-text').text()).toContain('vendo os filhos de Deus')
    expect(w.find('.bible-chrome__preview-ref').text()).toBe('Gênesis 6:2 (ARA)')
    expect(w.find('.bible-project-fab__btn').attributes('disabled')).toBeUndefined()
  })

  it('fora da Bíblia: some quando não projeta e fica flutuando enquanto projeta', async () => {
    selectVerse()
    route.meta = { navKey: 'liturgy' }
    const w = mountChrome()
    expect(w.find('.bible-chrome').exists()).toBe(false)

    store.isProjecting = true
    await nextTick()
    expect(w.find('.bible-chrome__preview-text').exists()).toBe(true)
    expect(w.find('.bible-project-fab__btn--active').exists()).toBe(true)

    store.isProjecting = false
    await nextTick()
    expect(w.find('.bible-chrome').exists()).toBe(false)
  })
})

describe('BibleChrome — ações', () => {
  it('play projeta e stop retira da projeção', async () => {
    selectVerse()
    const w = mountChrome()
    await w.find('.bible-project-fab__btn').trigger('click')
    expect(store.toggleProjection).toHaveBeenCalledTimes(1)

    store.isProjecting = true
    await nextTick()
    await w.find('.bible-project-fab__btn').trigger('click')
    expect(store.clearProjectionWindow).toHaveBeenCalledTimes(1)
  })
})

describe('BibleChrome — miniatura', () => {
  it('usa cor e imagem do palco da Bíblia', () => {
    selectVerse()
    const style = mountChrome().find('.bible-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(16, 16, 16)')
    expect(style).toContain('bg.png')
  })

  it('sem cor nem imagem no palco: fundo preto e sem url()', () => {
    readSettings.mockReturnValueOnce({ backgroundColor: null, backgroundImage: 'stage:x' })
    resolveBg.mockReturnValueOnce(null)
    const style = mountChrome().find('.bible-chrome__preview').attributes('style') ?? ''
    expect(style).toContain('background-color: rgb(0, 0, 0)')
    expect(style).not.toContain('url(')
  })
})

describe('BibleChrome — arrastar', () => {
  it('arrasta pela prévia e salva a posição só da Bíblia', async () => {
    selectVerse()
    const w = mountChrome()
    const preview = w.find('.bible-chrome__preview')
    expect(preview.attributes('title')).toBe(bibleLocale.bible.chromeDragHint)

    preview.element.dispatchEvent(pointer('pointerdown', 650, 520))
    window.dispatchEvent(pointer('pointermove', 450, 320))
    await nextTick()
    expect(w.find('.bible-chrome').classes()).toContain('bible-chrome--dragging')

    window.dispatchEvent(pointer('pointerup', 450, 320))
    await nextTick()
    const root = w.find('.bible-chrome').element as HTMLElement
    expect(root.style.left).toBe('400px')
    expect(root.style.top).toBe('300px')
    expect(loadFloatingPosition(KEY)).toEqual({ x: 400, y: 300 })
    expect(loadFloatingPosition(USER_PREFERENCE_KEYS.mediaChromePosition)).toBeNull()
  })

  it('reabre na posição salva e o duplo clique volta ao canto', async () => {
    saveFloatingPosition(KEY, { x: 100, y: 100 })
    const w = mountChrome()
    const root = () => w.find('.bible-chrome').element as HTMLElement
    expect(root().style.left).toBe('100px')

    await w.find('.bible-chrome__preview').trigger('dblclick')
    expect(root().style.left).toBe('')
    expect(loadFloatingPosition(KEY)).toBeNull()
  })
})
