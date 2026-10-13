// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import TimerProjectFab from '../components/TimerProjectFab.vue'

describe('TimerProjectFab', () => {
  it('parado: ícone de projetar e clique emite project', async () => {
    const wrapper = mount(TimerProjectFab, { props: { projecting: false } })
    expect(wrapper.find('i').classes()).toContain('ti-presentation')
    expect(wrapper.attributes('aria-label')).toBe('timer.project')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('project')).toHaveLength(1)
    expect(wrapper.emitted('clear')).toBeUndefined()
  })

  it('projetando: ícone stop, aria-label de limpar e clique emite clear', async () => {
    const wrapper = mount(TimerProjectFab, { props: { projecting: true } })
    expect(wrapper.find('i').classes()).toContain('ti-player-stop')
    expect(wrapper.attributes('aria-label')).toBe('timer.clearProjection')
    expect(wrapper.classes()).toContain('timer-project-fab--active')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('project')).toBeUndefined()
  })
})
