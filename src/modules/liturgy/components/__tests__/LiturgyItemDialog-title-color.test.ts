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

const nameInput = () => document.body.querySelector('#moment-name') as HTMLInputElement
const trigger = () => document.body.querySelector('[data-testid="title-color-trigger"]') as HTMLButtonElement | null

describe('LiturgyItemDialog — cor do título da anotação', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('anotação mostra o botão de cor ao lado do título', async () => {
    mountDialog({ type: 'annotation', name: 'Avisos' })
    await flushPromises()
    expect(trigger()).not.toBeNull()
    expect(nameInput().parentElement?.classList).toContain('moment-dialog__name-row--color')
    expect(nameInput().style.color).toBe('')
  })

  it('escolher uma cor guarda no rascunho e pinta o campo do título', async () => {
    const wrapper = mountDialog({ type: 'annotation', name: 'Avisos' })
    await flushPromises()
    trigger()!.click()
    await flushPromises()
    ;(document.body.querySelector('[data-color="#42a5f5"]') as HTMLButtonElement).click()
    await flushPromises()
    expect((wrapper.props('draft') as LiturgyItemDraft).titleColor).toBe('#42a5f5')
    expect(nameInput().style.color).toBe('rgb(66, 165, 245)')
  })

  it('outros tipos não têm o botão de cor', async () => {
    mountDialog({ type: 'site', name: 'Site', url: 'https://x.org', titleColor: '#42a5f5' })
    await flushPromises()
    expect(trigger()).toBeNull()
    expect(nameInput().parentElement?.classList).not.toContain('moment-dialog__name-row--color')
    expect(nameInput().style.color).toBe('')
  })
})
