// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ConnectionsView from '../ConnectionsView.vue'
import ptBR from '../../locales/pt-BR'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })

async function mountHub() {
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/connections', name: 'settings-connections', component: ConnectionsView },
      { path: '/settings/transmission', name: 'settings-transmission', component: stub },
      { path: '/settings/remote', name: 'settings-remote', component: stub },
      { path: '/settings/palco', name: 'settings-palco', component: stub },
    ],
  })
  await router.push('/settings/connections')
  return { router, wrapper: mount(ConnectionsView, { global: { plugins: [i18n, router] } }) }
}

it('mostra os 3 módulos: Transmissão, Controle Remoto e Palco', async () => {
  const { wrapper } = await mountHub()
  const text = wrapper.text()
  for (const title of ['Transmissão', 'Controle Remoto', 'Palco']) expect(text).toContain(title)
  expect(text).toContain('TVs com o app Palco')
  expect(wrapper.findAll('[data-testid^="connections-card-"]')).toHaveLength(3)
})

it.each([
  ['transmission', 'settings-transmission'],
  ['remote', 'settings-remote'],
  ['palco', 'settings-palco'],
])('o card %s abre o módulo', async (key, route) => {
  const { wrapper, router } = await mountHub()
  await wrapper.get(`[data-testid="connections-card-${key}"]`).trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe(route)
})
