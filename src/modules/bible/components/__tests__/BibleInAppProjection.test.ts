// @vitest-environment jsdom
/**
 * BibleInAppProjection — overlay com BibleProjectionView embutido;
 * close do overlay repassa emit('close').
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'

vi.mock('@shared/components/InAppProjectionOverlay.vue', () => ({
  default: {
    name: 'InAppProjectionOverlay',
    template: `<div class="overlay-stub">
      <span class="overlay-label">{{ label }}</span>
      <button class="overlay-close" @click="$emit('close')" />
      <slot />
    </div>`,
    props: ['scope', 'label', 'closeLabel', 'hint'],
    emits: ['close'],
  },
}))
import BibleInAppProjection from '../BibleInAppProjection.vue'

const ProjectionViewStub = {
  name: 'BibleProjectionView',
  template: '<div class="projection-view-stub" />',
}

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  fallbackLocale: 'pt-BR',
  messages: { 'pt-BR': ptBR },
})

describe('BibleInAppProjection', () => {
  it('renderiza overlay com a projection view embutida', () => {
    const w = mount(BibleInAppProjection, {
      global: { plugins: [i18n], stubs: { BibleProjectionView: ProjectionViewStub } },
    })
    expect(w.find('.overlay-stub').exists()).toBe(true)
    expect(w.find('.projection-view-stub').exists()).toBe(true)
  })

  it('close do overlay emite close', async () => {
    const w = mount(BibleInAppProjection, {
      global: { plugins: [i18n], stubs: { BibleProjectionView: ProjectionViewStub } },
    })
    await w.find('.overlay-close').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })
})
