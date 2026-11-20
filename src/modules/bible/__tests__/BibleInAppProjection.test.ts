// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@shared/components/InAppProjectionOverlay.vue', () => ({
  default: {
    name: 'InAppProjectionOverlay',
    props: ['scope', 'label', 'closeLabel', 'hint'],
    emits: ['close'],
    template: '<div class="overlay-stub"><slot /><button data-test="close" @click="$emit(\'close\')">x</button></div>',
  },
}))

vi.mock('../views/BibleProjectionView.vue', () => ({
  default: { name: 'BibleProjectionView', template: '<div class="projection-stub" />' },
}))

import BibleInAppProjection from '../components/BibleInAppProjection.vue'

describe('BibleInAppProjection', () => {
  it('renderiza overlay com a projeção embutida e emite close', async () => {
    const wrapper = mount(BibleInAppProjection)
    expect(wrapper.find('.overlay-stub').exists()).toBe(true)
    expect(wrapper.find('.projection-stub').exists()).toBe(true)
    await wrapper.find('[data-test="close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
