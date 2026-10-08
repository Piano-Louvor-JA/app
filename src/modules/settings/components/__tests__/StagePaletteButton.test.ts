// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('../StageCustomizationDialog.vue', () => ({
  default: {
    name: 'StageCustomizationDialog',
    props: ['open', 'scope'],
    emits: ['close'],
    template: '<div data-stub="stage-custom-dialog" />',
  },
}))

import StagePaletteButton from '../StagePaletteButton.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': {} } })

describe('StagePaletteButton', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renderiza FAB e dialog fechado', () => {
    const w = mount(StagePaletteButton, {
      props: { scope: 'bible' },
      global: { plugins: [i18n] },
    })
    expect(w.find('.stage-palette-fab').exists()).toBe(true)
    const dlg = w.findComponent({ name: 'StageCustomizationDialog' })
    expect(dlg.props('open')).toBe(false)
    expect(dlg.props('scope')).toBe('bible')
    w.unmount()
  })

  it('click no FAB abre dialog (28)', async () => {
    const w = mount(StagePaletteButton, {
      props: { scope: 'clock' },
      global: { plugins: [i18n] },
    })
    await w.find('.stage-palette-fab').trigger('click')
    const dlg = w.findComponent({ name: 'StageCustomizationDialog' })
    expect(dlg.props('open')).toBe(true)
    w.unmount()
  })

  it('close do dialog fecha (39)', async () => {
    const w = mount(StagePaletteButton, {
      props: { scope: 'random' },
      global: { plugins: [i18n] },
    })
    await w.find('.stage-palette-fab').trigger('click')
    const dlg = w.findComponent({ name: 'StageCustomizationDialog' })
    dlg.vm.$emit('close')
    await w.vm.$nextTick()
    expect(dlg.props('open')).toBe(false)
    w.unmount()
  })
})
