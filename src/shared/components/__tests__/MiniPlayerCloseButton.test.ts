// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MiniPlayerCloseButton from '../MiniPlayerCloseButton.vue'
import AppConfirm from '../AppConfirm.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('MiniPlayerCloseButton', () => {
  it('pede confirmação, cancelar mantém aberto e confirmar emite fechar', async () => {
    const w = mount(MiniPlayerCloseButton, { props: { label: 'Relógio' } })
    await w.find('button').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    expect(w.findComponent(AppConfirm).props('open')).toBe(true)
    w.findComponent(AppConfirm).vm.$emit('cancel')
    await w.vm.$nextTick()
    expect(w.findComponent(AppConfirm).props('open')).toBe(false)
    expect(w.emitted('close')).toBeUndefined()
    await w.find('button').trigger('click')
    w.findComponent(AppConfirm).vm.$emit('confirm')
    await w.vm.$nextTick()
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.findComponent(AppConfirm).props('open')).toBe(false)
    w.unmount()
  })
})
