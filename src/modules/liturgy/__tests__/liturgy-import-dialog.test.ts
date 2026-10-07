import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import LiturgyItemDialog from '../components/LiturgyItemDialog.vue'
import { importSljaAsLiturgyMusic } from '../services/import-slja-to-liturgy'

vi.mock('../services/import-slja-to-liturgy', () => ({ importSljaAsLiturgyMusic: vi.fn() }))

describe('importação após fechar o diálogo', () => {
  it('descarta conclusão antiga e permite importar no item reaberto', async () => {
    let finish!: (value: Awaited<ReturnType<typeof importSljaAsLiturgyMusic>>) => void
    vi.mocked(importSljaAsLiturgyMusic).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(LiturgyItemDialog, {
      props: {
        open: true, isEditing: false, isValid: true,
        draft: { type: 'music', name: '', subtitle: '', durationMs: 0, accentColor: '', categoryId: null, startTime: '', endTime: '', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], presentationEngine: 'auto', playerId: 'default', url: '' },
        categoryOptions: [], complementaryTitleSuggestions: [], musicOptions: [], musicQuery: '', musicCatalogEmpty: true, selectedMusic: null,
      },
      global: { stubs: { teleport: true }, plugins: [createI18n({ legacy: false, locale: 'pt', missingWarn: false, fallbackWarn: false, messages: { pt: {} } })] },
    })
    const input = wrapper.get('[data-testid="slja-file-input"]')
    Object.defineProperty(input.element, 'files', { value: [{ name: 'test.slja', arrayBuffer: async () => new ArrayBuffer(0) }], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.get('[data-testid="slja-import-btn"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect(wrapper.get('[data-testid="slja-import-btn"]').attributes('disabled')).toBeUndefined()
    finish({ displayMusicId: -1, durationMs: 1000, name: 'old', local: true, slides: 1, imagesOmitted: false } as Awaited<ReturnType<typeof importSljaAsLiturgyMusic>>)
    await flushPromises()
    expect(wrapper.emitted('slja-imported')).toBeUndefined()
    expect(wrapper.emitted('update:draft')).toBeUndefined()
    wrapper.unmount()
  })
})
