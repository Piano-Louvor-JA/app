// @vitest-environment jsdom
// SettingsView — activeSection da rota, header condicional, goBack
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'

const mocks = vi.hoisted(() => ({
  transitionName: { value: 'fade' },
}))

vi.mock('@design-system/composables', () => ({
  usePageTransition: () => ({ transitionName: mocks.transitionName }),
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
      nav: { home: 'Início' },
      settings: { sectionTitle: { appearance: 'Aparência', general: 'Geral' } },
    },
  },
})

describe('SettingsView', () => {
  beforeEach(() => {
    mocks.transitionName.value = 'fade'
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
    return { wrapper, router, go: async (name: string) => {
      await router.push({ name })
      await wrapper.vm.$nextTick()
    } }
  }

  it('rota appearance: sem header, classe --appearance', async () => {
    const { wrapper, go } = mountAt('settings-appearance')
    await go('settings-appearance')
    expect(wrapper.find('.settings-view').classes()).toContain('settings-view--appearance')
    expect(wrapper.find('.settings-view__header').exists()).toBe(false)
    expect(wrapper.find('.settings-tabs-stub').exists()).toBe(true)
  })

  it('rota general: header com back e título', async () => {
    const { wrapper, go } = mountAt('settings-general')
    await go('settings-general')
    expect(wrapper.find('.settings-view__header').exists()).toBe(true)
    expect(wrapper.find('.settings-view__title').exists()).toBe(true)
    expect(wrapper.find('.settings-view__back').exists()).toBe(true)
  })

  it('goBack: navega pra home', async () => {
    const { wrapper, router, go } = mountAt('settings-general')
    await go('settings-general')
    await wrapper.find('.settings-view__back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
  })
})
