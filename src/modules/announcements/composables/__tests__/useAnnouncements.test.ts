// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  duplicate: vi.fn(),
  removeFolder: vi.fn(),
}))
vi.mock('@shared/composables/useAppConfirm', () => ({ appConfirm: mocks.confirm }))
vi.mock('../../services/announcements-files', () => ({
  duplicateAnnouncementWithFiles: mocks.duplicate,
  removeAnnouncementFolder: mocks.removeFolder,
}))
vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }),
}))

import { useAnnouncementsStore } from '../../stores/useAnnouncementsStore'
import type { Announcement, ImagesAnnouncement, TextAnnouncement } from '../../types/announcements'
import { newAnnouncementDraft, useAnnouncements } from '../useAnnouncements'

const text: TextAnnouncement = { id: 't1', kind: 'text', title: 'Batismo', titleColor: '', html: '<p>x</p>', plainText: 'x' }
const images: ImagesAnnouncement = { id: 'a1', kind: 'images', title: '', files: [{ relativePath: 'modulos/avisos/a1/1.png', name: '1.png' }] }

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  mocks.confirm.mockReset()
  mocks.duplicate.mockReset()
  mocks.removeFolder.mockReset()
  mocks.duplicate.mockImplementation(async (item: Announcement, id: string) => ({ ...item, id }))
})

describe('newAnnouncementDraft', () => {
  it.each(['text', 'images', 'video', 'presentation', 'url'] as const)('cria rascunho vazio de %s com id', (kind) => {
    const draft = newAnnouncementDraft(kind)
    expect(draft.kind).toBe(kind)
    expect(draft.id).toBeTruthy()
    expect(draft.title).toBe('')
  })
})

describe('useAnnouncements', () => {
  it('saveAnnouncement adiciona o novo e atualiza o existente', () => {
    const ui = useAnnouncements()
    ui.saveAnnouncement(text)
    ui.saveAnnouncement({ ...text, title: 'Ceia' })
    expect(ui.activeList.value.items).toEqual([{ ...text, title: 'Ceia' }])
  })

  it('duplicar aviso coloca a cópia abaixo, com "(cópia)" no título', async () => {
    const ui = useAnnouncements()
    ui.saveAnnouncement(text)
    await ui.duplicateAnnouncement('t1')
    const [original, copy] = ui.activeList.value.items
    expect(original).toEqual(text)
    expect(copy!.id).not.toBe('t1')
    expect(copy!.title).toBe('Batismo announcements.copySuffix')
  })

  it('duplicar aviso sem título não inventa título', async () => {
    const ui = useAnnouncements()
    ui.saveAnnouncement(images)
    await ui.duplicateAnnouncement('a1')
    expect(ui.activeList.value.items[1]!.title).toBe('')
  })

  it('falha ao copiar arquivos avisa e não cria a cópia', async () => {
    mocks.duplicate.mockResolvedValue(null)
    const ui = useAnnouncements()
    ui.saveAnnouncement(images)
    await ui.duplicateAnnouncement('a1')
    await ui.duplicateAnnouncement('nao-existe')
    expect(ui.activeList.value.items).toHaveLength(1)
    expect(ui.notice.value).toEqual({ key: 'announcements.notices.duplicateFailed', tone: 'error', params: undefined })
    ui.clearNotice()
    expect(ui.notice.value).toBeNull()
  })

  it('excluir aviso pede confirmação e apaga a pasta só se confirmar', async () => {
    const ui = useAnnouncements()
    ui.saveAnnouncement(images)
    mocks.confirm.mockResolvedValueOnce(false)
    await ui.confirmRemoveAnnouncement('a1')
    expect(ui.activeList.value.items).toHaveLength(1)
    expect(mocks.removeFolder).not.toHaveBeenCalled()

    mocks.confirm.mockResolvedValueOnce(true)
    await ui.confirmRemoveAnnouncement('a1')
    expect(mocks.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ danger: true }))
    expect(ui.activeList.value.items).toEqual([])
    expect(mocks.removeFolder).toHaveBeenCalledWith(images)

    await ui.confirmRemoveAnnouncement('nao-existe')
    expect(mocks.confirm).toHaveBeenCalledTimes(2)
  })

  it('setInCarousel tira e devolve o aviso ao carrossel; ignora vídeo e inexistente', () => {
    const ui = useAnnouncements()
    ui.saveAnnouncement(text)
    ui.saveAnnouncement({ id: 'v1', kind: 'video', title: 'V', file: null })
    ui.setInCarousel('t1', false)
    expect(ui.activeList.value.items[0]).toMatchObject({ inCarousel: false })
    ui.setInCarousel('t1', true)
    expect(ui.activeList.value.items[0]).not.toHaveProperty('inCarousel')
    ui.setInCarousel('v1', false)
    expect(ui.activeList.value.items[1]).not.toHaveProperty('inCarousel')
    ui.setInCarousel('nao-existe', false)
  })

  it('cria e renomeia a lista ativa', () => {
    const ui = useAnnouncements()
    ui.createList('Culto jovem')
    ui.renameActiveList('Culto JA')
    expect(ui.activeList.value.name).toBe('Culto JA')
    expect(ui.lists.value).toHaveLength(2)
  })

  it('duplicar lista copia todos os avisos para a nova lista ativa', async () => {
    const ui = useAnnouncements()
    ui.saveAnnouncement(text)
    ui.saveAnnouncement(images)
    const originalId = ui.activeListId.value
    await ui.duplicateActiveList()
    expect(ui.activeListId.value).not.toBe(originalId)
    expect(ui.activeList.value.name).toBe('Lista avulsa announcements.copySuffix')
    expect(ui.activeList.value.items.map((a) => a.kind)).toEqual(['text', 'images'])
    expect(ui.activeList.value.items.every((a) => !['t1', 'a1'].includes(a.id))).toBe(true)
    expect(useAnnouncementsStore().lists.find((l) => l.id === originalId)!.items).toHaveLength(2)
    expect(ui.notice.value).toBeNull()
  })

  it('duplicar lista com falha em um aviso avisa quantos ficaram de fora', async () => {
    mocks.duplicate.mockImplementation(async (item: Announcement, id: string) => (item.kind === 'images' ? null : { ...item, id }))
    const ui = useAnnouncements()
    ui.saveAnnouncement(text)
    ui.saveAnnouncement(images)
    await ui.duplicateActiveList()
    expect(ui.activeList.value.items).toHaveLength(1)
    expect(ui.notice.value).toMatchObject({ key: 'announcements.notices.duplicateListPartial', params: { count: 1 } })
  })

  it('excluir lista confirma e apaga a pasta de cada aviso', async () => {
    const ui = useAnnouncements()
    ui.saveAnnouncement(text)
    ui.saveAnnouncement(images)
    mocks.confirm.mockResolvedValueOnce(false)
    await ui.confirmRemoveActiveList()
    expect(ui.activeList.value.items).toHaveLength(2)

    mocks.confirm.mockResolvedValueOnce(true)
    await ui.confirmRemoveActiveList()
    expect(ui.activeList.value.items).toEqual([])
    expect(mocks.removeFolder).toHaveBeenCalledTimes(2)
  })
})
