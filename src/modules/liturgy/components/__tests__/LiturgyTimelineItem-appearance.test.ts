// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createI18n } from 'vue-i18n'

import liturgyLocale from '../../locales/pt-BR'

vi.mock('@shared/services/desktop-bridge', () => ({
  isElectronShell: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}))

vi.mock('../../composables/useExternalPlayerChoices', async () => {
  const { ref: vueRef } = await import('vue')
  return {
    useExternalPlayerChoices: () => ({
      globalPlayer: vueRef('associated'),
      playerOptions: vueRef([]),
      loadPlayerChoices: vi.fn(async () => {}),
      selectedPlayerId: vi.fn((id?: string) => id ?? 'associated'),
    }),
  }
})

vi.mock('@shared/components/MusicTrackActions.vue', () => ({
  default: { name: 'MusicTrackActions', template: '<div />' },
}))

vi.mock('@shared/components/IndependentProjectionButton.vue', () => ({
  default: {
    name: 'IndependentProjectionButton',
    props: { moduleId: String, beforeProject: Function, obs: Boolean, claimed: Boolean, compact: Boolean },
    template: '<button data-testid="independent-stub" @click="beforeProject()" />',
  },
}))

const annotation = vi.hoisted(() => ({
  prepareAnnotationIndependent: vi.fn(() => true),
  refreshAnnotationProjection: vi.fn(),
}))
const projectingItemId = ref<string | null>(null)
const independentItemId = ref<string | null>(null)

vi.mock('../../services/annotation-projection', () => ({
  ANNOTATION_PROJECTION_MODULE: 'annotation',
  prepareAnnotationIndependent: annotation.prepareAnnotationIndependent,
  refreshAnnotationProjection: annotation.refreshAnnotationProjection,
  useAnnotationProjection: () => ({ projectingItemId, independentItemId }),
}))

import LiturgyTimelineItem from '../LiturgyTimelineItem.vue'
import { normalizeLiturgyAppearance } from '../../services/liturgy-appearance'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

const category = {
  id: 'cat-1',
  type: 'category',
  name: 'Escola Sabatina',
  subtitle: 'Momento escola sabatina',
  durationMs: 0,
  accentColor: '#FFD600',
  done: false,
  startTime: '09:15',
  endTime: '10:15',
}
const music = {
  id: 'm-1',
  type: 'music',
  name: 'Digno',
  subtitle: 'Adoradores 5',
  durationMs: 0,
  accentColor: '#00E676',
  done: false,
}

function mountItem(item: Record<string, unknown>, appearance?: unknown) {
  return mount(LiturgyTimelineItem, {
    props: {
      item,
      index: 0,
      selected: false,
      startLabel: '10:00',
      durationLabel: '0:00',
      ...(appearance === undefined ? {} : { appearance: normalizeLiturgyAppearance(appearance) }),
    },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyTimelineItem — aparência personalizada', () => {
  beforeEach(() => {
    projectingItemId.value = null
    independentItemId.value = null
  })

  it('sem personalização, a categoria fica como sempre (horário, subtítulo, esquerda)', () => {
    const wrapper = mountItem(category)
    expect(wrapper.find('.liturgy-item__type--range').exists()).toBe(true)
    expect(wrapper.text()).toContain('Momento escola sabatina')
    expect(wrapper.classes()).not.toContain('liturgy-item--cat-center')
  })

  it('categoria: centraliza, aumenta, maiúsculas, sem negrito, cores e fundo próprios', () => {
    const wrapper = mountItem(category, {
      category: {
        titleAlign: 'center',
        titleSize: 'xl',
        uppercase: true,
        bold: false,
        titleColor: '#ffd600',
        background: '#1e3a5f',
      },
    })
    const classes = wrapper.classes()
    expect(classes).toEqual(expect.arrayContaining([
      'liturgy-item--cat-center',
      'liturgy-item--cat-upper',
      'liturgy-item--cat-light',
      'liturgy-item--cat-bg',
    ]))
    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('--liturgy-category-bg: #1e3a5f')
    expect(style).toContain('--liturgy-category-title-color: #ffd600')
    expect(style).toContain('--liturgy-category-title-size: 1.45rem')
  })

  it('categoria: esconder horário e subtítulo', () => {
    const wrapper = mountItem(category, { category: { showTime: false, showSubtitle: false } })
    expect(wrapper.find('.liturgy-item__type--range').exists()).toBe(false)
    // Sem horário, a categoria não mostra o rótulo de tipo no lugar.
    expect(wrapper.find('.liturgy-item__type').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Momento escola sabatina')
  })

  it('cor por tipo: o ícone do item usa a cor escolhida para o tipo', () => {
    const wrapper = mountItem(music, { typeColors: { music: '#ff0000' } })
    expect(wrapper.get('.liturgy-item__icon').attributes('style')).toContain('rgb(255, 0, 0)')
    // Sem escolha, a cor do item.
    const plain = mountItem(music)
    expect(plain.get('.liturgy-item__icon').attributes('style')).toContain('rgb(0, 230, 118)')
  })

  it('a personalização da categoria não mexe nos itens comuns', () => {
    const wrapper = mountItem(music, { category: { titleAlign: 'center', showSubtitle: false } })
    expect(wrapper.classes()).not.toContain('liturgy-item--cat-center')
    expect(wrapper.text()).toContain('Adoradores 5')
  })
})
