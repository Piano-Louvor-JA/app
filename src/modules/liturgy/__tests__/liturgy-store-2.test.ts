// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useLiturgyStore } from '../stores/useLiturgyStore'

// persistência em memória: hydrate precisa ler o que persist() salvou
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

// Bridge mockável por teste
const bridgeMock: Record<string, unknown> = {}
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () =>
    Object.keys(bridgeMock).length > 0
      ? (bridgeMock as unknown as ReturnType<
          typeof import('@shared/services/desktop-bridge')['getDesktopBridge']
        >)
      : undefined,
}))

vi.mock('../services/liturgy-catalog', () => ({
  loadLiturgyMusicOptions: vi.fn(async () => [
    { id: 101, name: 'Hino 1', hymnalTrack: 1, albumNames: 'Hinário', displayLabel: 'Hino 1', durationMs: 300000, hasInstrumental: true },
  ]),
  loadLiturgyBibleBooks: vi.fn(async () => []),
  filterLiturgyMusicOptions: vi.fn((list: unknown[]) => list),
}))

const actionsMock = vi.hoisted(() => ({
  executeLiturgyItem: vi.fn(async () => ({ ok: true, messageKey: null as string | null })),
  openLiturgyMusicPlayer: vi.fn(async () => ({ ok: true, messageKey: null as string | null })),
  playLiturgyItemOnScreens: vi.fn(async () => ({ ok: true, messageKey: null as string | null })),
}))
vi.mock('../services/liturgy-actions', () => actionsMock)

vi.mock('../services/liturgy-web-runtime', () => ({
  clearLiturgyWebRuntime: vi.fn(),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
}))

function addCategory(
  s: ReturnType<typeof useLiturgyStore>,
  name = 'Categoria',
): void {
  s.openAddDialog()
  s.setItemDraft({
    ...s.itemDraft,
    type: 'category',
    name,
    startTime: '09:00',
    endTime: '10:00',
  })
  if (!s.saveItemDraft()) throw new Error('categoria inválida')
}

function addSubDraft(
  s: ReturnType<typeof useLiturgyStore>,
  over: Partial<Parameters<typeof s.setItemDraft>[0]>,
): boolean {
  const cat = s.currentItems.find((i) => i.type === 'category')!
  s.openAddSubItemDialog(cat.id)
  const rest = { ...over } as Record<string, unknown>
  // categoryId do over só vale se explicitamente não-null (draft velho pode carregar null)
  if (rest.categoryId == null) delete rest.categoryId
  s.setItemDraft({ ...s.itemDraft, ...rest } as Parameters<typeof s.setItemDraft>[0])
  return s.saveItemDraft()
}

function makeRouter(): import('vue-router').Router {
  return { push: vi.fn(async () => undefined) } as unknown as import('vue-router').Router
}

