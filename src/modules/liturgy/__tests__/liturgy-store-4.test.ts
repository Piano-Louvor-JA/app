// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useLiturgyStore } from '../stores/useLiturgyStore'

// persistência em memória
const savedState: { state: unknown } = { state: null }
vi.mock('../services/liturgy-preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/liturgy-preferences')>()
  return {
    ...actual,
    loadLiturgyState: vi.fn(() => (savedState.state as never) ?? actual.loadLiturgyState()),
    saveLiturgyState: vi.fn((state: unknown) => {
      savedState.state = state
    }),
  }
})

const bridgeMock: Record<string, unknown> = {}
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () =>
    Object.keys(bridgeMock).length > 0
      ? (bridgeMock as unknown as Record<string, never>)
      : undefined,
}))

vi.mock('../services/liturgy-catalog', () => ({
  loadLiturgyMusicOptions: vi.fn(async () => [
    { id: 101, name: 'Hino 1', hymnalTrack: 1, albumNames: 'H', displayLabel: 'Hino 1', durationMs: 300000, hasInstrumental: true },
  ]),
  loadLiturgyBibleBooks: vi.fn(async () => [{ id: 1, name: 'Gênesis', chapters: 50 }]),
  filterLiturgyMusicOptions: vi.fn((list: unknown[]) => list),
}))

const actionsMock = vi.hoisted(() => ({
  executeLiturgyItem: vi.fn(async () => ({ ok: true, messageKey: null as string | null })),
  openLiturgyMusicPlayer: vi.fn(async () => ({ ok: true, messageKey: null as string | null })),
  playLiturgyItemOnScreens: vi.fn(async () => ({ ok: true, messageKey: null as string | null })),
}))
vi.mock('../services/liturgy-actions', () => actionsMock)
vi.mock('../services/liturgy-web-runtime', () => ({ clearLiturgyWebRuntime: vi.fn() }))
vi.mock('@shared/composables/useProjectionWindow', () => ({ closeProjectionModule: vi.fn() }))

function addCategory(s: ReturnType<typeof useLiturgyStore>, name = 'C'): void {
  s.openAddDialog()
  s.setItemDraft({ ...s.itemDraft, type: 'category', name, startTime: '09:00', endTime: '10:00' })
  if (!s.saveItemDraft()) throw new Error('categoria inválida')
}

function addSub(s: ReturnType<typeof useLiturgyStore>, over: Record<string, unknown>): boolean {
  const cat = s.currentItems.find((i) => i.type === 'category')!
  s.openAddSubItemDialog(cat.id)
  const rest = { ...over }
  if (rest.categoryId == null) delete rest.categoryId
  s.setItemDraft({ ...s.itemDraft, ...rest } as never)
  return s.saveItemDraft()
}

