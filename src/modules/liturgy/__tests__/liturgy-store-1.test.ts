// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { JaLiturgy } from '../services/liturgy-ja-import'
import type { LiturgyItem } from '../types/liturgy'

import { useLiturgyStore } from '../stores/useLiturgyStore'

// Borda: persistência e bridge desktop (nunca chamados de verdade em teste).
vi.mock('../services/liturgy-preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/liturgy-preferences')>()
  return {
    ...actual,
    saveLiturgyState: vi.fn(),
  }
})

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
    { id: 202, name: 'Música Livre', hymnalTrack: null, albumNames: 'Coletânea', displayLabel: 'Música Livre', durationMs: null, hasInstrumental: false },
  ]),
  loadLiturgyBibleBooks: vi.fn(async () => [
    { id: 1, name: 'Gênesis', chapters: 50 },
    { id: 2, name: 'Êxodo', chapters: 40 },
  ]),
  filterLiturgyMusicOptions: vi.fn(
    (list: { name: string }[], q: string) =>
      list.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())),
  ),
}))

vi.mock('../services/liturgy-actions', () => ({
  executeLiturgyItem: vi.fn(async () => ({ ok: true, messageKey: null })),
  openLiturgyMusicPlayer: vi.fn(async () => ({ ok: true, messageKey: null })),
  playLiturgyItemOnScreens: vi.fn(async () => ({ ok: true, messageKey: null })),
}))

vi.mock('../services/liturgy-web-runtime', () => ({
  clearLiturgyWebRuntime: vi.fn(),
}))

function jaItem(over: Partial<LiturgyItem>): LiturgyItem {
  return {
    id: 'ja-1',
    type: 'annotation',
    name: 'Item',
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '#000',
    ...over,
  }
}

/** Cria uma categoria válida (nome único + HH:MM início/fim) via diálogo. */
function addCategory(s: ReturnType<typeof useLiturgyStore>, name = 'Categoria'): void {
  s.openAddDialog()
  s.setItemDraft({
    ...s.itemDraft,
    type: 'category',
    name,
    startTime: '09:00',
    endTime: '10:00',
  })
  if (!s.saveItemDraft()) throw new Error('categoria deveria ser válida')
}

/** Cria sub-item de annotation dentro da primeira categoria. */
function addSubItem(s: ReturnType<typeof useLiturgyStore>, name: string): void {
  const cat = s.currentItems.find((i) => i.type === 'category')!
  s.openAddSubItemDialog(cat.id)
  s.setItemDraft({ ...s.itemDraft, type: 'annotation', name })
  if (!s.saveItemDraft()) throw new Error('sub-item deveria ser válido')
}

