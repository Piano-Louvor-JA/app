// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'
import TransmissionOverlayStyle from '../TransmissionOverlayStyle.vue'
import { DEFAULT_OVERLAY_STYLE, type OverlayStyle } from '../../types/transmission'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })

function mountStyle(modelValue: OverlayStyle = { ...DEFAULT_OVERLAY_STYLE }) {
  return mount(TransmissionOverlayStyle, { props: { modelValue, name: 'Fonte 2' }, global: { plugins: [i18n] } })
}
const last = (wrapper: ReturnType<typeof mountStyle>) => wrapper.emitted('update:modelValue')!.at(-1)![0] as OverlayStyle

it('previews the default lower third with the sample lyric and reference', () => {
  const wrapper = mountStyle()
  const preview = wrapper.get('.transmission-style__preview')
  expect(preview.attributes()).toMatchObject({ 'data-layout': 'lower-third', 'data-theme': 'dark', 'data-position': 'bottom' })
  expect(preview.attributes('style')).toContain('--preview-scale: 1')
  expect(preview.attributes('style')).toContain('--preview-accent: #FFD54A')
  expect(preview.text()).toContain('Grandioso és Tu, Senhor meu Deus')
  expect(preview.text()).toContain('Hinário Adventista')
  expect(wrapper.get('[data-test="layout-lower-third"]').attributes('aria-checked')).toBe('true')
})

it('emits every change and the preview follows it', async () => {
  const wrapper = mountStyle()
  await wrapper.get('[data-test="theme-light"]').trigger('click')
  expect(last(wrapper)).toMatchObject({ theme: 'light' })
  await wrapper.get('[data-test="position-top"]').trigger('click')
  expect(last(wrapper)).toMatchObject({ position: 'top' })
  await wrapper.get('[data-test="layout-fullscreen"]').trigger('click')
  expect(last(wrapper)).toMatchObject({ layout: 'fullscreen' })
  expect(wrapper.find('[data-test="position-top"]').exists()).toBe(false)
  const range = wrapper.get<HTMLInputElement>('[data-test="text-scale"]')
  range.element.value = '130'
  await range.trigger('input')
  expect(wrapper.get('.transmission-style__preview').attributes('style')).toContain('--preview-scale: 1.3')
  expect(wrapper.text()).toContain('130%')
  const emittedBeforeRelease = wrapper.emitted('update:modelValue')!.length
  await range.trigger('change')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(emittedBeforeRelease + 1)
  expect(last(wrapper)).toMatchObject({ textScale: 130 })
  await wrapper.get('[role="switch"]').trigger('click')
  expect(last(wrapper)).toMatchObject({ showHeading: false })
  expect(wrapper.get('.transmission-style__preview').text()).not.toContain('Hinário Adventista')
  const color = wrapper.get<HTMLInputElement>('[data-test="accent"]')
  color.element.value = '#33aaff'
  await color.trigger('change')
  expect(last(wrapper)).toEqual({ layout: 'fullscreen', theme: 'light', position: 'top', textScale: 130, showHeading: false, accentColor: '#33AAFF' })
})

it('follows a style saved elsewhere and locks the controls while disabled', async () => {
  const wrapper = mountStyle()
  await wrapper.setProps({ modelValue: { ...DEFAULT_OVERLAY_STYLE, theme: 'transparent' }, disabled: true })
  expect(wrapper.get('.transmission-style__preview').attributes('data-theme')).toBe('transparent')
  expect(wrapper.get('[data-test="theme-dark"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-test="text-scale"]').attributes('disabled')).toBeDefined()
})