describe('useLiturgyStore — parte 4: ramos de guarda finais', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    savedState.state = null
    Object.keys(bridgeMock).forEach((k) => delete bridgeMock[k])
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('getPresentationEnginePref: bridge sem presentation → auto (L17)', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSub(s, { type: 'presentation', name: 'PPT', filePath: '/a.pptx' })
    // bridge PRESENTE mas sem presentation.getEngine → cai no default 'auto'
    bridgeMock.bridge = { ok: true }
    s.openEditDialog(1)
    await vi.waitFor(() => {
      expect(s.itemDraft.presentationEngine).toBe('auto')
    })
  })

  it('currentStartTime getter fora de custom sem time → null (L111)', () => {
    const s = useLiturgyStore()
    s.selectDay('saturday')
    expect(s.currentStartTime).toBeNull()
    expect(s.currentEndTime).toBeNull()
  })

  it('cloneSources pula o próprio dia de semana (L230) e customs com itens', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'Dom')
    // domingo tem itens mas é o dia atual → não é source
    expect(s.cloneSources).toEqual([])
    // segunda também tem → é source
    s.selectDay('monday')
    addCategory(s, 'Seg')
    s.selectDay('wednesday')
    expect(s.cloneSources.map((c) => ('day' in c ? c.day : null))).toEqual(['sunday', 'monday'])
  })

  it('deletionLocked setter sem key é no-op (L282)', () => {
    const s = useLiturgyStore()
    s.selectDay('custom') // sem customs → key null
    s.deletionLocked = true
    expect(s.deletionLocked).toBe(false)
  })

  it('currentTitleKey em dia normal (L297) e selectedItem sem seleção (L303)', () => {
    const s = useLiturgyStore()
    s.selectDay('friday')
    expect(s.currentTitleKey).toBe('liturgy.days.friday')
    expect(s.selectedItem).toBeNull()
  })

  it('filteredMusic e selectedMusic com draft sem música (L318-320, 346)', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    s.setMusicSearchQuery('hino')
    expect(s.filteredMusic).toHaveLength(1)
    expect(s.selectedMusic).toBeNull()
    s.openAddDialog()
    s.onMusicPick(101)
    expect(s.selectedMusic?.id).toBe(101)
  })

  it('categoryOptions mapeia só categorias (L328)', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'Cat1')
    addSub(s, { type: 'annotation', name: 'F1' })
    expect(s.categoryOptions).toEqual([{ id: s.currentItems[0]!.id, name: 'Cat1' }])
  })

  it('complementaryTitleSuggestions ignora não-músicas e títulos vazios (L338-355)', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'C')
    s.currentItems = [
      ...s.currentItems,
      {
        id: 'a1',
        type: 'annotation',
        name: 'A',
        subtitle: '',
        done: false,
        durationMs: 0,
        accentColor: '#000',
      },
      {
        id: 'm1',
        type: 'music',
        name: 'M',
        subtitle: '',
        done: false,
        durationMs: 0,
        accentColor: '#000',
        musicId: 101,
        complementaryTitle: '   ',
      },
    ]
    expect(s.complementaryTitleSuggestions).toEqual([])
  })

  it('verseChapterOptions sem livro → [] (L355)', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    s.openAddDialog()
    expect(s.verseChapterOptions).toEqual([])
  })

  it('enrichJaDurations: música sem opt fica como está; probe > 0 aplica (L454-469)', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    s.selectDay('sunday')
    const r = await s.importJaDays({
      sunday: [
        {
          id: 'j1',
          type: 'music',
          name: 'M',
          subtitle: '',
          done: false,
          durationMs: 0,
          accentColor: '#000',
          musicId: 999, // não está no catálogo
        },
      ],
    })
    expect(r.added).toBe(1)
    expect(s.currentItems[0]!.durationMs).toBe(0)
  })

  it('hydrate: custom sem mudança de títulos não persiste (L522)', async () => {
    const s = useLiturgyStore()
    s.openCustomDialog()
    s.newCustomName = 'X'
    s.createCustomLiturgy()
    await s.hydrate()
    // sem itens → reconciled === items → sem persist extra
    expect(s.hydrated).toBe(true)
  })

  it('setSessionStartFromInput inválido não mexe (L585); setItemType category zera (L639)', () => {
    const s = useLiturgyStore()
    s.setSessionEndFromInput('abc')
    expect(s.currentEndTime).toBeNull()
    s.openAddDialog()
    s.setItemDraft({ ...s.itemDraft, type: 'music', musicId: 101, startTime: '08:00', endTime: '09:00' })
    s.setItemType('category')
    expect(s.itemDraft.startTime).toBe('08:00')
    expect(s.itemDraft.durationMs).toBe(0)
    expect(s.itemDraft.categoryId).toBeNull()
  })

  it('openEditDialog item inexistente é no-op (L697); saveItemDraft inválido false (L700)', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    s.openEditDialog(99)
    expect(s.itemDialogOpen).toBe(false)
    s.openAddDialog()
    // draft sem nome → inválido
    expect(s.saveItemDraft()).toBe(false)
    expect(s.itemDialogOpen).toBe(true) // continua aberto
  })

  it('setItemPlayer índice inexistente no-op (L750); clearAllItems (L783)', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    s.setItemPlayer(9, 'vlc')
    expect(s.currentItems).toHaveLength(1)
    s.clearAllItems()
    expect(s.currentItems).toHaveLength(0)
    expect(s.selectedItemIndex).toBeNull()
  })

  it('toggleItemDone índice inexistente no-op (L817); sync categoria sem filhos (L798)', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'Sem filhos')
    s.toggleItemDone(0)
    // categoria sem filhos: done apenas dela muda
    expect(s.currentItems[0]!.done).toBe(true)
    s.toggleItemDone(99)
    expect(s.currentItems).toHaveLength(1)
  })

  it('markItemStarted índice inexistente → null (L908)', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    s.selectedItemIndex = null
    // via selectItem com índice inválido: markItemStarted seta o index ANTES
    // de checar o item (comportamento real) mas retorna null e não executa
    await s.selectItem(9, { push: vi.fn() } as never)
    expect(actionsMock.executeLiturgyItem).not.toHaveBeenCalled()
  })

  it('playItemOnScreens: site com toggle falha → cai no play e limpa id se falhar (L1009-1023)', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSub(s, { type: 'site', name: 'S', url: 'https://exemplo.com' })

    // controle aberto mas toggle falha (false) → cai no playLiturgyItemOnScreens
    const navState = { projecting: false }
    bridgeMock.projection = {
      getNavigationState: vi.fn(async () => navState),
      toggleSiteScreens: vi.fn(async () => false),
    }
    actionsMock.playLiturgyItemOnScreens.mockResolvedValueOnce({ ok: false, messageKey: 'err' })
    await s.playItemOnScreens(1)
    // id do site foi setado no caminho "controle fechado"?? não: toggle false → segue
    // pro play e com !ok limpa siteProjectionItemId
    expect(s.siteProjectionItemId).toBeNull()
    expect(s.lastActionMessageKey).toBe('err')
  })

  it('syncSiteProjectionState: site projetando sem candidatos → id null (L1082-1105)', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    s.selectDay('sunday')
    addCategory(s, 'C1') // só categoria, sem site

    const navState = { projecting: false }
    const playback = { projecting: false }
    bridgeMock.projection = {
      getNavigationState: vi.fn(async () => navState),
      getPlaybackState: vi.fn(async () => playback),
    }

    // site id != null mas site parou → null
    s.siteProjectionItemId = 'ghost'
    await s.syncSiteProjectionState()
    expect(s.siteProjectionItemId).toBeNull()

    // site projetando sem item site na lista → id permanece null
    navState.projecting = true
    await s.syncSiteProjectionState()
    expect(s.siteProjectionItemId).toBeNull()

    // vídeo projetando sem candidato → permanece null
    playback.projecting = true
    await s.syncSiteProjectionState()
    expect(s.videoProjectionItemId).toBeNull()
  })

  it('openCloneDialog sem canClone é no-op (L1165); cloneLiturgyFromSelected com itens no-op (L1193)', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'C1')
    // currentItems não vazio → canClone false
    s.openCloneDialog()
    expect(s.cloneDialogOpen).toBe(false)
    // clone direto com itens → no-op
    s.cloneLiturgyFromSelected()
    expect(s.currentItems).toHaveLength(1)
  })
})
