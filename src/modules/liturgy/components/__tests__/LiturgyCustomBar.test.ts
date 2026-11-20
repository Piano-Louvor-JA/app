// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import LiturgyCustomBar from '../LiturgyCustomBar.vue'
import type { CustomLiturgy } from '../../types/liturgy'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': {} } })

function lit(name: string, id = `l-${name}`): CustomLiturgy {
  return { id, name, items: [], notes: '', startTime: null, endTime: null }
}

function mountBar(props: Record<string, unknown> = {}) {
  return mount(LiturgyCustomBar, {
    props: {
      liturgies: [lit('A'), lit('B')],
      selectedIndex: 0,
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyCustomBar', () => {
  it('lista vazia: mostra mensagem de vazio', () => {
    const w = mountBar({ liturgies: [] })
    expect(w.find('.liturgy-custom-bar__empty').exists()).toBe(true)
    expect(w.findAll('.liturgy-custom-bar__chip').length).toBe(0)
    w.unmount()
  })

  it('renderiza chips com nome e marca o ativo', () => {
    const w = mountBar()
    const chips = w.findAll('.liturgy-custom-bar__chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].classes()).toContain('liturgy-custom-bar__chip--active')
    expect(chips[1].classes()).not.toContain('liturgy-custom-bar__chip--active')
    expect(chips[1].text()).toContain('B')
    w.unmount()
  })

  it('click no chip emite select com índice', async () => {
    const w = mountBar()
    await w.findAll('.liturgy-custom-bar__chip')[1].trigger('click')
    expect(w.emitted('select')).toEqual([[1]])
    w.unmount()
  })

  it('click no remove emite remove com stop propagation', async () => {
    const w = mountBar()
    await w.findAll('.liturgy-custom-bar__remove')[0].trigger('click')
    expect(w.emitted('remove')).toEqual([[0]])
    // select NÃO disparou (stop propagation)
    expect(w.emitted('select')).toBeFalsy()
    w.unmount()
  })

  it('keydown.enter no remove emite remove', async () => {
    const w = mountBar()
    await w.findAll('.liturgy-custom-bar__remove')[1].trigger('keydown.enter')
    expect(w.emitted('remove')).toEqual([[1]])
    w.unmount()
  })

  it('botão novo emite create', async () => {
    const w = mountBar()
    await w.find('.liturgy-custom-bar__new').trigger('click')
    expect(w.emitted('create')).toBeTruthy()
    w.unmount()
  })

  it('wheel horizontal rola o container', async () => {
    const w = mountBar()
    const bar = w.find('.liturgy-custom-bar').element as HTMLElement
    Object.defineProperty(bar, 'scrollLeft', { value: 0, writable: true })
    await w.find('.liturgy-custom-bar').trigger('wheel', { deltaY: 60 })
    expect(bar.scrollLeft).toBe(60)
    // wheel vertical (deltaY 0) não rola
    await w.find('.liturgy-custom-bar').trigger('wheel', { deltaY: 0 })
    expect(bar.scrollLeft).toBe(60)
    w.unmount()
  })
})
