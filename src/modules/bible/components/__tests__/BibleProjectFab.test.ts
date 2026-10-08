// @vitest-environment jsdom
// BibleProjectFab — projecting/disabled, emits, classes
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import BibleProjectFab from '../BibleProjectFab.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      bible: {
        project: 'Projetar',
        clearProjection: 'Limpar projeção',
      },
    },
  },
})

function createWrapper(props: { disabled?: boolean; projecting?: boolean } = {}) {
  return mount(BibleProjectFab, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('BibleProjectFab', () => {
  it('idle: clique emite project', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-project-fab__btn').trigger('click')
    expect(wrapper.emitted('project')).toBeTruthy()
    expect(wrapper.emitted('clear')).toBeFalsy()
  })

  it('projecting: clique emite clear', async () => {
    const wrapper = createWrapper({ projecting: true })
    await wrapper.find('.bible-project-fab__btn').trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
    expect(wrapper.emitted('project')).toBeFalsy()
  })

  it('disabled sem projeção: botão desabilitado', () => {
    const wrapper = createWrapper({ disabled: true })
    expect((wrapper.find('.bible-project-fab__btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disabled com projeção: botão clicável (para parar)', async () => {
    const wrapper = createWrapper({ disabled: true, projecting: true })
    expect((wrapper.find('.bible-project-fab__btn').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.find('.bible-project-fab__btn').trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
  })

  it('projecting: classe --active e ícone stop', () => {
    const wrapper = createWrapper({ projecting: true })
    expect(wrapper.find('.bible-project-fab__btn').classes()).toContain('bible-project-fab__btn--active')
    expect(wrapper.find('.ti-player-stop').exists()).toBe(true)
  })

  it('idle: ícone play', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.ti-player-play').exists()).toBe(true)
  })

  it('aria-label conforme projecting', () => {
    const idle = createWrapper()
    expect(idle.find('.bible-project-fab__btn').attributes('aria-label')).toBe('Projetar')
    const active = createWrapper({ projecting: true })
    expect(active.find('.bible-project-fab__btn').attributes('aria-label')).toBe('Limpar projeção')
  })
})
