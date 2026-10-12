// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { parseDataPacketMock } = vi.hoisted(() => ({
  parseDataPacketMock: vi.fn(),
}))

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(),
  setUserPreference: vi.fn(),
}))

vi.mock('@shared/constants/storage-keys', () => ({
  USER_PREFERENCE_KEYS: {
    scheduledState: 'scheduledState',
  },
}))

vi.mock('../../services/datapacket-parser', () => ({
  parseDataPacket: parseDataPacketMock,
}))

vi.mock('../services/datapacket-parser', () => ({
  parseDataPacket: parseDataPacketMock,
}))

import { useScheduledStore } from '../useScheduledStore'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  parseDataPacketMock.mockReset()
})

describe('useScheduledStore — agenda de itens (calendário)', () => {
  it('defaults: vazio quando nada salvo', () => {
    getUserPreference.mockReturnValue({ categories: [], items: [] })
    const store = useScheduledStore()
    expect(store.categories).toEqual([])
    expect(store.items).toEqual([])
  })

  it('loadState: carrega categorias e itens salvos', () => {
    getUserPreference.mockReturnValue({
      categories: [{ id: 'c1', name: 'Culto' }],
      items: [{ id: 'i1', categoryId: 'c1', date: '2024-12-25', name: 'Natal', filePath: '', isRelativePath: false, notes: '' }],
    })
    const store = useScheduledStore()
    expect(store.categories).toHaveLength(1)
    expect(store.categories[0].name).toBe('Culto')
    expect(store.items).toHaveLength(1)
    expect(store.items[0].name).toBe('Natal')
  })

  it('itemsOn: filtra por data ISO', () => {
    getUserPreference.mockReturnValue({
      categories: [],
      items: [
        { id: 'i1', categoryId: 'c1', date: '2024-12-25', name: 'Natal', filePath: '', isRelativePath: false, notes: '' },
        { id: 'i2', categoryId: 'c1', date: '2024-12-31', name: 'Virada', filePath: '', isRelativePath: false, notes: '' },
      ],
    })
    const store = useScheduledStore()
    expect(store.itemsOn('2024-12-25')).toHaveLength(1)
    expect(store.itemsOn('2024-12-25')[0].name).toBe('Natal')
    expect(store.itemsOn('2024-01-01')).toEqual([])
  })

  it('categoryName: retorna nome ou null', () => {
    getUserPreference.mockReturnValue({
      categories: [{ id: 'c1', name: 'Culto' }],
      items: [],
    })
    const store = useScheduledStore()
    expect(store.categoryName('c1')).toBe('Culto')
    expect(store.categoryName('c2')).toBeNull()
  })

  it('importFromDelphi: categorias novas só (idempotente)', () => {
    getUserPreference.mockReturnValue({ categories: [{ id: 'c1', name: 'Existente' }], items: [] })
    parseDataPacketMock
      .mockReturnValueOnce([{ ID: 'c1', NOME: 'Duplicado' }, { ID: 'c2', NOME: 'Nova' }])
      .mockReturnValueOnce([])
    const store = useScheduledStore()
    const changed = store.importFromDelphi('<xml/>', null)
    expect(changed).toBe(0)
    expect(store.categories).toHaveLength(2)
    expect(store.categories.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('importFromDelphi: itens upsert por id, parse de data BR/ISO/TDateTime', () => {
    getUserPreference.mockReturnValue({ categories: [], items: [] })
    parseDataPacketMock
      .mockReturnValueOnce([{ ID: 'c1', NOME: 'Cat' }])
      .mockReturnValueOnce([
        { ID: 'i1', CATEGORIA: 'c1', DATA: '25/12/2024', NOME: 'Natal', ARQUIVO: 'a.pdf', ARQUIVO_INFO: 'I' },
        { ID: 'i2', CATEGORIA: 'c1', DATA: '2024-12-31', NOME: 'Virada', ARQUIVO: 'b.pdf', ARQUIVO_INFO: 'A' },
        { ID: 'i3', CATEGORIA: 'c1', DATA: '45678.5', NOME: 'TDateTime', ARQUIVO: '', ARQUIVO_INFO: '' },
      ])
    const store = useScheduledStore()
    console.log('DEBUG parseDataPacket calls:', parseDataPacketMock.mock.calls.length)
    let changed = 0
    try {
      changed = store.importFromDelphi('<cats/>', '<items/>')
    } catch (e) {
      console.log('ERROR importFromDelphi:', e)
    }
    console.log('DEBUG changed:', changed, 'items:', store.items.length)
    expect(changed).toBe(3)
    expect(store.items).toHaveLength(3)
    expect(store.items.find((i) => i.id === 'i1')?.date).toBe('2024-12-25')
    expect(store.items.find((i) => i.id === 'i2')?.date).toBe('2024-12-31')
    expect(store.items.find((i) => i.id === 'i3')?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(store.items.find((i) => i.id === 'i1')?.isRelativePath).toBe(true)
    expect(store.items.find((i) => i.id === 'i2')?.isRelativePath).toBe(false)
  })

  it('importFromDelphi: data inválida pula item', () => {
    getUserPreference.mockReturnValue({ categories: [], items: [] })
    parseDataPacketMock
      .mockReturnValueOnce([{ ID: 'c1', NOME: 'Cat' }])
      .mockReturnValueOnce([{ ID: 'i1', CATEGORIA: 'c1', DATA: 'invalida', NOME: 'X', ARQUIVO: '', ARQUIVO_INFO: '' }])
    const store = useScheduledStore()
    const changed = store.importFromDelphi('<cats/>', '<items/>')
    expect(changed).toBe(0)
    expect(store.items).toHaveLength(0)
  })

  it('persist salva estado', () => {
    getUserPreference.mockReturnValue({ categories: [], items: [] })
    const store = useScheduledStore()
    store.categories.push({ id: 'c1', name: 'Teste' })
    store.persist()
    expect(setUserPreference).toHaveBeenCalledWith(
      'scheduledState',
      { categories: [{ id: 'c1', name: 'Teste' }], items: [] },
    )
  })
})
