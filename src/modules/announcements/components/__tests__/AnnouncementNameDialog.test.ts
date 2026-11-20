// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))

import AnnouncementNameDialog from '../AnnouncementNameDialog.vue'

let wrapper: VueWrapper | null = null
const $ = (s: string) => document.body.querySelector<HTMLElement>(s)

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('AnnouncementNameDialog', () => {
  it('fechado não renderiza', () => {
    wrapper = mount(AnnouncementNameDialog, { props: { open: false, title: 'T' }, attachTo: document.body })
    expect($('[role="dialog"]')).toBeNull()
  })

  it('abre com o nome atual, salva o digitado e fecha com ESC/cancelar', async () => {
    wrapper = mount(AnnouncementNameDialog, { props: { open: false, title: 'Renomear', initialName: 'Sábado' }, attachTo: document.body })
    await wrapper.setProps({ open: true })
    await flushPromises()
    const input = $('[data-test="list-name-input"]') as HTMLInputElement
    expect(input.value).toBe('Sábado')
    input.value = 'Jovens'
    input.dispatchEvent(new Event('input'))
    $('[data-test="list-name-save"]')!.click()
    expect(wrapper.emitted('save')).toEqual([['Jovens']])
    $('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    ;($('.announcement-name__btn') as HTMLButtonElement).click()
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('sem nome inicial começa vazio', async () => {
    wrapper = mount(AnnouncementNameDialog, { props: { open: true, title: 'Nova' }, attachTo: document.body })
    await flushPromises()
    expect(($('[data-test="list-name-input"]') as HTMLInputElement).value).toBe('')
  })
})
