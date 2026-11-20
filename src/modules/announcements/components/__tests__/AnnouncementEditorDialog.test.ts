// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({ pick: vi.fn(), removeFiles: vi.fn(), removeFolder: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, arg?: unknown) => (arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) }),
}))
vi.mock('@design-system/index', () => ({ GlassCard: { template: '<section><slot /></section>' } }))
vi.mock('@modules/liturgy/components/LiturgyRichNotesEditor.vue', () => ({
  default: { name: 'LiturgyRichNotesEditor', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="rich" />' },
}))
vi.mock('@modules/liturgy/components/LiturgyTitleColorPicker.vue', () => ({
  default: { name: 'LiturgyTitleColorPicker', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="color" />' },
}))
const autofill = vi.hoisted(() => ({ loading: { value: false } }))
vi.mock('../../composables/useUrlTitleAutofill', async () => {
  const { ref } = await import('vue')
  const loading = ref(false)
  autofill.loading = loading
  return { useUrlTitleAutofill: () => ({ loading }) }
})
vi.mock('@shared/services/workspace-api', () => ({ resolveMediaUrl: (p: string) => `local://media/${p}` }))
vi.mock('../../services/announcements-files', () => ({
  pickAnnouncementFiles: mocks.pick,
  removeAnnouncementFiles: mocks.removeFiles,
  removeAnnouncementFolder: mocks.removeFolder,
}))

import AnnouncementEditorDialog from '../AnnouncementEditorDialog.vue'
import type { Announcement } from '../../types/announcements'

let wrapper: VueWrapper | null = null

function open(item: Announcement, isNew = true) {
  wrapper = mount(AnnouncementEditorDialog, { props: { item, isNew }, attachTo: document.body })
  return wrapper
}

const $ = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const $$ = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)]

async function click(selector: string) {
  $(selector)!.click()
  await flushPromises()
}

