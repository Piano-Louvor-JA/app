// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'

vi.mock('@design-system/index', async () => {
  const { h } = await import('vue')
  return {
    GlassCard: { name: 'GlassCard', inheritAttrs: false, props: ['padding'], setup(_: unknown, { attrs, slots }: any) { return () => h('div', { class: 'glass-stub', ...attrs }, slots.default?.()) } },
  }
})

import UtilitiesHubCard from '../UtilitiesHubCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': { clock: { hub: { timer: 'Temporizador' } }, common: { comingSoon: 'Em breve' } } },
})

function createWrapper(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/utilities/temporizador', name: 'utilities-temporizador', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(UtilitiesHubCard, {
    props: {
      titleKey: 'clock.hub.timer',
      descriptionKey: 'clock.hub.timer',
      icon: 'ti-clock',
      to: '/utilities/temporizador',
      available: true,
      ...props,
    },
    global: { plugins: [router, i18n] },
  })
  return { wrapper, router }
}

describe('UtilitiesHubCard.vue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza título, ícone e descrição', () => {
    const { wrapper } = createWrapper()
    expect(wrapper.find('.utilities-hub-card__title').text()).toBe('Temporizador')
    expect(wrapper.find('.ti-clock').exists()).toBe(true)
  })

  it('click: navega para rota', async () => {
    const { wrapper, router } = createWrapper()
    const el = wrapper.find('.utilities-hub-card')
    await el.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/utilities/temporizador')
  })

  it('keydown Enter: navega', async () => {
    const { wrapper, router } = createWrapper()
    await wrapper.find('.utilities-hub-card').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/utilities/temporizador')
  })

  it('keydown Space: navega', async () => {
    const { wrapper, router } = createWrapper()
    await wrapper.find('.utilities-hub-card').trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/utilities/temporizador')
  })

  it('indisponível: badge Em breve e sem navegação', async () => {
    const { wrapper, router } = createWrapper({ available: false })
    expect(wrapper.find('.utilities-hub-card__badge').text()).toBe('Em breve')
    await wrapper.find('.utilities-hub-card').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('sem to: click não navega', async () => {
    const { wrapper, router } = createWrapper({ to: null })
    await wrapper.find('.utilities-hub-card').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
