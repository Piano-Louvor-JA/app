// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import BibleProjectFab from '../components/BibleProjectFab.vue'

describe('BibleProjectFab', () => {
  it('parado: botão habilitado, ícone play, clique emite project', async () => {
    const wrapper = mount(BibleProjectFab)
    const btn = wrapper.find('.bible-project-fab__btn')
    expect(btn.attributes('disabled')).toBeUndefined()
    expect(btn.find('i').classes()).toContain('ti-player-play')
    await btn.trigger('click')
    expect(wrapper.emitted('project')).toHaveLength(1)
    expect(wrapper.emitted('clear')).toBeUndefined()
  })

  it('projetando: ícone stop, clique emite clear (disabled não se aplica)', async () => {
    const wrapper = mount(BibleProjectFab, { props: { projecting: true, disabled: true } })
    const btn = wrapper.find('.bible-project-fab__btn')
    expect(btn.find('i').classes()).toContain('ti-player-stop')
    expect(btn.classes()).toContain('bible-project-fab__btn--active')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(wrapper.emitted('clear')).toBeDefined()
    expect(wrapper.emitted('clear')?.length).toBe(1)
  })

  it('disabled (parado): clique não emite nada', async () => {
    const wrapper = mount(BibleProjectFab, { props: { disabled: true } })
    const btn = wrapper.find('.bible-project-fab__btn')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(wrapper.emitted('project')).toBeUndefined()
    expect(wrapper.emitted('clear')).toBeUndefined()
  })

  it('projetando sem disabled: clique emite clear pelo mesmo caminho', async () => {
    const wrapper = mount(BibleProjectFab, { props: { projecting: true } })
    await wrapper.find('.bible-project-fab__btn').trigger('click')
    expect(wrapper.emitted('clear')?.length).toBe(1)
  })

  it('parado habilitado: caminho do project', async () => {
    const wrapper = mount(BibleProjectFab, { props: { disabled: false } })
    await wrapper.find('.bible-project-fab__btn').trigger('click')
    expect(wrapper.emitted('project')?.length).toBe(1)
  })
})
