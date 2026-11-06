// @vitest-environment jsdom
// SettingsView — activeSection da rota, header condicional, goBack, minimizar
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'

const mocks = vi.hoisted(() => ({
  transitionName: { value: 'fade' },
  minimize: vi.fn(async () => {}),
  prepare: vi.fn(),
  options: null as null | {
    describe: () => { title: string; icon: string; summary: string }
    capture: () => unknown
    fallbackRoute: unknown
  },
}))

vi.mock('@design-system/composables', () => ({
  usePageTransition: () => ({ transitionName: mocks.transitionName }),
}))

vi.mock('@shared/composables/useMinimizablePage', () => ({
  useMinimizablePage: (options: typeof mocks.options) => {
    mocks.options = options
    return { minimize: mocks.minimize, prepare: mocks.prepare, takeRestoredState: () => null }
  },
}))

vi.mock('../../components/SettingsTabs.vue', () => ({
  default: { template: '<div class="settings-tabs-stub" />' },
}))

import SettingsView from '../SettingsView.vue'
import { SETTINGS_SECTIONS } from '../../constants/sections'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      nav: { home: 'Início', settings: 'Configurações' },
      minimize: { page: 'Minimizar página' },
      settings: {
        sectionTitle: { appearance: 'Aparência', general: 'Geral', remote: 'Controle Remoto' },
        tabs: { general: 'Geral', remote: 'Controle Remoto' },
      },
    },
  },
})

describe('SettingsView', () => {
  beforeEach(() => {
    mocks.transitionName.value = 'fade'
    mocks.minimize.mockClear()
    mocks.prepare.mockClear()
  })

  function mountAt(routeName: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        ...SETTINGS_SECTIONS.map((s: { id: string; routeName: string }) => ({
          path: `/${s.id}`,
          name: s.routeName,
          component: { template: '<div />' },
        })),
        { path: '/', name: 'home', component: { template: '<div />' } },
      ],
    })
    const wrapper = mount(SettingsView, {
      global: { plugins: [i18n, router] },
    })
    return { wrapper, router, go: async (name: string = routeName) => {
      await router.push({ name })
      await wrapper.vm.$nextTick()
    } }
  }

  it('rota appearance: só voltar e minimizar, sem título, classe --appearance', async () => {
    const { wrapper, go } = mountAt('settings-appearance')
    await go()
    expect(wrapper.find('.settings-view').classes()).toContain('settings-view--appearance')
    const header = wrapper.get('.settings-view__header')
    expect(header.classes()).toContain('settings-view__header--floating')
    expect(header.find('.settings-view__back').exists()).toBe(true)
    expect(header.find('.page-back-stack__minimize').exists()).toBe(true)
    expect(header.find('.settings-view__title').exists()).toBe(false)
    expect(wrapper.find('.settings-tabs-stub').exists()).toBe(true)
  })

  it('rota general: header com back, minimizar e título', async () => {
    const { wrapper, go } = mountAt('settings-general')
    await go()
    const header = wrapper.get('.settings-view__header')
    expect(header.classes()).not.toContain('settings-view__header--floating')
    expect(header.find('.settings-view__title').text()).toBe('Geral')
    expect(header.find('.page-back-stack .settings-view__back').exists()).toBe(true)
    expect(header.find('.page-back-stack__minimize').attributes('title')).toBe('Minimizar página')
  })

  it('goBack: navega pra home', async () => {
    const { wrapper, router, go } = mountAt('settings-general')
    await go()
    await wrapper.find('.settings-view__back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('– minimiza a aba atual; na barra aparece o nome do menu', async () => {
    const { wrapper, go } = mountAt('settings-remote')
    await go()
    const minimizeButton = wrapper.get('.page-back-stack__minimize')
    await minimizeButton.trigger('pointerenter')
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    await minimizeButton.trigger('click')
    expect(mocks.minimize).toHaveBeenCalledTimes(1)
    expect(mocks.options!.describe()).toEqual({
      title: 'Controle Remoto',
      icon: 'ti-settings',
      summary: 'Configurações',
    })
    await go('settings-general')
    expect(mocks.options!.describe().title).toBe('Geral')
    expect(mocks.options!.capture()).toBeNull()
    expect(mocks.options!.fallbackRoute).toEqual({ name: 'home' })
  })
})
