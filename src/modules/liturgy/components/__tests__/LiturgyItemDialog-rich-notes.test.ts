// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'pt-BR' } }),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => null,
  isDesktopApp: () => false,
}))

vi.mock('../../stores/useScheduledStore', () => ({
  useScheduledStore: () => ({ categories: [], items: [] }),
}))

import type { LiturgyItemDraft } from '../../types/liturgy'
import { DEFAULT_LITURGY_ITEM_DRAFT } from '../../types/liturgy'
import LiturgyItemDialog from '../LiturgyItemDialog.vue'

function mountDialog(partial: Partial<LiturgyItemDraft>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(LiturgyItemDialog, {
    props: {
      open: true,
      draft: { ...DEFAULT_LITURGY_ITEM_DRAFT, ...partial },
      isEditing: true,
      isValid: true,
      categoryOptions: [],
      complementaryTitleSuggestions: [],
      musicOptions: [],
      musicQuery: '',
      musicCatalogEmpty: false,
      selectedMusic: null,
      'onUpdate:draft': (draft: LiturgyItemDraft) => wrapper.setProps({ draft }),
    },
    global: { plugins: [pinia], config: { globalProperties: { $t: (key: string) => key } } },
    attachTo: document.body,
  })
  return wrapper
}

const editorContent = () => document.body.querySelector('.rich-notes-editor__content') as HTMLDivElement | null
const draftOf = (wrapper: ReturnType<typeof mountDialog>) => wrapper.props('draft') as LiturgyItemDraft

describe('LiturgyItemDialog — editor de texto da anotação', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('anotação usa o editor no lugar do campo de texto simples', async () => {
    mountDialog({ type: 'annotation', name: 'Almoço', notesHtml: '<div><b>Almoço</b> na igreja</div>' })
    await flushPromises()
    expect(document.body.querySelector('#moment-details')).toBeNull()
    expect(editorContent()?.innerHTML).toBe('<div><b>Almoço</b> na igreja</div>')
    expect(editorContent()?.getAttribute('aria-labelledby')).toBe('moment-details-label')
  })

  it('anotação antiga, só com texto, abre no editor com as mesmas linhas', async () => {
    mountDialog({ type: 'annotation', name: 'Aviso', subtitle: 'Neste sábado\n\nJA às 17:00' })
    await flushPromises()
    expect(editorContent()?.innerHTML).toBe('<div>Neste sábado</div><div><br></div><div>JA às 17:00</div>')
  })

  it('escrever no editor guarda o texto formatado e o texto puro', async () => {
    const wrapper = mountDialog({ type: 'annotation', name: 'Aviso' })
    const content = editorContent()!
    content.innerHTML = '<div><b>Almoço</b> na igreja</div><ul><li>JA às 17:00</li></ul>'
    content.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(draftOf(wrapper)).toMatchObject({
      notesHtml: '<div><b>Almoço</b> na igreja</div><ul><li>JA às 17:00</li></ul>',
      subtitle: 'Almoço na igreja\n• JA às 17:00',
    })
  })

  it('outros tipos seguem com o campo de texto simples', () => {
    mountDialog({ type: 'site', url: 'https://x.org' })
    expect(document.body.querySelector('textarea#moment-details')).not.toBeNull()
    expect(editorContent()).toBeNull()
  })
})
