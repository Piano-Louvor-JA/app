import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import YoutubeRenameDialog from '../components/YoutubeRenameDialog.vue'
import ptBR from '../locales/pt-BR'

const ID = 'JHXM432zwwo'
const i18n = () => createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': ptBR } })

async function open(props: Record<string, unknown>) {
  const wrapper = mount(YoutubeRenameDialog, {
    props: { open: false, videoId: ID, title: 'Arautos do Rei | 60 Anos', ...props },
    global: { plugins: [i18n()] },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await nextTick()
  return wrapper
}

describe('YoutubeRenameDialog', () => {
  it('fechado não mostra nada', () => {
    const wrapper = mount(YoutubeRenameDialog, { props: { open: false, videoId: ID, title: 't' }, global: { plugins: [i18n()] } })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('abre com o nome atual do arquivo e mostra a prévia limpa', async () => {
    const wrapper = await open({ fileName: `Culto de sabado_${ID}.mp4` })
    const input = wrapper.get<HTMLInputElement>('[data-testid="youtube-rename-input"]')
    expect(input.element.value).toBe('Culto de sabado')
    await input.setValue('Abertura — sábado / 19h!')
    expect(wrapper.get('[data-testid="youtube-rename-preview"]').text()).toBe(`Abertura sabado 19h_${ID}.mp4`)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('confirm')).toEqual([['Abertura — sábado / 19h!']])
    wrapper.unmount()
  })

  it('sem nome salvo usa o título; sem mudança só fecha', async () => {
    const wrapper = await open({})
    const input = wrapper.get<HTMLInputElement>('[data-testid="youtube-rename-input"]')
    expect(input.element.value).toBe('Arautos do Rei 60 Anos')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('cancelar, X, Esc e clique fora fecham', async () => {
    const wrapper = await open({ fileName: `${ID}.mp4` })
    expect(wrapper.get<HTMLInputElement>('[data-testid="youtube-rename-input"]').element.value).toBe('Arautos do Rei 60 Anos')
    await wrapper.get('.yt-rn__x').trigger('click')
    await wrapper.get('.yt-rn__foot .yt-rn__btn').trigger('click')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await wrapper.get('[role="dialog"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(4)
    wrapper.unmount()
  })
})
