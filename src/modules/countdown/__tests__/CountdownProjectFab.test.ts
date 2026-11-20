// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import CountdownProjectFab from '../components/CountdownProjectFab.vue'

describe('CountdownProjectFab', () => {
  it('parado: ícone de projetar e clique emite project', async () => {
    const wrapper = mount(CountdownProjectFab, { props: { projecting: false } })
    expect(wrapper.find('i').classes()).toContain('ti-presentation')
    expect(wrapper.attributes('aria-label')).toBe('countdown.project')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('project')).toHaveLength(1)
    expect(wrapper.emitted('clear')).toBeUndefined()
  })

  it('projetando: ícone stop, aria-label de limpar e clique emite clear', async () => {
    const wrapper = mount(CountdownProjectFab, { props: { projecting: true } })
    expect(wrapper.find('i').classes()).toContain('ti-player-stop')
    expect(wrapper.attributes('aria-label')).toBe('countdown.clearProjection')
    expect(wrapper.classes()).toContain('countdown-project-fab--active')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('project')).toBeUndefined()
  })
})
