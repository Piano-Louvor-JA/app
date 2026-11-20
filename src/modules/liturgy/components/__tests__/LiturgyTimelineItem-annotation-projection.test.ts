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

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

function annotationItem(overrides = {}) {
  return {
    id: 'note-1',
    type: 'annotation',
    name: 'Almoço na igreja',
    subtitle: 'Sábado às 12h',
    durationMs: 0,
    accentColor: '#ff9800',
    done: false,
    ...overrides,
  }
}

function mountItem(props: Record<string, unknown> = {}) {
  return mount(LiturgyTimelineItem, {
    props: {
      item: annotationItem(),
      index: 2,
      selected: false,
      startLabel: '10:00',
      durationLabel: '0:00',
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyTimelineItem — projeção da anotação', () => {
  beforeEach(() => {
    projectingItemId.value = null
    independentItemId.value = null
    annotation.prepareAnnotationIndependent.mockClear()
    annotation.refreshAnnotationProjection.mockClear()
  })

  it('mostra projetar e projeção independente; o play emite playScreens', async () => {
    const wrapper = mountItem({ selected: true })
    const project = wrapper.get('[data-testid="liturgy-annotation-project"]')
    expect(project.attributes('title')).toBe('Projetar anotação')
    expect(project.attributes('aria-pressed')).toBe('false')
    expect(project.find('.ti').classes()).toContain('ti-arrow-up-right')
    expect(wrapper.find('.liturgy-item__actions--visible').exists()).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.attributes('title') === 'Abrir controle (popup)')).toBe(false)

    const independent = wrapper.getComponent({ name: 'IndependentProjectionButton' })
    expect(independent.props()).toMatchObject({ moduleId: 'annotation', obs: false, compact: true, claimed: false })

    await project.trigger('click')
    expect(wrapper.emitted('playScreens')).toHaveLength(1)
  })

  it('a independente publica esta anotação antes de abrir', async () => {
    const wrapper = mountItem()
    await wrapper.get('[data-testid="independent-stub"]').trigger('click')
    expect(annotation.prepareAnnotationIndependent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-1', name: 'Almoço na igreja' }),
    )
  })

  it('anotação no ar: botão vira parar e continua ativo mesmo concluída', async () => {
    projectingItemId.value = 'note-1'
    independentItemId.value = 'note-1'
    const wrapper = mountItem({ item: annotationItem({ done: true }) })
    const project = wrapper.get('[data-testid="liturgy-annotation-project"]')
    expect(project.attributes('title')).toBe('Parar projeção da anotação')
    expect(project.attributes('aria-pressed')).toBe('true')
    expect(project.classes()).toContain('liturgy-item__action--site-projecting')
    expect(project.find('.ti').classes()).toContain('ti-player-stop')
    expect(project.attributes('disabled')).toBeUndefined()
    expect(wrapper.getComponent({ name: 'IndependentProjectionButton' }).props('claimed')).toBe(true)
  })

  it('concluída e fora do ar: projetar fica desabilitado', () => {
    projectingItemId.value = 'outra'
    const wrapper = mountItem({ item: annotationItem({ done: true }) })
    expect(wrapper.get('[data-testid="liturgy-annotation-project"]').attributes('disabled')).toBeDefined()
  })

  it('nome da anotação no card usa a cor escolhida; concluída ou outro tipo não', () => {
    const name = (item: Record<string, unknown>) =>
      mountItem({ item: annotationItem(item) }).get('.liturgy-item__name').attributes('style') ?? ''
    expect(name({ titleColor: '#42A5F5' })).toContain('color: rgb(66, 165, 245)')
    expect(name({})).not.toContain('color')
    expect(name({ titleColor: '#42a5f5', done: true })).not.toContain('color')
    expect(name({ type: 'site', url: 'https://example.com', titleColor: '#42a5f5' })).not.toContain('color')
  })

  it('editar a anotação atualiza a projeção; outros tipos não', async () => {
    const wrapper = mountItem()
    await wrapper.setProps({ item: annotationItem({ notesHtml: '<b>Sábado</b>' }) })
    await flushPromises()
    expect(annotation.refreshAnnotationProjection).toHaveBeenCalledWith(
      expect.objectContaining({ notesHtml: '<b>Sábado</b>' }),
    )
    annotation.refreshAnnotationProjection.mockClear()
    await wrapper.setProps({ item: annotationItem({ notesHtml: '<b>Sábado</b>', titleColor: '#42a5f5' }) })
    await flushPromises()
    expect(annotation.refreshAnnotationProjection).toHaveBeenCalledWith(
      expect.objectContaining({ titleColor: '#42a5f5' }),
    )

    annotation.refreshAnnotationProjection.mockClear()
    const site = mountItem({ item: annotationItem({ type: 'site', url: 'https://example.com' }) })
    expect(site.find('[data-testid="liturgy-annotation-project"]').exists()).toBe(false)
    await site.setProps({ item: annotationItem({ type: 'site', name: 'Outro', url: 'https://example.com' }) })
    await flushPromises()
    expect(annotation.refreshAnnotationProjection).not.toHaveBeenCalled()
  })
})