describe('useLiturgyStore — parte 1: estado, computed, sessão, custom, clone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(bridgeMock).forEach((k) => delete bridgeMock[k])
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('estado inicial: dia = hoje, listas vazias, hydrated false', () => {
    const s = useLiturgyStore()
    expect(s.hydrated).toBe(false)
    expect(s.selectedDay).not.toBe('custom')
    expect(s.currentItems).toEqual([])
    expect(s.musicList).toEqual([])
    expect(s.musicCatalogEmpty).toBe(false)
  })

  it('hydrate carrega catálogo e reconcilia títulos; segunda chamada é no-op', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    expect(s.musicList).toHaveLength(2)
    expect(s.bibleBooks).toHaveLength(2)
    expect(s.hydrated).toBe(true)
    expect(s.catalogLoading).toBe(false)
    // idempotente
    await s.hydrate()
    expect(s.musicList).toHaveLength(2)
  })

  it('currentStartTime/EndTime: ações normalizam HH:MM', () => {
    const s = useLiturgyStore()
    s.setSessionStartFromInput('9:5') // minuto 1 dígito não casa → null
    expect(s.currentStartTime).toBeNull()
    s.setSessionStartFromInput('9:05')
    expect(s.currentStartTime).toBe('09:05')
    s.setSessionStartFromInput('25:00') // horas > 23 → null
    expect(s.currentStartTime).toBe('09:05')
    s.setSessionStartFromInput('14:30:00') // com segundos → normaliza
    expect(s.currentStartTime).toBe('14:30')
    s.clearSessionStart()
    expect(s.currentStartTime).toBeNull()

    s.setSessionEndFromInput('19:45')
    expect(s.currentEndTime).toBe('19:45')
    expect(s.canStartCountdown).toBe(true)
    s.clearSessionEnd()
    expect(s.canStartCountdown).toBe(false)
  })

  it('startCountdown/stopCountdown controlam sessão', () => {
    const s = useLiturgyStore()
    s.setSessionEndFromInput('20:00')
    s.startCountdown()
    expect(s.countdownRunning).toBe(true)
    expect(s.sessionStartedAt).not.toBeNull()
    s.stopCountdown()
    expect(s.countdownRunning).toBe(false)
    expect(s.sessionStartedAt).toBeNull()
    // sem end time não inicia
    s.clearSessionEnd()
    s.startCountdown()
    expect(s.countdownRunning).toBe(false)
  })

  it('custom liturgies: criar, título, remover; nome vazio não cria', () => {
    const s = useLiturgyStore()
    s.openCustomDialog()
    expect(s.customDialogOpen).toBe(true)
    s.newCustomName = '  Culto Jovem  '
    s.createCustomLiturgy()
    expect(s.customDialogOpen).toBe(false)
    expect(s.customLiturgies).toHaveLength(1)
    expect(s.selectedDay).toBe('custom')
    expect(s.currentCustomTitle).toBe('Culto Jovem')
    expect(s.currentTitleKey).toBeNull()

    // nome vazio não cria
    s.openCustomDialog()
    s.newCustomName = '   '
    s.createCustomLiturgy()
    expect(s.customLiturgies).toHaveLength(1)

    // remover ajusta índice e limpa lock
    s.toggleDeletionLock()
    expect(s.deletionLocked).toBe(true)
    s.removeCustomLiturgy(0)
    expect(s.customLiturgies).toHaveLength(0)
    expect(s.deletionLocked).toBe(false)
    expect(s.selectedCustomIndex).toBe(0)
  })

  it('clone: sources exclui o dia atual, canCloneLiturgy e clone de fato', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    expect(s.currentItems).toHaveLength(1)

    // segunda sem itens → domingo é fonte
    s.selectDay('monday')
    expect(s.cloneSources.map((x) => ('day' in x ? x.day : null))).toEqual(['sunday'])
    expect(s.canCloneLiturgy).toBe(true)
    s.openCloneDialog()
    expect(s.cloneDialogOpen).toBe(true)
    expect(s.cloneSourceKey).toBe('weekday:sunday')
    s.cloneLiturgyFromSelected()
    expect(s.currentItems).toHaveLength(1)
    expect(s.cloneDialogOpen).toBe(false)
    // canClone vira false (não está mais vazio)
    expect(s.canCloneLiturgy).toBe(false)

    // key inválida não clona
    s.selectDay('tuesday')
    s.openCloneDialog()
    s.cloneSourceKey = 'weekday:invalid'
    s.cloneLiturgyFromSelected()
    expect(s.currentItems).toHaveLength(0)
    s.closeCloneDialog()
    expect(s.cloneDialogOpen).toBe(false)
  })

  it('toggleItemDone em item simples sincroniza done da categoria pai', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    addSubItem(s, 'Bem-vindo')
    expect(s.currentItems).toHaveLength(2)

    s.toggleItemDone(1)
    expect(s.currentItems[1]!.done).toBe(true)
    // pai sincroniza: todos os filhos done → pai done
    expect(s.currentItems[0]!.done).toBe(true)
    // desmarcar filho → pai volta a false
    s.toggleItemDone(1)
    expect(s.currentItems[0]!.done).toBe(false)
  })

  it('removeItem de categoria remove filhos; selected index ajusta', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'C1')
    addSubItem(s, 'Filho')
    addCategory(s, 'C2')
    expect(s.currentItems).toHaveLength(3)

    // seleciona c2 (índice 2) e remove a categoria 0 (cat + filho = 2 removidos antes)
    s.selectedItemIndex = 2
    s.removeItem(0)
    expect(s.currentItems).toHaveLength(1)
    expect(s.selectedItemIndex).toBe(0) // 2 - 2 removidos antes

    // selected removido → null
    s.removeItem(0)
    expect(s.currentItems).toHaveLength(0)
    expect(s.selectedItemIndex).toBeNull()
  })

  it('deletionLock trava removeItem/clearAll/openEdit', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s)
    s.toggleDeletionLock()
    expect(s.deletionLocked).toBe(true)
    s.removeItem(0)
    expect(s.currentItems).toHaveLength(1) // não removeu
    s.clearAllItems()
    expect(s.currentItems).toHaveLength(1)
    s.openEditDialog(0)
    expect(s.itemDialogOpen).toBe(false) // bloqueado
    s.toggleDeletionLock()
    s.removeItem(0)
    expect(s.currentItems).toHaveLength(0)
  })

  it('setItemPlayer aplica/remove playerId só em audio/video', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'C1')
    s.openAddSubItemDialog(s.currentItems[0]!.id)
    s.setItemDraft({ ...s.itemDraft, type: 'video', name: 'Vídeo', filePath: '/tmp/a.mp4', durationMs: 1000 })
    expect(s.saveItemDraft()).toBe(true)
    // sub-item é inserido DEPOIS da categoria pai → vídeo é índice 1
    expect(s.currentItems[0]!.type).toBe('category')
    s.setItemPlayer(1, 'vlc')
    expect(s.currentItems[1]!.playerId).toBe('vlc')
    s.setItemPlayer(1, 'default')
    expect(s.currentItems[1]!.playerId).toBeUndefined()
    // category não tem player
    s.setItemPlayer(0, 'vlc')
    expect(s.currentItems[0]!.playerId).toBeUndefined()
  })

  it('setItemDurationMs valida e atualiza; onMusicPick/onBookPick preenchem draft', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    s.selectDay('sunday')
    addCategory(s)
    s.openAddSubItemDialog(s.currentItems[0]!.id)
    s.setItemDraft({ ...s.itemDraft, type: 'music', name: 'Hino', musicId: 101 })
    s.saveItemDraft()

    s.setItemDurationMs(s.currentItems[0]!.id, -5)
    expect(s.currentItems[0]!.durationMs).not.toBe(-5)
    s.setItemDurationMs(s.currentItems[0]!.id, 42000)
    expect(s.currentItems[0]!.durationMs).toBe(42000)

    // onMusicPick com duração do catálogo
    s.openAddDialog()
    s.onMusicPick(101)
    expect(s.itemDraft.musicId).toBe(101)
    expect(s.itemDraft.durationMs).toBe(300000)
    s.clearMusicPick()
    expect(s.itemDraft.musicId).toBeNull()
    // música inexistente → durationMs 0
    s.onMusicPick(999)
    expect(s.itemDraft.durationMs).toBe(0)

    // onBookPick: preenche nome do livro se vazio
    s.onBookPick(1)
    expect(s.itemDraft.verseBookId).toBe(1)
    expect(s.itemDraft.verseChapter).toBe(1)
    expect(s.itemDraft.name).toBe('Gênesis')
    // nome já preenchido não sobrescreve
    s.setItemDraft({ ...s.itemDraft, name: 'Já tenho nome' })
    s.onBookPick(2)
    expect(s.itemDraft.name).toBe('Já tenho nome')
  })

  it('verseChapterOptions gera 1..chapters', async () => {
    const s = useLiturgyStore()
    await s.hydrate()
    s.openAddDialog()
    s.setItemDraft({ ...s.itemDraft, type: 'verse', verseBookId: 2 })
    expect(s.verseChapterOptions).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
    // livro inexistente
    s.setItemDraft({ ...s.itemDraft, verseBookId: 999 })
    expect(s.verseChapterOptions).toEqual([])
  })

  it('importJaDays merge pula duplicados; overwrite substitui; countJaDuplicates', async () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'Minha Cat')
    const cat = s.currentItems[0]!

    const dup = jaItem({ type: 'category', name: cat.name, startTime: cat.startTime, endTime: cat.endTime })
    // merge: duplicado pulado
    let r = await s.importJaDays({ sunday: [dup] })
    expect(r.added).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.hasDuplicates).toBe(true)
    expect(r.days).toEqual(['sunday'])
    expect(s.currentItems).toHaveLength(1)

    // merge: item novo adicionado
    r = await s.importJaDays({ sunday: [jaItem({ type: 'category', name: 'Outro' })] })
    expect(r.added).toBe(1)
    expect(s.currentItems).toHaveLength(2)

    // count antes do overwrite (que substituiria os itens)
    expect(s.countJaDuplicates({ sunday: [dup] })).toBe(1)
    expect(s.countJaDuplicates({} as JaLiturgy)).toBe(0)

    // overwrite substitui
    r = await s.importJaDays({ sunday: [jaItem({ type: 'category', name: 'Sobrescrito' })] }, 'overwrite')
    expect(r.added).toBe(1)
    expect(s.currentItems).toHaveLength(1)
    expect(s.currentItems[0]!.name).toBe('Sobrescrito')
  })

  it('reorderItems mantém seleção seguindo o id', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    addCategory(s, 'CA')
    addCategory(s, 'CB')

    s.selectedItemIndex = 1
    s.reorderItems(1, 0) // cat 2 vai pra frente
    expect(s.selectedItemIndex).toBe(0)
    // reorder para o mesmo índice não faz nada
    s.reorderItems(0, 0)
    expect(s.selectedItemIndex).toBe(0)
  })

  it('complementaryTitleSuggestions coleta e ordena títulos únicos', () => {
    const s = useLiturgyStore()
    s.selectDay('sunday')
    // injeta itens direto no weekdays via currentItems setter
    s.selectDay('monday')
    s.currentItems = [
      jaItem({ type: 'music', name: 'A', musicId: 101, complementaryTitle: ' Quarto Mandamento ' }),
      jaItem({ type: 'music', name: 'B', musicId: 202, complementaryTitle: 'Álbum X' }),
      jaItem({ type: 'music', name: 'C', musicId: 101, complementaryTitle: 'Álbum X' }), // dup
    ]
    expect(s.complementaryTitleSuggestions).toEqual(['Álbum X', 'Quarto Mandamento'])
  })

  it('setActionMessage/clearActionMessage/setNotes', () => {
    const s = useLiturgyStore()
    s.setActionMessage('liturgy.messages.x')
    expect(s.lastActionMessageKey).toBe('liturgy.messages.x')
    s.clearActionMessage()
    expect(s.lastActionMessageKey).toBeNull()
    s.setNotes('nota do dia')
    expect(s.currentNotes).toBe('nota do dia')
  })
})
