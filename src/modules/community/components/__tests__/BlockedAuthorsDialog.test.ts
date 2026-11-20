// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({ list: vi.fn(), unblock: vi.fn() }))
vi.mock('@modules/media/services/auth-client', () => ({ authTokenAsync: async () => 'tok' }))
vi.mock('../../services/blocks', () => ({ listBlockedAuthors: mocks.list, unblockAuthor: mocks.unblock }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import BlockedAuthorsDialog from '../BlockedAuthorsDialog.vue'

function q(sel: string) { return document.body.querySelector<HTMLElement>(sel) }

describe('BlockedAuthorsDialog', () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue([{ id: 12, name: 'Autor' }, { id: 3, name: '' }])
    mocks.unblock.mockResolvedValue(true)
  })
  afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

  it('lista, desbloqueia e avisa mudança ao fechar', async () => {
    const w = mount(BlockedAuthorsDialog, { props: { open: true }, attachTo: document.body })
    await flushPromises()
    expect(document.body.textContent).toContain('Autor')
    expect(document.body.textContent).toContain('community.blockedNoName')

    q('[data-test="unblock-12"]')!.click()
    await flushPromises()
    expect(mocks.unblock).toHaveBeenCalledWith(12, 'tok')
    expect(q('[data-test="unblock-12"]')).toBeNull()

    q('.blocked-dialog__close')!.click()
    expect(w.emitted('close')).toEqual([[true]])
    w.unmount()
  })

  it('lista vazia e falha de carga', async () => {
    mocks.list.mockResolvedValueOnce([])
    const w = mount(BlockedAuthorsDialog, { props: { open: true }, attachTo: document.body })
    await flushPromises()
    expect(q('[data-test="blocked-empty"]')).not.toBeNull()
    w.unmount()

    mocks.list.mockResolvedValueOnce(null)
    const w2 = mount(BlockedAuthorsDialog, { props: { open: true }, attachTo: document.body })
    await flushPromises()
    expect(q('[data-test="blocked-error"]')).not.toBeNull()
    w2.unmount()
  })

  it('falha ao desbloquear mostra erro; fechar sem mudança emite false; reabrir recarrega', async () => {
    mocks.unblock.mockResolvedValueOnce(false)
    const w = mount(BlockedAuthorsDialog, { props: { open: false }, attachTo: document.body })
    expect(q('.blocked-dialog')).toBeNull()
    await w.setProps({ open: true })
    await flushPromises()
    q('[data-test="unblock-12"]')!.click()
    await flushPromises()
    expect(q('[data-test="blocked-error"]')).not.toBeNull()
    q('.blocked-dialog__backdrop')!.click()
    expect(w.emitted('close')).toEqual([[false]])
    w.unmount()
  })
})