beforeEach(() => {
  mocks.pick.mockReset()
  mocks.removeFiles.mockReset()
  mocks.removeFolder.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('AnnouncementEditorDialog', () => {
  it('texto vazio não salva e mostra o erro; com título salva limpo', async () => {
    const w = open({ id: 't', kind: 'text', title: '', titleColor: '', html: '', plainText: '' })
    expect($('[role="dialog"]')!.getAttribute('aria-label')).toBe('announcements.dialog.newTitle:{"kind":"announcements.kinds.text"}')
    await click('[data-test="editor-save"]')
    expect($('[data-test="editor-error"]')!.textContent).toContain('announcements.dialog.emptyText')
    expect(w.emitted('save')).toBeUndefined()

    const input = $('[data-test="editor-title"]') as HTMLInputElement
    input.value = '  Ceia  '
    input.dispatchEvent(new Event('input'))
    w.findComponent({ name: 'LiturgyTitleColorPicker' }).vm.$emit('update:modelValue', '#ff0000')
    w.findComponent({ name: 'LiturgyRichNotesEditor' }).vm.$emit('update:modelValue', '<p>às 9h</p>')
    await click('[data-test="editor-save"]')
    expect(w.emitted('save')![0]![0]).toMatchObject({ title: 'Ceia', titleColor: '#ff0000', plainText: 'às 9h' })
  })

  it('imagens: adicionar mostra miniaturas, recusadas viram aviso, cancelar novo apaga a pasta', async () => {
    mocks.pick.mockResolvedValue({
      ok: true,
      files: [{ relativePath: 'modulos/avisos/a/1.png', name: '1.png' }, { relativePath: 'modulos/avisos/a/2.png', name: '2.png' }],
      rejected: [{ name: 'x.txt', reason: 'unsupported_format' }],
    })
    const w = open({ id: 'a', kind: 'images', title: '', files: [] })
    await click('[data-test="editor-pick"]')
    expect($$('[data-test="editor-image"]')).toHaveLength(2)
    expect($('[data-test="editor-image"] img')!.getAttribute('src')).toBe('local://media/modulos/avisos/a/1.png')
    expect(w.emitted('notice')).toEqual([['announcements.notices.rejected', { count: 1, names: 'x.txt' }]])

    const moveRight = () => $$('[data-test="editor-image"]')[0]!.querySelectorAll('button')[1] as HTMLButtonElement
    const moveLeft = () => $$('[data-test="editor-image"]')[1]!.querySelectorAll('button')[0] as HTMLButtonElement
    moveRight().click()
    await flushPromises()
    expect($$('[data-test="editor-image"] img').map((img) => img.getAttribute('alt'))).toEqual(['2.png', '1.png'])
    moveLeft().click()
    await flushPromises()
    expect($$('[data-test="editor-image"] img').map((img) => img.getAttribute('alt'))).toEqual(['1.png', '2.png'])

    await click('[data-test="editor-image-remove"]')
    expect($$('[data-test="editor-image"]')).toHaveLength(1)

    await click('[data-test="editor-cancel"]')
    expect(mocks.removeFolder).toHaveBeenCalled()
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('cancelar no diálogo do sistema não avisa; erro de cópia avisa', async () => {
    const w = open({ id: 'v', kind: 'video', title: '', file: null })
    mocks.pick.mockResolvedValueOnce({ ok: false, reason: 'cancelled' })
    await click('[data-test="editor-pick"]')
    expect(w.emitted('notice')).toBeUndefined()
    mocks.pick.mockResolvedValueOnce({ ok: false, reason: 'error' })
    await click('[data-test="editor-pick"]')
    expect(w.emitted('notice')).toEqual([['announcements.notices.pickFailed']])
    expect($('[data-test="editor-pick"]')!.textContent).toContain('announcements.dialog.chooseVideo')
  })

  it('apresentação: arquivo escolhido e salvar, sem escolha de programa', async () => {
    mocks.pick.mockResolvedValue({ ok: true, files: [{ relativePath: 'modulos/avisos/p/1.pptx', name: 'r.pptx' }], rejected: [] })
    const w = open({ id: 'p', kind: 'presentation', title: 'Relatório', file: null }, false)
    expect($('[data-test="editor-pick"]')!.textContent).toContain('announcements.dialog.chooseFile')
    await click('[data-test="editor-pick"]')
    expect($('[data-test="editor-file"]')!.textContent).toContain('r.pptx')
    expect($('[data-test="editor-pick"]')!.textContent).toContain('announcements.dialog.replaceFile')
    expect($('[role="radiogroup"]')).toBeNull()
    await click('[data-test="editor-save"]')
    expect(w.emitted('save')![0]![0]).toMatchObject({ file: { name: 'r.pptx' } })
    expect($('[role="dialog"]')!.getAttribute('aria-label')).toContain('announcements.dialog.editTitle')
  })

  it('URL: link inválido mostra o erro; válido salva', async () => {
    const w = open({ id: 'u', kind: 'url', title: '', url: '' })
    expect($('[data-test="editor-pick"]')).toBeNull()
    await click('[data-test="editor-save"]')
    expect($('[data-test="editor-error"]')!.textContent).toContain('announcements.dialog.invalidUrl')
    expect($('[data-test="editor-url-hint"]')!.textContent).toContain('announcements.dialog.urlHint')
    autofill.loading.value = true
    await flushPromises()
    expect($('[data-test="editor-url-hint"]')!.textContent).toContain('announcements.dialog.fetchingTitle')
    autofill.loading.value = false
    const input = $('[data-test="editor-url"]') as HTMLInputElement
    input.value = 'https://adventistas.org'
    input.dispatchEvent(new Event('input'))
    await click('[data-test="editor-save"]')
    expect(w.emitted('save')![0]![0]).toMatchObject({ kind: 'url', url: 'https://adventistas.org' })
  })

  it('ESC cancela', async () => {
    const w = open({ id: 't', kind: 'text', title: 'x', titleColor: '', html: '', plainText: '' }, false)
    $('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(w.emitted('close')).toHaveLength(1)
    expect(mocks.removeFiles).toHaveBeenCalledWith([])
  })
})
