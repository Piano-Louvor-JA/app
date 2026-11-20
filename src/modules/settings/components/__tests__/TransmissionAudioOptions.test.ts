// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
const changeRoute = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@modules/media/stores/useMediaStore', () => ({
  useMediaStore: () => ({ audioRoute: ref('both'), setAudioRoute: changeRoute }),
}))
import TransmissionAudioOptions from '../TransmissionAudioOptions.vue'
it('restores the existing audio choice and delegates edits to its persistent media preference', async () => {
  const wrapper = mount(TransmissionAudioOptions)
  expect(wrapper.get('select').element.value).toBe('both')
  await wrapper.get('select').setValue('tv')
  expect(changeRoute).toHaveBeenCalledWith('tv')
  expect(wrapper.findAll('option').map(option => option.attributes('value'))).toEqual(['pc', 'tv', 'both'])
  wrapper.unmount()
})
