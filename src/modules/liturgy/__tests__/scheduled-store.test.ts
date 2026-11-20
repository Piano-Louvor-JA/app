import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useScheduledStore } from '../stores/useScheduledStore'

const prefs: Record<string, unknown> = {}
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: <T,>(key: string, fallback: T) => (prefs[key] as T) ?? fallback,
  setBrowserItem: (key: string, value: unknown) => { prefs[key] = value },
}))

const catsXml =
  '<DATAPACKET><ROWDATA><ROW ID="c1" NOME="Provai e Vede"/></ROWDATA></DATAPACKET>'
const itemsXml =
  '<DATAPACKET><ROWDATA>' +
  '<ROW ID="i1" CATEGORIA="c1" DATA="12/10/2026" NOME="Sermão" ARQUIVO="C:\\sermao.pptx" ARQUIVO_INFO=""/>' +
  '<ROW ID="i2" CATEGORIA="c1" DATA="2026-10-19" NOME="Provai 2" ARQUIVO="videos\\clipe.mp4" ARQUIVO_INFO="I"/>' +
  '</ROWDATA></DATAPACKET>'

describe('useScheduledStore', () => {
  beforeEach(() => {
    Object.keys(prefs).forEach((k) => delete prefs[k])
    setActivePinia(createPinia())
  })

  it('importa categorias e itens, merge por id', () => {
    const store = useScheduledStore()
    const changed = store.importFromDelphi(catsXml, itemsXml)
    expect(changed).toBe(2)
    expect(store.categories).toHaveLength(1)
    expect(store.categories[0]!.name).toBe('Provai e Vede')
    expect(store.items).toHaveLength(2)
    expect(store.items[0]!.date).toBe('2026-10-12')
    expect(store.items[1]!.isRelativePath).toBe(true)

    // itemsOn por data
    expect(store.itemsOn('2026-10-12')).toHaveLength(1)
    expect(store.itemsOn('2026-10-19')).toHaveLength(1)
    expect(store.itemsOn('2026-10-20')).toHaveLength(0)

    // merge substitui
    store.importFromDelphi('', '<DATAPACKET><ROWDATA>' +
      '<ROW ID="i1" CATEGORIA="c1" DATA="12/10/2026" NOME="Atualizado"/>' +
      '</ROWDATA></DATAPACKET>')
    expect(store.items).toHaveLength(2)
    expect(store.items.find((i) => i.id === 'i1')!.name).toBe('Atualizado')
  })

  it('DATA inválida é pulada', () => {
    const store = useScheduledStore()
    const changed = store.importFromDelphi(
      '',
      '<DATAPACKET><ROWDATA><ROW ID="x" DATA="não-data" NOME="sem data"/></ROWDATA></DATAPACKET>',
    )
    expect(changed).toBe(0)
  })

  it('persiste via user preferences', () => {
    const store = useScheduledStore()
    store.importFromDelphi(catsXml, itemsXml)
    const saved = prefs['user_data'] as
      | Record<string, { categories: unknown[]; items: unknown[] }>
      | undefined
    expect(saved).toBeTruthy()
    const state = saved!['scheduled.state']!
    expect(state.items).toHaveLength(2)
  })
  it('datas TDateTime float (serial Delphi) também parseiam', () => {
    const store = useScheduledStore()
    const changed = store.importFromDelphi('', '<DATAPACKET><ROWDATA>' +
      '<ROW ID="f1" CATEGORIA="" DATA="46023" NOME="float date"/>' +
      '</ROWDATA></DATAPACKET>')
    expect(changed).toBe(1)
    expect(store.items[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('volume: 5000 itens sem quebrar', () => {
    const store = useScheduledStore()
    const rows = Array.from({ length: 5000 }, (_, i) =>
      '<ROW ID="v' + i + '" CATEGORIA="c1" DATA="12/10/2026" NOME="Item ' + i + '"/>',
    ).join('')
    const changed = store.importFromDelphi(
      '<DATAPACKET><ROWDATA><ROW ID="c1" NOME="Volume"/></ROWDATA></DATAPACKET>',
      '<DATAPACKET><ROWDATA>' + rows + '</ROWDATA></DATAPACKET>',
    )
    expect(changed).toBe(5000)
    expect(store.itemsOn('2026-10-12')).toHaveLength(5000)
  })

  it('categoryName: achado e não achado (null)', () => {
    const store = useScheduledStore()
    store.importFromDelphi(catsXml, itemsXml)
    expect(store.categoryName('c1')).toBe('Provai e Vede')
    expect(store.categoryName('inexistente')).toBeNull()
  })

  it('loadState tolera prefs parciais (sem categories / sem items)', () => {
    prefs['user_data'] = {
      'scheduled.state': { items: [{ id: 'só' }] },
    }
    const store = useScheduledStore()
    expect(store.categories).toEqual([])
    expect(store.items).toEqual([{ id: 'só' }])
    prefs['user_data'] = { 'scheduled.state': null }
    setActivePinia(createPinia()) // state roda 1x por pinia — pinia novo recarrega
    const store2 = useScheduledStore()
    expect(store2.categories).toEqual([])
    expect(store2.items).toEqual([])
  })

  it('categoria duplicada / sem ID são puladas', () => {
    const store = useScheduledStore()
    const changed = store.importFromDelphi(
      '<DATAPACKET><ROWDATA>' +
        '<ROW ID="c1" NOME="Primeira"/>' +
        '<ROW ID="" NOME="Sem id"/>' +
        '<ROW ID="c1" NOME="Duplicada"/>' +
        '</ROWDATA></DATAPACKET>',
      itemsXml,
    )
    expect(store.categories).toHaveLength(1)
    expect(store.categories[0]!.name).toBe('Primeira')
    expect(changed).toBe(2)
  })

  it('item sem ID é pulado; DATA vazia vira null', () => {
    const store = useScheduledStore()
    const changed = store.importFromDelphi(
      '',
      '<DATAPACKET><ROWDATA>' +
        '<ROW ID="" DATA="12/10/2026"/>' +
        '<ROW ID="ok" DATA=""/></ROWDATA></DATAPACKET>',
    )
    expect(changed).toBe(0)
    expect(store.items).toHaveLength(0)
  })

  it('importFromDelphi com itemsXml null; NOME ausente vira string vazia', () => {
    const store = useScheduledStore()
    const changed = store.importFromDelphi(
      '<DATAPACKET><ROWDATA><ROW ID="c9"/></ROWDATA></DATAPACKET>',
      null,
    )
    expect(changed).toBe(0)
    expect(store.categories).toEqual([{ id: 'c9', name: '' }])
  })

  it('categorias pré-existentes não duplicam no reimport', () => {
    const store = useScheduledStore()
    store.importFromDelphi(catsXml, itemsXml)
    const before = store.categories.length
    store.importFromDelphi(catsXml, itemsXml) // reimport: catIds.has → continue
    expect(store.categories).toHaveLength(before)
    // parseDelphiDate: valor não-numérico e não-data → null (item pulado)
    const changed = store.importFromDelphi(
      '',
      '<DATAPACKET><ROWDATA><ROW ID="z1" DATA="###"/></ROWDATA></DATAPACKET>',
    )
    expect(changed).toBe(0)
  })

  it('atributos ausentes (não vazios) caem nos defaults', () => {
    const store = useScheduledStore()
    const changed = store.importFromDelphi(
      '<DATAPACKET><ROWDATA><ROW NOME="sem id"/></ROWDATA></DATAPACKET>',
      '<DATAPACKET><ROWDATA>' +
        '<ROW NOME="sem id nenhum" DATA="12/10/2026"/>' + // sem ID nem CATEGORIA
        '<ROW ID="s1" NOME="sem DATA"/>' + // sem DATA
        '</ROWDATA></DATAPACKET>',
    )
    // 1º: sem ID → pulado; 2º: sem DATA → pulado
    expect(changed).toBe(0)
    // agora um válido sem CATEGORIA/ARQUIVO/ARQUIVO_INFO/NOME: defaults aplicados
    const changed2 = store.importFromDelphi(
      '',
      '<DATAPACKET><ROWDATA><ROW ID="s2" DATA="13/10/2026"/></ROWDATA></DATAPACKET>',
    )
    expect(changed2).toBe(1)
    expect(store.items[0]).toMatchObject({
      id: 's2',
      categoryId: '',
      filePath: '',
      isRelativePath: false,
    })
  })
})
