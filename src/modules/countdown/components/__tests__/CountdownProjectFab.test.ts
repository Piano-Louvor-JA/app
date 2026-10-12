// @vitest-environment jsdom
// CountdownProjectFab — projecting toggle, emits, classes
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import CountdownProjectFab from '../CountdownProjectFab.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      countdown: {
        project: 'Projetar',
        clearProjection: 'Limpar projeção',
      },
    },
  },
})

function createWrapper(props: { projecting: boolean }) {
  return mount(CountdownProjectFab, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('CountdownProjectFab', () => {
  it('idle: clique emite project', async () => {
    const wrapper = createWrapper({ projecting: false })
    await wrapper.find('.countdown-project-fab').trigger('click')
    expect(wrapper.emitted('project')).toBeTruthy()
    expect(wrapper.emitted('clear')).toBeFalsy()
  })

  it('projecting: clique emite clear', async () => {
    const wrapper = createWrapper({ projecting: true })
    await wrapper.find('.countdown-project-fab').trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
    expect(wrapper.emitted('project')).toBeFalsy()
  })

  it('projecting: classe --active e ícone stop', () => {
    const wrapper = createWrapper({ projecting: true })
    expect(wrapper.find('.countdown-project-fab').classes()).toContain('countdown-project-fab--active')
    expect(wrapper.find('.ti-player-stop').exists()).toBe(true)
  })

  it('idle: ícone presentation', () => {
    const wrapper = createWrapper({ projecting: false })
    expect(wrapper.find('.ti-presentation').exists()).toBe(true)
  })

  it('aria-label muda conforme projecting', () => {
    const idle = createWrapper({ projecting: false })
    expect(idle.find('.countdown-project-fab').attributes('aria-label')).toBe('Projetar')
    const active = createWrapper({ projecting: true })
    expect(active.find('.countdown-project-fab').attributes('aria-label')).toBe('Limpar projeção')
  })
})
