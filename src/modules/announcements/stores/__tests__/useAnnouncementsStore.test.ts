// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference } from '@shared/services/user-preferences'

import { CAROUSEL_SLIDE_MS_MIN, type AnnouncementsState, type TextAnnouncement } from '../../types/announcements'
import { useAnnouncementsStore } from '../useAnnouncementsStore'

function text(id: string, title = id): TextAnnouncement {
  return { id, kind: 'text', title, titleColor: '', html: `<p>${title}</p>`, plainText: title }
}

function saved(): AnnouncementsState {
  return getUserPreference<AnnouncementsState>(USER_PREFERENCE_KEYS.announcementsState)!
}

/** Simula fechar e reabrir o app: Pinia novo, mesmo storage. */
function reopen() {
  setActivePinia(createPinia())
  return useAnnouncementsStore()
}

describe('useAnnouncementsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('primeira abertura tem uma "Lista avulsa" vazia e ativa', () => {
    const store = useAnnouncementsStore()
    expect(store.lists).toHaveLength(1)
    expect(store.activeList.name).toBe('Lista avulsa')
    expect(store.activeList.items).toEqual([])
  })

  it('cria, renomeia e ativa listas; reabrir volta na última lista usada', () => {
    const store = useAnnouncementsStore()
    const id = store.createList('Culto jovem')
    expect(store.activeListId).toBe(id)
    store.renameList(id, '  Culto JA  ')
    store.addAnnouncement(text('t1'))

    const again = reopen()
    expect(again.activeList).toMatchObject({ id, name: 'Culto JA', items: [text('t1')] })
    expect(again.lists).toHaveLength(2)
  })

  it('nome vazio vira o nome padrão', () => {
    const store = useAnnouncementsStore()
    const id = store.createList('   ')
    expect(store.lists.find((l) => l.id === id)!.name).toBe('Lista avulsa')
  })

  it('excluir a lista ativa ativa a vizinha; excluir a última recria uma vazia', () => {
    const store = useAnnouncementsStore()
    const first = store.activeListId
    const second = store.createList('B')
    store.removeList(second)
    expect(store.activeListId).toBe(first)
    store.removeList(first)
    expect(store.lists).toHaveLength(1)
    expect(store.lists[0]!.id).not.toBe(first)
    expect(store.activeList.name).toBe('Lista avulsa')
  })

  it('removeList devolve os avisos excluídos (para apagar os arquivos)', () => {
    const store = useAnnouncementsStore()
    store.addAnnouncement(text('t1'))
    const removed = store.removeList(store.activeListId)
    expect(removed.map((a) => a.id)).toEqual(['t1'])
  })

  it('adiciona, atualiza e exclui avisos da lista ativa', () => {
    const store = useAnnouncementsStore()
    store.addAnnouncement(text('t1'))
    store.addAnnouncement(text('t2'))
    store.updateAnnouncement({ ...text('t1'), title: 'Batismo' })
    expect(store.activeList.items.map((a) => a.title)).toEqual(['Batismo', 't2'])
    expect(store.removeAnnouncement('t2')?.id).toBe('t2')
    expect(store.removeAnnouncement('nao-existe')).toBeNull()
    expect(saved().lists[0]!.items.map((a) => a.id)).toEqual(['t1'])
  })

  it('reordena avisos e ignora índices fora da lista', () => {
    const store = useAnnouncementsStore()
    for (const id of ['a', 'b', 'c']) store.addAnnouncement(text(id))
    store.moveAnnouncement(0, 2)
    expect(store.activeList.items.map((a) => a.id)).toEqual(['b', 'c', 'a'])
    store.moveAnnouncement(5, 0)
    store.moveAnnouncement(1, 1)
    expect(store.activeList.items.map((a) => a.id)).toEqual(['b', 'c', 'a'])
  })

  it('insertAnnouncementAfter coloca a cópia logo abaixo do original', () => {
    const store = useAnnouncementsStore()
    store.addAnnouncement(text('a'))
    store.addAnnouncement(text('b'))
    store.insertAnnouncementAfter('a', text('a2'))
    expect(store.activeList.items.map((a) => a.id)).toEqual(['a', 'a2', 'b'])
  })

  it('addAnnouncement em outra lista não muda a ativa', () => {
    const store = useAnnouncementsStore()
    const first = store.activeListId
    const second = store.createList('B')
    store.addAnnouncement(text('t1'), first)
    expect(store.activeListId).toBe(second)
    expect(store.lists.find((l) => l.id === first)!.items).toHaveLength(1)
  })

  it('duplicateListShell cria uma lista nova com o nome de cópia, sem avisos, logo após a original', () => {
    const store = useAnnouncementsStore()
    const first = store.activeListId
    store.createList('Fim')
    const copy = store.duplicateListShell(first, 'Avisos (cópia)')
    expect(store.lists.map((l) => l.name)).toEqual(['Lista avulsa', 'Avisos (cópia)', 'Fim'])
    expect(store.activeListId).toBe(copy)
    expect(store.activeList.items).toEqual([])
  })

  it('config do carrossel é limitada e persistida', () => {
    const store = useAnnouncementsStore()
    store.setCarousel({ slideMs: 100, loop: false })
    expect(store.carousel).toEqual({ slideMs: CAROUSEL_SLIDE_MS_MIN, loop: false })
    expect(reopen().carousel).toEqual({ slideMs: CAROUSEL_SLIDE_MS_MIN, loop: false })
  })

  it('findAnnouncement acha em qualquer lista', () => {
    const store = useAnnouncementsStore()
    store.addAnnouncement(text('t1'))
    store.createList('B')
    expect(store.findAnnouncement('t1')?.title).toBe('t1')
    expect(store.findAnnouncement('x')).toBeNull()
  })

  it('setActiveList ignora lista inexistente e a já ativa', () => {
    const store = useAnnouncementsStore()
    const first = store.activeListId
    const second = store.createList('B')
    store.setActiveList('nao-existe')
    store.setActiveList(second)
    expect(store.activeListId).toBe(second)
    store.setActiveList(first)
    expect(reopen().activeListId).toBe(first)
  })
})