describe('useLiturgyStore — parte 2: ações com bridge/projeção', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    savedState.state = null
    Object.keys(bridgeMock).forEach((k) => delete bridgeMock[k])
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('selectItem: executa, marca done e propaga messageKey', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSubDraft(s, {
      ...s.itemDraft,
      type: 'video',
      name: 'Vídeo',
      filePath: '/tmp/a.mp4',
      durationMs: 1000,
    })

    await s.selectItem(1, makeRouter())
    expect(actionsMock.executeLiturgyItem).toHaveBeenCalledOnce()
    expect(s.currentItems[1]!.done).toBe(true)
    // marcar done limpa a seleção do item concluído
    expect(s.selectedItemIndex).toBeNull()
    expect(s.sessionStartedAt).not.toBeNull()

    // item inexistente: no-op
    await s.selectItem(99, makeRouter())
    expect(actionsMock.executeLiturgyItem).toHaveBeenCalledOnce()

    // falha: messageKey propagada
    actionsMock.executeLiturgyItem.mockResolvedValueOnce({ ok: false, messageKey: 'liturgy.errors.x' })
    await s.selectItem(1, makeRouter())
    expect(s.lastActionMessageKey).toBe('liturgy.errors.x')
  })

  it('playMusicMode: só música; ok → done + navega pra /media; falha → false', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    s.selectDay('sunday')
    addCategory(s)
    addSubDraft(s, { ...s.itemDraft, type: 'music', name: 'Hino', musicId: 101 })

    const router = makeRouter()
    const ok = await s.playMusicMode(1, 'vocal', router)
    expect(ok).toBe(true)
    expect(actionsMock.openLiturgyMusicPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'music' }),
      'vocal',
      { project: true },
    )
    expect(s.currentItems[1]!.done).toBe(true)
    expect(router.push).toHaveBeenCalledWith({ name: 'media' })

    // item não-música: mensagem e false
    actionsMock.openLiturgyMusicPlayer.mockClear()
    const ok2 = await s.playMusicMode(0, 'vocal', router)
    expect(ok2).toBe(false)
    expect(s.lastActionMessageKey).toBe('liturgy.messages.catalogEmpty')

    // falha no player: false sem navegar
    actionsMock.openLiturgyMusicPlayer.mockResolvedValueOnce({ ok: false, messageKey: 'liturgy.errors.play' })
    const ok3 = await s.playMusicMode(1, 'instrumental', router)
    expect(ok3).toBe(false)
    expect(router.push).toHaveBeenCalledTimes(1)
  })

  it('playItemOnScreens site: controle fechado → abre; aberto → toggle', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSubDraft(s, { ...s.itemDraft, type: 'site', name: 'Site', url: 'https://exemplo.com' })

    // sem bridge: cai no playLiturgyItemOnScreens direto
    await s.playItemOnScreens(1)
    expect(actionsMock.playLiturgyItemOnScreens).toHaveBeenCalledOnce()
    // site não é media play type → não marca done (só abre projeção)
    expect(s.currentItems[1]!.done).toBe(false)

    // com bridge: controle FECHADO (getNavigationState null) → id setado
    actionsMock.playLiturgyItemOnScreens.mockClear()
    const navState = { projecting: false }
    bridgeMock.projection = {
      getNavigationState: vi.fn(async () => navState),
      toggleSiteScreens: vi.fn(async () => true),
    }
    s.currentItems = s.currentItems.map((i, idx) => (idx === 1 ? { ...i, done: false } : i))
    await s.playItemOnScreens(1)
    // projecting=false → toggle liga → siteProjectionItemId = item.id
    expect(s.siteProjectionItemId).toBe(s.currentItems[1]!.id)

    // controle ABERTO e toggle funciona: alterna pra null (projecting true → null)
    navState.projecting = true
    s.currentItems = s.currentItems.map((i, idx) => (idx === 1 ? { ...i, done: false } : i))
    await s.playItemOnScreens(1)
    expect(s.siteProjectionItemId).toBeNull()
  })

  it('playItemOnScreens vídeo: toggle liga/desliga; ligar marca done', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSubDraft(s, {
      ...s.itemDraft,
      type: 'video',
      name: 'Vídeo',
      filePath: '/tmp/a.mp4',
      durationMs: 1000,
    })

    const playback = { projecting: false }
    bridgeMock.projection = {
      getPlaybackState: vi.fn(async () => playback),
      toggleVideoScreens: vi.fn(async () => true),
    }

    await s.playItemOnScreens(1) // liga
    expect(s.videoProjectionItemId).toBe(s.currentItems[1]!.id)
    expect(s.currentItems[1]!.done).toBe(true)

    playback.projecting = true
    s.currentItems = s.currentItems.map((i, idx) => (idx === 1 ? { ...i, done: false } : i))
    await s.playItemOnScreens(1) // desliga
    expect(s.videoProjectionItemId).toBeNull()
    expect(s.currentItems[1]!.done).toBe(false)
  })

  it('clearWebProjection limpa runtime + ids', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSubDraft(s, { ...s.itemDraft, type: 'site', name: 'S', url: 'https://exemplo.com' })
    s.siteProjectionItemId = s.currentItems[1]!.id

    bridgeMock.projection = { closeUrl: vi.fn(async () => undefined) }
    await s.clearWebProjection()
    expect(s.siteProjectionItemId).toBeNull()
    expect(s.videoProjectionItemId).toBeNull()
    expect(s.lastActionMessageKey).toBeNull()
  })

  it('syncSiteProjectionState: sem bridge é no-op; estados refletem projeção', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    // sem bridge
    await s.syncSiteProjectionState()
    expect(s.siteProjectionItemId).toBeNull()

    s.selectDay('sunday')
    addCategory(s)
    addSubDraft(s, { ...s.itemDraft, type: 'site', name: 'S1', url: 'https://a.com' })
    addSubDraft(s, { ...s.itemDraft, type: 'video', name: 'V1', filePath: '/v.mp4', durationMs: 500 })

    const navState = { projecting: false }
    const playback = { projecting: false }
    bridgeMock.projection = {
      getNavigationState: vi.fn(async () => navState),
      getPlaybackState: vi.fn(async () => playback),
    }

    // tudo desligado, ids já null → nada
    await s.syncSiteProjectionState()
    expect(s.siteProjectionItemId).toBeNull()

    // site projetando sem id → adota o primeiro site (index 1)
    navState.projecting = true
    await s.syncSiteProjectionState()
    expect(s.siteProjectionItemId).toBe(s.currentItems[1]!.id)

    // site parou → null
    navState.projecting = false
    await s.syncSiteProjectionState()
    expect(s.siteProjectionItemId).toBeNull()

    // vídeo projetando + item selecionado é vídeo → adota
    s.selectedItemIndex = 2
    playback.projecting = true
    await s.syncSiteProjectionState()
    expect(s.videoProjectionItemId).toBe(s.currentItems[2]!.id)

    // vídeo parou → null
    playback.projecting = false
    await s.syncSiteProjectionState()
    expect(s.videoProjectionItemId).toBeNull()
  })

  it('openEditDialog de presentation sem engine → busca engine global do bridge', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSubDraft(s, {
      ...s.itemDraft,
      type: 'presentation',
      name: 'PPT',
      filePath: '/tmp/a.pptx',
    })
    // presentation também é sub-item (precisa categoryId)
    expect(s.currentItems).toHaveLength(2)

    bridgeMock.presentation = { getEngine: vi.fn(async () => 'powerpoint') }
    s.openEditDialog(1)
    expect(s.itemDialogOpen).toBe(true)
    await vi.waitFor(() => {
      expect(s.itemDraft.presentationEngine).toBe('powerpoint')
    })
  })

  it('saveItemDraft movendo item pra outra categoria reordena bloco', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'C1')
    addCategory(s, 'C2')
    addSubDraft(s, {
      ...s.itemDraft,
      type: 'annotation',
      name: 'Nota em C2',
      categoryId: s.currentItems[1]!.id,
    })
    // [C1, C2, Nota]
    expect(s.currentItems.map((i) => i.name)).toEqual(['C1', 'C2', 'Nota em C2'])

    // editar e mover pra C1
    s.openEditDialog(2)
    s.setItemDraft({ ...s.itemDraft, categoryId: s.currentItems[0]!.id })
    expect(s.saveItemDraft()).toBe(true)
    // inserido no bloco de C1 (entre C1 e C2)
    expect(s.currentItems.map((i) => i.name)).toEqual(['C1', 'Nota em C2', 'C2'])
  })

  it('hydrate com items reconciliados persiste mudanças', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    // título de música que diverge do catálogo (id 101 = 'Hino 1')
    s.currentItems = s.currentItems.map((i) => i)
    s.openAddSubItemDialog(s.currentItems[0]!.id)
    s.setItemDraft({ ...s.itemDraft, type: 'music', name: 'Nome Antigo', musicId: 101 })
    s.saveItemDraft()
    expect(s.currentItems[1]!.name).toBe('Nome Antigo')

    await s.hydrate()
    // hydrate reseta pro dia de hoje — volta pro sunday com os itens
    s.selectDay('sunday')
    // reconcileMusicItemTitles ajusta pro nome do catálogo
    expect(s.currentItems[1]!.name).toBe('Hino 1')
  })
})
