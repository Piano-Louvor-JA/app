// @vitest-environment jsdom
/**
 * Gap-fill 2 do useLiturgyStore — arms restantes do merge de cobertura:
 * currentNotes/currentItem fallbacks, importJaDays (overwrite/merge/dupes),
 * countJaDuplicates, enrichJaDurations (probe de vídeo), saveItemDraft
 * mesma categoria, removeItem índice inválido, categoria sem filhos,
 * markItemDone ramais, reorder seleção, selectItem tipos site/vídeo,
 * playItemOnScreens falha de projeção, syncSiteProjectionState ramais
 * (sem métodos, projetando, video já setado), clone ramais (custom vazio,
 * custom sem current, onMusicPick sem duração).
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
const playLiturgyItemOnScreens = vi.fn()
vi.mock('../../services/liturgy-actions', () => ({
  executeLiturgyItem: (...a: unknown[]) => executeLiturgyItem(...(a as [])),
  openLiturgyMusicPlayer: vi.fn(),
  playLiturgyItemOnScreens: (...a: unknown[]) =>
    playLiturgyItemOnScreens(...(a as [])),
}))
vi.mock('../../services/liturgy-catalog', () => ({
  filterLiturgyMusicOptions: vi.fn((opts: unknown[]) => opts),
  loadLiturgyBibleBooks: vi.fn(async () => []),
  loadLiturgyMusicOptions: vi.fn(async () => []),
}))
vi.mock('../../services/liturgy-web-runtime', () => ({
  clearLiturgyWebRuntime: vi.fn(),
}))
const probeMediaDurationMs = vi.fn(async () => 0)
vi.mock('../../services/media-probe', () => ({
  probeMediaDurationMs: (p: string) => probeMediaDurationMs(p),
}))

import { useLiturgyStore } from '../useLiturgyStore'
import { LITURGY_WEEKDAYS, type LiturgyItem } from '../../types/liturgy'

let seq = 0
const mkItem = (over: Partial<LiturgyItem> = {}): LiturgyItem => ({
  id: `g${++seq}`,
  type: 'other_files',
  name: `Item ${seq}`,
  subtitle: '',
  done: false,
  durationMs: 0,
  accentColor: '',
  ...over,
})

describe('useLiturgyStore — gaps2', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    bridgeMock.bridge = null
    probeMediaDurationMs.mockResolvedValue(0)
  })

  it('currentNotes/currentItem fallbacks: dia sem nota e sem seleção', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    expect(store.currentNotes).toBe('') // dayNotes[dia] ?? ''
    expect(store.selectedItem).toBeNull() // ?? null sem seleção
  })

  it('importJaDays overwrite: substitui dia e conta adicionados', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.weekdays[LITURGY_WEEKDAYS[0]!] = [mkItem({ name: 'Antigo' })] as never
    const r = await store.importJaDays(
      { [LITURGY_WEEKDAYS[0]!]: [mkItem({ name: 'Novo' })] },
      'overwrite',
    )
    expect(r.added).toBe(1)
    expect(r.days).toEqual([LITURGY_WEEKDAYS[0]])
    expect((store.currentItems as LiturgyItem[])[0]!.name).toBe('Novo')
  })

  it('importJaDays merge: pula duplicatas e adiciona novos; parsed com dia ausente', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[1]!
    const dup = mkItem({ type: 'music', name: 'Hino', musicId: 7 })
    store.weekdays[LITURGY_WEEKDAYS[1]!] = [dup] as never
    const r = await store.importJaDays(
      {
        [LITURGY_WEEKDAYS[1]!]: [
          { ...dup, id: 'x1' }, // duplicata
          mkItem({ name: 'Novo' }), // novo
        ],
        [LITURGY_WEEKDAYS[2]!]: undefined, // dia sem array (?? [])
      },
      'merge',
    )
    expect(r.skipped).toBe(1)
    expect(r.added).toBe(1)
    expect(r.hasDuplicates).toBe(true)
  })

  it('countJaDuplicates conta duplicatas por tipo/nome/musicId/filePath', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const dup = mkItem({ type: 'music', name: 'H', musicId: 3 })
    store.weekdays[LITURGY_WEEKDAYS[0]!] = [dup] as never
    const n = store.countJaDuplicates({
      [LITURGY_WEEKDAYS[0]!]: [{ ...dup, id: 'z' }, mkItem({ name: 'Outro' })],
      [LITURGY_WEEKDAYS[5]!]: undefined,
    })
    expect(n).toBe(1)
  })

  it('enrichJaDurations: música do catálogo usa durationMs; vídeo com probe > 0 atualiza', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.musicList = [
      { id: 9, name: 'M', durationMs: 42000 },
    ] as never
    probeMediaDurationMs.mockResolvedValue(65000)
    // Dias são processados em sequência (await por dia): o 2º dia pega
    // o cache de probe do 1º — 1 chamada de probe só.
    await store.importJaDays(
      {
        [LITURGY_WEEKDAYS[0]!]: [
          mkItem({ type: 'music', musicId: 9, durationMs: 0 }),
          mkItem({ type: 'video', filePath: '/v.mp4', durationMs: 0 }),
        ],
        [LITURGY_WEEKDAYS[1]!]: [
          mkItem({ type: 'video', filePath: '/v.mp4', durationMs: 0 }),
        ],
      },
      'overwrite',
    )
    expect(probeMediaDurationMs).toHaveBeenCalledTimes(1)
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const items = store.currentItems as LiturgyItem[]
    expect(items[0]!.durationMs).toBe(42000)
    expect(items[1]!.durationMs).toBe(65000)
    store.selectedDay = LITURGY_WEEKDAYS[1]!
    expect((store.currentItems as LiturgyItem[])[0]!.durationMs).toBe(65000)
  })

  it('enrichJaDurations: probe 0 mantém durationMs 0; música sem match fica', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[6]!
    await store.importJaDays(
      {
        [LITURGY_WEEKDAYS[6]!]: [
          mkItem({ type: 'video', filePath: '/n.mp4', durationMs: 0 }),
          mkItem({ type: 'music', musicId: 404, durationMs: 0 }),
        ],
      },
      'overwrite',
    )
    const items = store.currentItems as LiturgyItem[]
    expect(items[0]!.durationMs).toBe(0)
    expect(items[1]!.durationMs).toBe(0)
  })

  it('saveItemDraft: edição na mesma categoria substitui in place (L731)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const cat = mkItem({ type: 'category', name: 'C' })
    const child = mkItem({ categoryId: cat.id, name: 'F1' })
    store.currentItems = [cat, child] as never
    store.editingIndex = 1
    store.itemDraft = {
      ...store.itemDraft,
      type: 'other_files',
      name: 'F1 editado',
      categoryId: cat.id, // mesma categoria
    } as never
    expect(store.saveItemDraft()).toBe(true)
    expect((store.currentItems as LiturgyItem[])[1]!.name).toBe('F1 editado')
  })

  it('removeItem: índice inexistente não faz nada (L750)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.currentItems = [mkItem()] as never
    store.removeItem(9)
    expect(store.currentItems).toHaveLength(1)
  })

  it('toggleItemDone: categoria sem filhos mantém done próprio (L798)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const catVazia = mkItem({ type: 'category', name: 'Vazia' })
    const cat = mkItem({ type: 'category', name: 'Com filho' })
    const child = mkItem({ categoryId: cat.id })
    store.currentItems = [catVazia, cat, child] as never
    store.toggleItemDone(1)
    const items = store.currentItems as LiturgyItem[]
    expect(items[1]!.done).toBe(true)
    expect(items[2]!.done).toBe(true)
    expect(items[0]!.done).toBe(false) // sem filhos: sync não altera
  })

  it('toggleItemDone: nextDone com categoria limpa seleção da categoria (L844)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const cat = mkItem({ type: 'category', name: 'C' })
    const child = mkItem({ categoryId: cat.id })
    store.currentItems = [cat, child] as never
    store.selectedItemIndex = 0
    store.toggleItemDone(1) // marca filho → sync marca cat → limpa seleção na cat
    expect(store.selectedItemIndex).toBeNull()
  })

  it('selectItem ok em categoria/mídia: markItemDone ramais (L852/853/861-863)', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    executeLiturgyItem.mockResolvedValue({ ok: true, messageKey: 'ok' })
    const cat = mkItem({ type: 'category', name: 'C' })
    const item = mkItem({ type: 'video', name: 'V' })
    store.currentItems = [cat, item] as never
    // categoria → markItemDone return (tipo category)
    await store.selectItem(0, {} as never)
    expect((store.currentItems as LiturgyItem[])[0]!.done).toBe(false)
    // vídeo ok → done true; repetido (done) → return
    await store.selectItem(1, {} as never)
    expect((store.currentItems as LiturgyItem[])[1]!.done).toBe(true)
    await store.selectItem(1, {} as never)
    expect((store.currentItems as LiturgyItem[])[1]!.done).toBe(true)
    // tipo não-play (other_files) → isLiturgyMediaPlayType false → return
    const nota = mkItem({ type: 'other_files', name: 'N' })
    store.currentItems = [nota] as never
    await store.selectItem(0, {} as never)
    expect((store.currentItems as LiturgyItem[])[0]!.done).toBe(false)
  })

  it('selectItem ok com categoryId: limpa seleção da categoria concluída (L861-863)', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    executeLiturgyItem.mockResolvedValue({ ok: true, messageKey: 'ok' })
    const cat = mkItem({ type: 'category', name: 'C' })
    const child = mkItem({ categoryId: cat.id, type: 'video' })
    store.currentItems = [cat, child] as never
    store.selectedItemIndex = 0 // seleção aponta pra categoria
    await store.selectItem(1, {} as never) // filho ok → sync marca cat
    const items = store.currentItems as LiturgyItem[]
    expect(items[0]!.done).toBe(true)
    expect(store.selectedItemIndex).toBeNull()
  })

  it('selectItem: site zera siteProjection; tipos de vídeo zeram videoProjection', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    executeLiturgyItem.mockResolvedValue({ ok: false, messageKey: 'x' })
    store.currentItems = [
      mkItem({ type: 'site', name: 'S' }),
      mkItem({ type: 'online_video', name: 'OV' }),
      mkItem({ type: 'images', name: 'IM' }),
      mkItem({ type: 'pdf', name: 'PDF' }),
      mkItem({ type: 'presentation', name: 'PRE' }),
    ] as never
    store.siteProjectionItemId = 's1'
    store.videoProjectionItemId = 'v1'
    await store.selectItem(0, {} as never)
    expect(store.siteProjectionItemId).toBeNull()
    for (const idx of [1, 2, 3, 4]) {
      store.videoProjectionItemId = 'v1'
      await store.selectItem(idx, {} as never)
      expect(store.videoProjectionItemId).toBeNull()
    }
  })

  it('playItemOnScreens: falha em vídeo zera videoProjectionItemId (L1015/1023)', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    playLiturgyItemOnScreens.mockResolvedValue({ ok: false } as never)
    store.currentItems = [mkItem({ type: 'video', name: 'V' })] as never
    store.videoProjectionItemId = 'v9'
    await store.playItemOnScreens(0)
    expect(store.videoProjectionItemId).toBeNull()
  })

  it('syncSiteProjectionState: bridge sem métodos get → nulls (L1049/1050)', async () => {
    const store = useLiturgyStore()
    bridgeMock.bridge = { projection: {} }
    store.siteProjectionItemId = 's'
    await store.syncSiteProjectionState()
    expect(store.siteProjectionItemId).toBeNull() // siteState null
  })

  it('syncSiteProjectionState: site projetando com seleção site usa selecionado (L1061/1065)', async () => {
    const store = useLiturgyStore()
    bridgeMock.bridge = {
      projection: {
        getNavigationState: vi.fn(async () => ({ projecting: true })),
        getPlaybackState: vi.fn(async () => ({ projecting: false })),
      },
    }
    const site = mkItem({ type: 'site', name: 'Site' })
    store.currentItems = [site] as never
    store.selectedItemIndex = 0
    await store.syncSiteProjectionState()
    expect(store.siteProjectionItemId).toBe(site.id)
  })

  it('syncSiteProjectionState: site projetando sem seleção acha primeiro site (L1061[0])', async () => {
    const store = useLiturgyStore()
    bridgeMock.bridge = {
      projection: {
        getNavigationState: vi.fn(async () => ({ projecting: true })),
        getPlaybackState: vi.fn(async () => ({ projecting: false })),
      },
    }
    const site = mkItem({ type: 'site', name: 'Site2' })
    store.currentItems = [mkItem({ name: 'outro' }), site] as never
    store.selectedItemIndex = null
    await store.syncSiteProjectionState()
    expect(store.siteProjectionItemId).toBe(site.id)
  })

  it('syncSiteProjectionState: vídeo projetando com id já setado retorna (L1082)', async () => {
    const store = useLiturgyStore()
    bridgeMock.bridge = {
      projection: {
        getNavigationState: vi.fn(async () => ({ projecting: false })),
        getPlaybackState: vi.fn(async () => ({ projecting: true })),
      },
    }
    store.videoProjectionItemId = 'ja-tem'
    await store.syncSiteProjectionState()
    expect(store.videoProjectionItemId).toBe('ja-tem')
  })

  it('syncSiteProjectionState: vídeo projetando sem id usa seleção ou primeiro (L1094/1105)', async () => {
    const store = useLiturgyStore()
    const video = mkItem({ type: 'video', name: 'V' })
    bridgeMock.bridge = {
      projection: {
        getNavigationState: vi.fn(async () => ({ projecting: false })),
        getPlaybackState: vi.fn(async () => ({ projecting: true })),
      },
    }
    // seleção é o vídeo
    store.currentItems = [video] as never
    store.selectedItemIndex = 0
    await store.syncSiteProjectionState()
    expect(store.videoProjectionItemId).toBe(video.id)
    // sem seleção: acha primeiro vídeo da lista
    store.videoProjectionItemId = null
    store.selectedItemIndex = null
    await store.syncSiteProjectionState()
    expect(store.videoProjectionItemId).toBe(video.id)
  })

  it('clone: custom vazio → null; selectedDay custom sem current → return (L1186/1194)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const custom = store.customLiturgies[0]
    // custom com items vazios: cria custom e clona key custom direto
    store.openCustomDialog()
    store.newCustomName = 'Vazia'
    store.createCustomLiturgy()
    const c = store.customLiturgies[store.customLiturgies.length - 1]!
    store.currentItems = [] as never
    store.cloneSourceKey = `custom:${c.id}`
    store.cloneLiturgyFromSelected() // items vazios → null → return
    expect(store.currentItems).toHaveLength(0)
    // selectedDay custom sem currentCustom: limpar customs
    store.selectedDay = 'custom'
    store.customLiturgies = [] as never
    store.selectedCustomIndex = 0
    store.cloneSourceKey = `custom:${c.id}`
    store.cloneLiturgyFromSelected() // L1194 → return
    expect(store.currentItems).toHaveLength(0)
    void custom
  })

  it('onMusicPick: música sem durationMs → 0; música inexistente → musicId com 0 (L1221)', () => {
    const store = useLiturgyStore()
    store.musicList = [
      { id: 1, name: 'Com duração', durationMs: 90000 },
      { id: 2, name: 'Sem duração', durationMs: 0 },
    ] as never
    store.onMusicPick(1)
    expect(store.itemDraft.musicId).toBe(1)
    expect(store.itemDraft.durationMs).toBe(90000)
    store.onMusicPick(2)
    expect(store.itemDraft.durationMs).toBe(0)
    store.onMusicPick(99)
    expect(store.itemDraft.musicId).toBe(99)
    expect(store.itemDraft.durationMs).toBe(0)
  })

  it('gaps2b: selectedItem índice fora → null; dentro → item', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.currentItems = [mkItem({ name: 'A' })] as never
    store.selectedItemIndex = 0
    expect((store.selectedItem as LiturgyItem | null)?.name).toBe('A')
    store.selectedItemIndex = 9
    expect(store.selectedItem).toBeNull()
  })

  it('gaps2b: enrich other_files com filePath → probe (L457 arm other_files)', async () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[3]!
    probeMediaDurationMs.mockResolvedValue(5000)
    await store.importJaDays(
      {
        [LITURGY_WEEKDAYS[3]!]: [
          mkItem({ type: 'other_files', filePath: '/a.pdf', durationMs: 0 }),
        ],
      },
      'overwrite',
    )
    expect((store.currentItems as LiturgyItem[])[0]!.durationMs).toBe(5000)
  })

  it('gaps2b: removeItem real não-categoria e categoria com filho (L753)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const cat = mkItem({ type: 'category', name: 'C' })
    const child = mkItem({ categoryId: cat.id, name: 'F' })
    const solto = mkItem({ name: 'S' })
    store.currentItems = [cat, child, solto] as never
    store.removeItem(2) // não-categoria: remove só ele (L753 false-arm)
    let items = store.currentItems as LiturgyItem[]
    expect(items.map((i) => i.name)).toEqual(['C', 'F'])
    store.removeItem(0) // categoria: remove filhos junto
    items = store.currentItems as LiturgyItem[]
    expect(items.map((i) => i.name)).toEqual([])
  })

  it('gaps2b: reorder sem seleção (L880 arm selectedId falsy)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    const a = mkItem({ name: 'A' })
    const b = mkItem({ name: 'B' })
    store.currentItems = [a, b] as never
    store.selectedItemIndex = null
    store.reorderItems(0, 1)
    expect((store.currentItems as LiturgyItem[]).map((i) => i.name)).toEqual(['B', 'A'])
    expect(store.selectedItemIndex).toBeNull()
  })

  it('gaps2b: toggleVideoScreens falsy → id null (L999 arm toggled falsy)', async () => {
    const store = useLiturgyStore()
    bridgeMock.bridge = {
      projection: {
        getPlaybackState: vi.fn(async () => ({ projecting: false })),
        toggleVideoScreens: vi.fn(async () => undefined),
      },
    }
    const video = mkItem({ type: 'video', name: 'V' })
    store.currentItems = [video] as never
    store.videoProjectionItemId = video.id
    await store.playItemOnScreens(0)
    expect(store.videoProjectionItemId).toBeNull()
  })

  it('gaps2b: sync sem siteState e id já null (L1054 arm null); site projetando com id setado (L1058)', async () => {
    const store = useLiturgyStore()
    // bridge com projection SEM métodos → siteState null; id já null
    bridgeMock.bridge = { projection: {} }
    store.siteProjectionItemId = null
    await store.syncSiteProjectionState()
    expect(store.siteProjectionItemId).toBeNull()
    // site projetando com id já setado: não recalcula
    bridgeMock.bridge = {
      projection: {
        getNavigationState: vi.fn(async () => ({ projecting: true })),
        getPlaybackState: vi.fn(async () => ({ projecting: false })),
      },
    }
    store.siteProjectionItemId = 'mantem'
    await store.syncSiteProjectionState()
    expect(store.siteProjectionItemId).toBe('mantem')
  })

  it('gaps2b: removeCustomLiturgy clamp do selectedCustomIndex (L1151)', () => {
    const store = useLiturgyStore()
    store.openCustomDialog()
    store.newCustomName = 'C1'
    store.createCustomLiturgy()
    store.openCustomDialog()
    store.newCustomName = 'C2'
    store.createCustomLiturgy()
    expect(store.customLiturgies).toHaveLength(2)
    store.selectedCustomIndex = 1
    store.removeCustomLiturgy(1) // remove o último → clamp 0
    expect(store.customLiturgies).toHaveLength(1)
    expect(store.selectedCustomIndex).toBe(0)
  })

  it('gaps2b: weekday key com items vazios → null (L1189); removeCustom não-último (L1157 false)', () => {
    const store = useLiturgyStore()
    store.selectedDay = LITURGY_WEEKDAYS[0]!
    store.weekdays[LITURGY_WEEKDAYS[4]!] = [] as never
    // resolveCloneSourceItems via cloneLiturgyFromSelected: key weekday dia vazio → null → return
    store.cloneSourceKey = `weekday:${LITURGY_WEEKDAYS[4]}`
    store.cloneLiturgyFromSelected()
    expect(store.currentItems).toHaveLength(0)
    // removeCustom com índice válido restante: sem clamp
    store.openCustomDialog()
    store.newCustomName = 'A'
    store.createCustomLiturgy()
    store.openCustomDialog()
    store.newCustomName = 'B'
    store.createCustomLiturgy()
    store.selectedCustomIndex = 0
    store.removeCustomLiturgy(0)
    expect(store.customLiturgies).toHaveLength(1)
    expect(store.selectedCustomIndex).toBe(0)
  })
})
