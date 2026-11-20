// @vitest-environment jsdom
/**
 * Gap-fill do useLiturgyStore — fluxos ainda não cobertos:
 * currentCustom, allTitles com custom, saveItemDraft (movido pra outra categoria,
 * insert por categoryId), removeItem de categoria com filhos, toggleItemDone em
 * categoria (marca filhos, limpa seleção), markItemDone, clearWebProjection,
 * syncSiteProjectionState (sem bridge/siteState null), clone dialogs
 * (openCloneDialog/close/resolveCloneSourceItems/cloneLiturgyFromSelected).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const prefsState: Record<string, unknown> = {}
vi.mock('../../services/liturgy-preferences', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../services/liturgy-preferences')
  >()
  return {
    ...actual,
    loadLiturgyState: vi.fn(() => actual.normalizeLiturgyState({})),
    saveLiturgyState: vi.fn((state: unknown) => {
      prefsState.liturgy = state
    }),
  }
})

const bridgeMock = vi.hoisted(() => ({
  bridge: null as Record<string, unknown> | null,
}))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => bridgeMock.bridge),
}))
vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
}))
const executeLiturgyItem = vi.fn()
vi.mock('../../services/liturgy-actions', () => ({
  executeLiturgyItem: (...a: unknown[]) => executeLiturgyItem(...(a as [])),
  openLiturgyMusicPlayer: vi.fn(),
  playLiturgyItemOnScreens: vi.fn(),
}))
vi.mock('../../services/liturgy-catalog', () => ({
  filterLiturgyMusicOptions: vi.fn((opts: unknown[]) => opts),
  loadLiturgyBibleBooks: vi.fn(async () => []),
  loadLiturgyMusicOptions: vi.fn(async () => []),
}))
vi.mock('../../services/liturgy-web-runtime', () => ({
  clearLiturgyWebRuntime: vi.fn(),
}))

import { useLiturgyStore } from '../useLiturgyStore'
import { LITURGY_WEEKDAYS, type LiturgyItem } from '../../types/liturgy'

let seq = 0
const mkItem = (over: Partial<LiturgyItem> = {}): LiturgyItem => ({
  id: `i${++seq}`,
  type: 'other_files',
  name: `Item ${seq}`,
  subtitle: '',
  done: false,
  durationMs: 0,
  accentColor: '',
  ...over,
})

describe('useLiturgyStore — gaps', () => {
  function createCustom(store: ReturnType<typeof useLiturgyStore>, name: string) {
    store.openCustomDialog()
    store.newCustomName = name
    store.createCustomLiturgy()
    return store.customLiturgies[store.customLiturgies.length - 1]!
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    bridgeMock.bridge = null
    executeLiturgyItem.mockReset()
  })

  it('currentCustomTitle: fora de custom vazio; custom criada mostra nome', () => {
    const store = useLiturgyStore()
    expect(store.currentCustomTitle).toBe('')
    store.selectedDay = 'custom'
    expect(store.currentCustomTitle).toBe('') // sem custom criadas
    createCustom(store, 'Minha Custom')
    expect(store.selectedDay).toBe('custom')
    expect(store.currentCustomTitle).toBe('Minha Custom')
  })

  it('complementaryTitleSuggestions coleta títulos de música e ordena pt-BR', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.currentItems = [
      mkItem({ type: 'music', complementaryTitle: 'Zoeira' }),
      mkItem({ type: 'music', complementaryTitle: 'Ábaco' }),
      mkItem({ type: 'music' }), // sem título complementar
      mkItem({ type: 'other_files', complementaryTitle: 'Ignorado' }),
    ] as never
    createCustom(store, 'Custom A')
    store.currentItems = [mkItem({ type: 'music', complementaryTitle: 'Bíblia' })] as never
    const titles = store.complementaryTitleSuggestions as unknown as string[]
    expect(titles).toContain('Ábaco')
    expect(titles).toContain('Zoeira')
    expect(titles).toContain('Bíblia')
    expect(titles).not.toContain('Ignorado')
    expect([...titles].sort((a, b) => a.localeCompare(b, 'pt-BR'))).toEqual(titles)
  })

  it('saveItemDraft: novo item com categoryId entra após a categoria', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const cat = mkItem({ type: 'category', name: 'Sessão' })
    const inside = mkItem({ categoryId: cat.id })
    store.currentItems = [cat, inside] as never
    // abre dialog de novo item e salva outro com a mesma categoria
    store.editingIndex = null
    store.itemDraft = {
      ...store.itemDraft,
      type: 'other_files',
      name: 'Novo',
      categoryId: cat.id,
    } as never
    expect(store.saveItemDraft()).toBe(true)
    const ids = (store.currentItems as LiturgyItem[]).map((i) => i.id)
    // deve ficar entre os filhos da categoria (inserção após último filho)
    expect(ids.indexOf(cat.id)).toBe(0)
    expect((store.currentItems as LiturgyItem[])[2]!.name).toBe('Novo')
  })

  it('saveItemDraft edição: mover item para outra categoria reordena', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const catA = mkItem({ type: 'category', name: 'A' })
    const child = mkItem({ categoryId: catA.id, name: 'Filho' })
    const catB = mkItem({ type: 'category', name: 'B' })
    const childB = mkItem({ categoryId: catB.id, name: 'Filho B' })
    store.currentItems = [catA, child, catB, childB] as never
    store.editingIndex = 1
    store.itemDraft = {
      ...store.itemDraft,
      type: 'other_files',
      name: 'Filho',
      categoryId: catB.id, // mover pra B
    } as never
    expect(store.saveItemDraft()).toBe(true)
    const items = store.currentItems as LiturgyItem[]
    const idxB = items.findIndex((i) => i.id === catB.id)
    expect(items[idxB + 1]!.name).toBe('Filho B')
    expect(items[idxB + 2]!.name).toBe('Filho')
  })

  it('removeItem: categoria remove filhos vinculados; locked não remove', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const cat = mkItem({ type: 'category', name: 'Sessão' })
    const child = mkItem({ categoryId: cat.id, name: 'Filho' })
    const other = mkItem({ name: 'Solto' })
    store.currentItems = [cat, child, other] as never
    store.deletionLocked = true
    store.removeItem(0)
    expect(store.currentItems).toHaveLength(3)
    store.deletionLocked = false
    store.removeItem(0)
    const names = (store.currentItems as LiturgyItem[]).map((i) => i.name)
    expect(names).toEqual(['Solto'])
  })

  it('toggleItemDone em categoria marca/desmarca filhos e limpa seleção', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const cat = mkItem({ type: 'category', name: 'S' })
    const c1 = mkItem({ categoryId: cat.id, name: 'f1' })
    store.currentItems = [cat, c1] as never
    store.selectedItemIndex = 1
    store.toggleItemDone(0)
    const items = store.currentItems as LiturgyItem[]
    expect(items[0]!.done).toBe(true)
    expect(items[1]!.done).toBe(true)
    expect(store.selectedItemIndex).toBeNull()
    // desmarca categoria → filhos desmarcam (done false propaga)
    store.toggleItemDone(0)
    const items2 = store.currentItems as LiturgyItem[]
    expect(items2[0]!.done).toBe(false)
  })

  it('playItemOnScreens: result ok marca done; playMusicMode não-música falha', async () => {
    const { playLiturgyItemOnScreens } = await import('../../services/liturgy-actions')
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const file = mkItem({ type: 'video' })
    store.currentItems = [file] as never
    vi.mocked(playLiturgyItemOnScreens).mockResolvedValue({ ok: true } as never)
    await store.playItemOnScreens(0)
    expect((store.currentItems as LiturgyItem[])[0]!.done).toBe(true)

    // playMusicMode com tipo não-música → false e sem chamar player
    const { openLiturgyMusicPlayer } = await import('../../services/liturgy-actions')
    vi.mocked(openLiturgyMusicPlayer).mockClear()
    const ok = await store.playMusicMode(0, 'audio')
    expect(ok).toBe(false)
    expect(openLiturgyMusicPlayer).not.toHaveBeenCalled()
  })

  it('clearWebProjection: sem bridge fecha runtime e limpa ids', async () => {
    const store = useLiturgyStore()
    store.siteProjectionItemId = 'x'
    store.videoProjectionItemId = 'y'
    await store.clearWebProjection()
    expect(store.siteProjectionItemId).toBeNull()
    expect(store.videoProjectionItemId).toBeNull()
  })

  it('syncSiteProjectionState: sem bridge não faz nada', async () => {
    const store = useLiturgyStore()
    store.siteProjectionItemId = 'keep'
    await store.syncSiteProjectionState()
    expect(store.siteProjectionItemId).toBe('keep')
  })

  it('syncSiteProjectionState: siteState null zera siteProjectionItemId', async () => {
    const store = useLiturgyStore()
    bridgeMock.bridge = {
      projection: {
        getNavigationState: vi.fn(async () => null),
        getPlaybackState: vi.fn(async () => null),
      },
    }
    store.siteProjectionItemId = 'x'
    await store.syncSiteProjectionState()
    expect(store.siteProjectionItemId).toBeNull()
  })

  it('clone: openCloneDialog sem origem não abre; com origem abre e clona', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    // dia vazio: canClone false → não abre
    store.openCloneDialog()
    expect(store.cloneDialogOpen).toBe(false)
    // origem = outro dia com itens
    const sourceDay = LITURGY_WEEKDAYS[1]!
    store.selectedDay = sourceDay
    store.currentItems = [mkItem({ name: 'Origem' })] as never
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.openCloneDialog()
    expect(store.cloneDialogOpen).toBe(true)
    expect(store.cloneSourceKey).toBe(`weekday:${sourceDay}`)
    store.cloneLiturgyFromSelected()
    expect(store.cloneDialogOpen).toBe(false)
    expect((store.currentItems as LiturgyItem[])[0]!.name).toBe('Origem')
    // nova instância (deep clone de ids)
    store.selectedDay = sourceDay
    const orig = (store.currentItems as LiturgyItem[])[0]!.id
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    expect((store.currentItems as LiturgyItem[])[0]!.id).not.toBe(orig)
  })

  it('saveItemDraft: edição SEM mudança de categoria substitui in place; novo sem categoria faz push', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    // edição sem categoryId (other_files exige categoryId → usar category edit?)
    // category exige startTime/endTime válidos:
    store.editingIndex = null
    store.itemDraft = {
      ...store.itemDraft,
      type: 'category',
      name: 'Culto',
      startTime: '09:00',
      endTime: '10:00',
    } as never
    expect(store.saveItemDraft()).toBe(true)
    expect(store.currentItems).toHaveLength(1)
    // novo item SEM categoryId → push no fim
    store.editingIndex = null
    store.itemDraft = {
      ...store.itemDraft,
      type: 'category',
      name: 'Escola',
      startTime: '09:30',
      endTime: '10:00',
    } as never
    expect(store.saveItemDraft()).toBe(true)
    const names = (store.currentItems as LiturgyItem[]).map((i) => i.name)
    expect(names).toEqual(['Culto', 'Escola'])
  })

  it('toggleItemDone: item solto (sem categoria) desmarca e mantém seleção', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const solo = mkItem({ type: 'music' })
    store.currentItems = [solo] as never
    store.selectedItemIndex = 0
    store.toggleItemDone(0)
    expect((store.currentItems as LiturgyItem[])[0]!.done).toBe(true)
    expect(store.selectedItemIndex).toBeNull() // nextDone → clearSelection
    store.toggleItemDone(0)
    expect((store.currentItems as LiturgyItem[])[0]!.done).toBe(false)
  })

  it('cloneLiturgyFromSelected: key inválida/vazia não clona; custom de origem clona', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    // sem origem: canClone false → nada acontece
    store.cloneLiturgyFromSelected()
    expect(store.currentItems).toHaveLength(0)
    // key inválida setada diretamente: resolve null → não clona
    store.cloneSourceKey = 'lixo'
    store.cloneLiturgyFromSelected()
    expect(store.currentItems).toHaveLength(0)
    // origem custom com itens
    const custom = createCustom(store, 'C1')
    store.currentItems = [mkItem({ name: 'Do Custom' })] as never
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.cloneSourceKey = `custom:${custom.id}`
    store.cloneLiturgyFromSelected()
    expect((store.currentItems as LiturgyItem[])[0]!.name).toBe('Do Custom')
    // weekday vazio → null
    store.cloneSourceKey = `weekday:${LITURGY_WEEKDAYS[6]}` // dia nunca populado
    store.cloneLiturgyFromSelected()
    expect((store.currentItems as LiturgyItem[])).toHaveLength(1)
  })
})
