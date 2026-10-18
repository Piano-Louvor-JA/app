// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from '../AppSidebar.vue'
import navigation from '@locales/navigation'
import { mainNavRoutes } from '@shared/constants/navigation'

async function setup(activeKey = 'bible', path = '/bible') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(path)
  await router.isReady()
  return mount(AppSidebar, {
    props: { activeKey, items: mainNavRoutes.map(item => ({ ...item, label: item.key })) },
    global: { plugins: [router, createI18n({ legacy: false, locale: 'pt-BR', messages: navigation })] },
  })
}
beforeEach(() => localStorage.clear())
describe('AppSidebar', () => {
  it('agrupa rotas reais e mantém navegação e seleção acessíveis', async () => {
    const wrapper = await setup()
    expect(wrapper.findAll('h2').map(item => item.text())).toEqual(['Preparar e conduzir', 'Biblioteca', 'Apoio ao culto'])
    expect(wrapper.find('[aria-current="page"]').attributes('aria-label')).toBe('bible')
    await wrapper.find('[aria-label="liturgy"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['liturgy']])
    wrapper.unmount()
  })
  it('guarda o modo recolhido e restaura após remontar', async () => {
    const first = await setup()
    await first.find('[aria-label="Recolher menu"]').trigger('click')
    first.unmount()
    const restored = await setup()
    expect(restored.classes()).toContain('workspace-sidebar--collapsed')
    expect(restored.find('[aria-label="Expandir menu"]').attributes('aria-expanded')).toBe('false')
    expect(restored.find('[aria-label="bible"]').attributes('title')).toBe('bible')
    await restored.find('[aria-label="Expandir menu"]').trigger('click')
    expect(restored.findAll('h2')).toHaveLength(3)
    restored.unmount()
  })
  it('mostra atalhos diretos e o utilitário atual', async () => {
    const wrapper = await setup('utilities', '/utilities/clock')
    expect(wrapper.findAll('a')).toHaveLength(4)
    expect(wrapper.find('a[aria-current="page"]').attributes('href')).toBe('/utilities/clock')
    wrapper.unmount()
  })
})
