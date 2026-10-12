import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Router } from 'vue-router'

import { getDesktopBridge } from '@shared/services/desktop-bridge'

/** Motor PPTX global (Configurações → Mídia & Player): auto|powerpoint|libreoffice. */
async function getPresentationEnginePref(): Promise<
  'auto' | 'powerpoint' | 'libreoffice'
> {
  try {
    const engine = await getDesktopBridge()?.presentation?.getEngine?.()
    if (engine === 'powerpoint' || engine === 'libreoffice') return engine
  } catch {
    // default
  }
  return 'auto'
}
import { closeProjectionModule } from '@shared/composables/useProjectionWindow'

import type { MediaPlaybackMode } from '@modules/media/types/media'

import {
  executeLiturgyItem,
  openLiturgyMusicPlayer,
  playLiturgyItemOnScreens,
} from '../services/liturgy-actions'
import {
  filterLiturgyMusicOptions,
  loadLiturgyBibleBooks,
  loadLiturgyMusicOptions,
} from '../services/liturgy-catalog'
import {
  buildLiturgyItemFromDraft,
  clampMomentDurationMs,
  cloneLiturgyItems,
  createLiturgyItemId,
  draftFromLiturgyItem,
  findCategoryInsertIndex,
  isLiturgyItemDraftValid,
  isLiturgyMediaPlayType,
  reconcileMusicItemTitles,
  reorderLiturgyItems,
} from '../services/liturgy-item-helpers'
import {
  loadLiturgyState,
  saveLiturgyState,
  todayWeekday,
} from '../services/liturgy-preferences'
import { clearLiturgyWebRuntime } from '../services/liturgy-web-runtime'
import { parseJaLiturgy } from '../services/liturgy-ja-import'
import {
  DEFAULT_LITURGY_ITEM_DRAFT,
  DEFAULT_MOMENT_DURATION_MS,
  getTypeDotColor,
  LITURGY_DAY_TAB_ORDER,
  LITURGY_WEEKDAYS,
  type CustomLiturgy,
  type LiturgyBibleBookOption,
  type LiturgyCloneSource,
  type LiturgyDayKey,
  type LiturgyItem,
  type LiturgyItemDraft,
  type LiturgyItemType,
  type LiturgyMusicOption,
  type LiturgyWeekday,
  type WeekdayLiturgies,
  type WeekdayNotes,
  type WeekdaySessionTimes,
} from '../types/liturgy'
import { pad2 } from '../services/liturgy-format'
import {
  enqueueOperatorState,
  scheduleOutboxFlush,
} from '@modules/sync/services/sync-outbox-service'

export const useLiturgyStore = defineStore('liturgy', () => {
  const initialState = loadLiturgyState()
  const weekdays = ref<WeekdayLiturgies>(initialState.weekdays)
  const dayNotes = ref<WeekdayNotes>(initialState.dayNotes)
  const daySessionTimes = ref<WeekdaySessionTimes>(initialState.daySessionTimes)
  const customLiturgies = ref<CustomLiturgy[]>(initialState.customLiturgies)
  const deletionLocks = ref<Record<string, boolean>>(initialState.deletionLocks)

  const selectedDay = ref<LiturgyDayKey>(todayWeekday())
  const selectedCustomIndex = ref(0)
  const siteProjectionItemId = ref<string | null>(null)
  const videoProjectionItemId = ref<string | null>(null)
  const selectedItemIndex = ref<number | null>(null)

  const musicList = ref<LiturgyMusicOption[]>([])
  const bibleBooks = ref<LiturgyBibleBookOption[]>([])
  const musicSearchQuery = ref('')
  const catalogLoading = ref(false)
  const lastActionMessageKey = ref<string | null>(null)

  const itemDialogOpen = ref(false)
  const editingIndex = ref<number | null>(null)
  /** Diálogo aberto via "Adicionar sub item": categoria fixa, sem opção de category. */
  const itemDialogLockedCategory = ref(false)
  /** Diálogo aberto via toolbar: só cria categoria (esconde seletor de tipo). */
  const itemDialogHideTypePicker = ref(false)
  const itemDraft = ref<LiturgyItemDraft>({ ...DEFAULT_LITURGY_ITEM_DRAFT })

  const customDialogOpen = ref(false)
  const newCustomName = ref('')
  const cloneDialogOpen = ref(false)
  const cloneSourceKey = ref('')

  const sessionStartedAt = ref<number | null>(null)
  const countdownRunning = ref(false)
  const hydrated = ref(false)

  const currentCustom = computed(() => {
    if (selectedDay.value !== 'custom') return null
    return customLiturgies.value[selectedCustomIndex.value] ?? null
  })

  const currentStartTime = computed({
    get(): string | null {
      if (selectedDay.value === 'custom') {
        return currentCustom.value?.startTime ?? null
      }
      return daySessionTimes.value[selectedDay.value]?.startTime ?? null
    },
    set(value: string | null) {
      if (selectedDay.value === 'custom') {
        const custom = customLiturgies.value[selectedCustomIndex.value]
        if (!custom) return
        customLiturgies.value[selectedCustomIndex.value] = {
          ...custom,
          startTime: value,
        }
      } else {
        daySessionTimes.value = {
          ...daySessionTimes.value,
          [selectedDay.value]: {
            ...daySessionTimes.value[selectedDay.value],
            startTime: value,
          },
        }
      }
      persist()
    },
  })

  const currentEndTime = computed({
    get(): string | null {
      if (selectedDay.value === 'custom') {
        return currentCustom.value?.endTime ?? null
      }
      return daySessionTimes.value[selectedDay.value]?.endTime ?? null
    },
    set(value: string | null) {
      if (selectedDay.value === 'custom') {
        const custom = customLiturgies.value[selectedCustomIndex.value]
        if (!custom) return
        customLiturgies.value[selectedCustomIndex.value] = {
          ...custom,
          endTime: value,
        }
      } else {
        daySessionTimes.value = {
          ...daySessionTimes.value,
          [selectedDay.value]: {
            ...daySessionTimes.value[selectedDay.value],
            endTime: value,
          },
        }
      }
      persist()
    },
  })

  const canStartCountdown = computed(() => Boolean(currentEndTime.value))

  const currentItems = computed<LiturgyItem[]>({
    get() {
      if (selectedDay.value === 'custom') {
        return currentCustom.value?.items ?? []
      }
      return weekdays.value[selectedDay.value] ?? []
    },
    set(items) {
      if (selectedDay.value === 'custom') {
        const custom = customLiturgies.value[selectedCustomIndex.value]
        if (!custom) return
        customLiturgies.value[selectedCustomIndex.value] = {
          ...custom,
          items,
        }
      } else {
        weekdays.value = {
          ...weekdays.value,
          [selectedDay.value]: items,
        }
      }
      persist()
    },
  })

  const currentNotes = computed({
    get() {
      if (selectedDay.value === 'custom') {
        return currentCustom.value?.notes ?? ''
      }
      /* v8 ignore next 1 -- normalizeNotes sempre cria os 7 dias; ?? inalcançável */
      return dayNotes.value[selectedDay.value] ?? ''
    },
    set(value: string) {
      if (selectedDay.value === 'custom') {
        const custom = customLiturgies.value[selectedCustomIndex.value]
        if (!custom) return
        customLiturgies.value[selectedCustomIndex.value] = {
          ...custom,
          notes: value,
        }
      } else {
        dayNotes.value = {
          ...dayNotes.value,
          [selectedDay.value]: value,
        }
      }
      persist()
    },
  })

  /** Fontes com itens para clonar no dia/avulsa atual (vazio). */
  const cloneSources = computed((): LiturgyCloneSource[] => {
    const sources: LiturgyCloneSource[] = []

    for (const day of LITURGY_DAY_TAB_ORDER) {
      /* v8 ignore next 2 -- normalizeWeekdays sempre cria os 7 dias */
      const items = weekdays.value[day] ?? []
      if (items.length === 0) continue
      if (selectedDay.value === day) continue
      sources.push({
        kind: 'weekday',
        day,
        labelKey: `liturgy.days.${day}`,
        itemCount: items.length,
      })
    }

    customLiturgies.value.forEach((custom, index) => {
      if (custom.items.length === 0) return
      if (
        selectedDay.value === 'custom' &&
        selectedCustomIndex.value === index
      ) {
        return
      }
      sources.push({
        kind: 'custom',
        id: custom.id,
        index,
        name: custom.name,
        itemCount: custom.items.length,
      })
    })

    return sources
  })

  const canCloneLiturgy = computed(
    () =>
      currentItems.value.length === 0 &&
      cloneSources.value.length > 0 &&
      (selectedDay.value !== 'custom' || currentCustom.value != null),
  )

  function deletionLockKey(): string | null {
    if (selectedDay.value === 'custom') {
      const custom = currentCustom.value
      return custom ? `custom:${custom.id}` : null
    }
    return selectedDay.value
  }

  const deletionLocked = computed({
    get(): boolean {
      const key = deletionLockKey()
      if (!key) return false
      return Boolean(deletionLocks.value[key])
    },
    set(value: boolean) {
      const key = deletionLockKey()
      if (!key) return
      const next = { ...deletionLocks.value }
      if (value) next[key] = true
      else delete next[key]
      deletionLocks.value = next
      persist()
    },
  })

  const currentTitleKey = computed(() => {
    if (selectedDay.value === 'custom') {
      return currentCustom.value
        ? null
        : 'liturgy.custom.title'
    }
    return `liturgy.days.${selectedDay.value}`
  })

  const currentCustomTitle = computed(() => currentCustom.value?.name ?? '')

  const selectedItem = computed(() => {
    if (selectedItemIndex.value == null) return null
    return currentItems.value[selectedItemIndex.value] ?? null
  })

  const filteredMusic = computed(() =>
    filterLiturgyMusicOptions(
      musicList.value,
      musicSearchQuery.value,
      itemDraft.value.musicId,
    ),
  )

  const isDraftValid = computed(() => isLiturgyItemDraftValid(itemDraft.value))

  const categoryOptions = computed(() =>
    currentItems.value
      .filter((item) => item.type === 'category')
      .map((item) => ({ id: item.id, name: item.name })),
  )

  const complementaryTitleSuggestions = computed(() => {
    const titles = new Set<string>()

    const collectFromItems = (items: LiturgyItem[]) => {
      for (const item of items) {
        if (item.type !== 'music') continue
        const title = item.complementaryTitle?.trim()
        if (title) titles.add(title)
      }
    }

    for (const day of LITURGY_WEEKDAYS) {
      collectFromItems(weekdays.value[day])
    }
    for (const custom of customLiturgies.value) {
      collectFromItems(custom.items)
    }

    return [...titles].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  })

  const selectedMusic = computed(
    () =>
      musicList.value.find((entry) => entry.id === itemDraft.value.musicId) ??
      null,
  )

  const musicCatalogEmpty = computed(
    () => hydrated.value && musicList.value.length === 0,
  )

  const verseChapterOptions = computed(() => {
    if (itemDraft.value.verseBookId == null) return []
    const book = bibleBooks.value.find(
      (entry) => entry.id === itemDraft.value.verseBookId,
    )
    if (!book) return []
    return Array.from({ length: book.chapters }, (_, index) => index + 1)
  })

  /**
   * Importa liturgia .ja (LouvorJA Delphi) por dia.
   * mode='merge' (padrão): itens duplicados são pulados.
   * mode='overwrite': o dia importado SUBSTITUI o existente inteiro.
   * Retorna { added, skipped, days, hasDuplicates }.
   */
  async function importJaDays(
    parsed: import('../services/liturgy-ja-import').JaLiturgy,
    mode: 'merge' | 'overwrite' = 'merge',
  ) {
    let added = 0
    let skipped = 0
    let hasDuplicates = false
    const days: string[] = []
    const enriched = await enrichJaDurations(parsed)
    for (const [day, items] of Object.entries(enriched)) {
      const weekday = day as LiturgyWeekday
      const existing = weekdays.value[weekday] ?? []
      if (mode === 'overwrite') {
        /* v8 ignore next 1 -- enrichJaDurations normaliza dia ausente pra []; ?? inalcançável */
        weekdays.value = { ...weekdays.value, [weekday]: [...(items ?? [])] }
        /* v8 ignore next 1 -- idem: items sempre array */ 
        added += items?.length ?? 0
        days.push(day)
        continue
      }
      const next = [...existing]
      /* v8 ignore next 1 -- enrichJaDurations normaliza dia ausente pra []; ?? [] inalcançável */
      for (const item of items ?? []) {
        const dup = existing.some(
          (e) =>
            e.type === item.type &&
            e.name === item.name &&
            e.musicId === item.musicId &&
            e.filePath === item.filePath,
        )
        if (dup) {
          skipped++
          hasDuplicates = true
          continue
        }
        next.push(item)
        added++
      }
      weekdays.value = { ...weekdays.value, [weekday]: next }
      days.push(day)
    }
    persist()
    return {
    setItemDurationMs, added, skipped, days, hasDuplicates }
  }

  /**
   * Pré-checa quantos itens do .ja já existem (sem alterar nada) —
   * usado pra decidir entre merge (pular) ou overwrite (substituir).
   */
  function countJaDuplicates(parsed: import('../services/liturgy-ja-import').JaLiturgy) {
    let duplicates = 0
    for (const [day, items] of Object.entries(parsed)) {
      const existing = weekdays.value[day as LiturgyWeekday] ?? []
      for (const item of items ?? []) {
        if (
          existing.some(
            (e) =>
              e.type === item.type &&
              e.name === item.name &&
              e.musicId === item.musicId &&
              e.filePath === item.filePath,
          )
        ) {
          duplicates++
        }
      }
    }
    return duplicates
  }

  /**
   * Duração automática: música → catálogo (musicList); vídeo/áudio →
   * ffprobe do arquivo quando o caminho existe localmente (imports do
   * Delphi trazem caminhos Windows — ficam 0).
   */
  async function enrichJaDurations(
    parsed: import('../services/liturgy-ja-import').JaLiturgy,
  ): Promise<import('../services/liturgy-ja-import').JaLiturgy> {
    const byId = new Map(musicList.value.map((m) => [m.id, m]))
    const probeCache = new Map<string, number>()
    const result: import('../services/liturgy-ja-import').JaLiturgy = {}
    for (const [day, items] of Object.entries(parsed)) {
      result[day as LiturgyWeekday] = await Promise.all(
        (items ?? []).map(async (item) => {
          if (item.type === 'music' && item.musicId != null) {
            const opt = byId.get(item.musicId)
            if (opt?.durationMs) return { ...item, durationMs: opt.durationMs }
            return item
          }
          if (
            item.durationMs === 0 &&
            item.filePath &&
            (item.type === 'video' || item.type === 'other_files')
          ) {
            let probed = probeCache.get(item.filePath)
            if (probed === undefined) {
              const { probeMediaDurationMs } = await import(
                '../services/media-probe'
              )
              probed = await probeMediaDurationMs(item.filePath)
              probeCache.set(item.filePath, probed)
            }
            if (probed > 0) return { ...item, durationMs: probed }
          }
          return item
        }),
      )
    }
    return result
  }

  function persist() {
    saveLiturgyState({
      weekdays: weekdays.value,
      dayNotes: dayNotes.value,
      daySessionTimes: daySessionTimes.value,
      customLiturgies: customLiturgies.value,
      deletionLocks: deletionLocks.value,
    })
    // sync v2 (app#336): toda mutação enfileira no outbox (local-first) e
    // agenda flush em bg — sem rede o item fica na fila (nada se perde).
    try {
      enqueueOperatorState('liturgy', 'week', {
        weekdays: weekdays.value,
        dayNotes: dayNotes.value,
        daySessionTimes: daySessionTimes.value,
        customLiturgies: customLiturgies.value,
        deletionLocks: deletionLocks.value,
      })
      scheduleOutboxFlush()
    } catch {
      // outbox nunca bloqueia o fluxo local
    }
  }

  async function hydrate() {
    if (hydrated.value) return

    const state = loadLiturgyState()
    weekdays.value = state.weekdays
    dayNotes.value = state.dayNotes
    daySessionTimes.value = state.daySessionTimes
    customLiturgies.value = state.customLiturgies
    deletionLocks.value = state.deletionLocks
    selectedDay.value = todayWeekday()
    countdownRunning.value = false

    catalogLoading.value = true
    try {
      const [music, books] = await Promise.all([
        loadLiturgyMusicOptions(),
        loadLiturgyBibleBooks(),
      ])
      musicList.value = music
      bibleBooks.value = books

      let changed = false
      const nextWeekdays = { ...weekdays.value }
      for (const day of Object.keys(nextWeekdays) as LiturgyWeekday[]) {
        const reconciled = reconcileMusicItemTitles(nextWeekdays[day], music)
        if (reconciled !== nextWeekdays[day]) {
          nextWeekdays[day] = reconciled
          changed = true
        }
      }
      weekdays.value = nextWeekdays

      customLiturgies.value = customLiturgies.value.map((custom) => {
        const reconciled = reconcileMusicItemTitles(custom.items, music)
        if (reconciled === custom.items) return custom
        changed = true
        return { ...custom, items: reconciled }
      })

      if (changed) persist()
    } finally {
      catalogLoading.value = false
    }

    hydrated.value = true
  }

  function selectDay(day: LiturgyDayKey) {
    selectedDay.value = day
    selectedItemIndex.value = null
    sessionStartedAt.value = null
    countdownRunning.value = false
    if (day === 'custom' && customLiturgies.value.length === 0) {
      selectedCustomIndex.value = 0
    } else if (
      day === 'custom' &&
      selectedCustomIndex.value >= customLiturgies.value.length
    ) {
      selectedCustomIndex.value = Math.max(0, customLiturgies.value.length - 1)
    }
  }

  function selectCustomLiturgy(index: number) {
    selectedCustomIndex.value = index
    selectedItemIndex.value = null
    sessionStartedAt.value = null
    countdownRunning.value = false
  }

  function normalizeTimeHHmm(value: string): string | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours > 23 ||
      minutes > 59
    ) {
      return null
    }
    return `${pad2(hours)}:${pad2(minutes)}`
  }

  function setSessionStartFromInput(value: string) {
    const normalized = normalizeTimeHHmm(value)
    if (normalized == null) return
    currentStartTime.value = normalized
  }

  function clearSessionStart() {
    currentStartTime.value = null
  }

  function setSessionEndFromInput(value: string) {
    const normalized = normalizeTimeHHmm(value)
    if (normalized == null) return
    currentEndTime.value = normalized
  }

  function clearSessionEnd() {
    currentEndTime.value = null
    countdownRunning.value = false
    sessionStartedAt.value = null
  }

  function startCountdown() {
    if (!currentEndTime.value) return
    sessionStartedAt.value = Date.now()
    countdownRunning.value = true
  }

  function stopCountdown() {
    countdownRunning.value = false
    sessionStartedAt.value = null
  }

  function openAddDialog() {
    editingIndex.value = null
    itemDialogLockedCategory.value = false
    itemDialogHideTypePicker.value = true
    musicSearchQuery.value = ''
    itemDraft.value = {
      ...DEFAULT_LITURGY_ITEM_DRAFT,
      type: 'category',
      accentColor: getTypeDotColor('category'),
      durationMs: 0,
      categoryId: null,
    }
    itemDialogOpen.value = true
  }

  /** Abre o diálogo de novo item já vinculado à categoria informada. */
  function openAddSubItemDialog(categoryId: string) {
    editingIndex.value = null
    itemDialogLockedCategory.value = true
    itemDialogHideTypePicker.value = false
    musicSearchQuery.value = ''
    itemDraft.value = {
      ...DEFAULT_LITURGY_ITEM_DRAFT,
      categoryId,
    }
    itemDialogOpen.value = true
  }

  function setItemDraft(draft: LiturgyItemDraft) {
    itemDraft.value = draft
  }

  function setMusicSearchQuery(query: string) {
    musicSearchQuery.value = query
  }

  function setItemType(type: LiturgyItemType) {
    itemDraft.value = {
      ...itemDraft.value,
      type,
      accentColor: getTypeDotColor(type),
      durationMs:
        type === 'category'
          ? 0
          : itemDraft.value.durationMs || DEFAULT_MOMENT_DURATION_MS,
      categoryId: type === 'category' ? null : itemDraft.value.categoryId,
      startTime: type === 'category' ? itemDraft.value.startTime : '',
      endTime: type === 'category' ? itemDraft.value.endTime : '',
    }
  }

  function openEditDialog(index: number) {
    if (deletionLocked.value) return
    const item = currentItems.value[index]
    if (!item) return
    editingIndex.value = index
    itemDialogLockedCategory.value = false
    itemDialogHideTypePicker.value = item.type === 'category'
    itemDraft.value = draftFromLiturgyItem(item)
    // Motor PPTX: sem override no item, mostra o global das Configurações.
    if (item.type === 'presentation' && !item.presentationEngine) {
      void getPresentationEnginePref().then((engine) => {
        itemDraft.value = { ...itemDraft.value, presentationEngine: engine }
      })
    }
    musicSearchQuery.value = ''
    itemDialogOpen.value = true
  }

  function closeItemDialog() {
    itemDialogOpen.value = false
    editingIndex.value = null
    itemDialogLockedCategory.value = false
    itemDialogHideTypePicker.value = false
  }

  function setItemPlayer(index: number, playerId: string) {
    const item = currentItems.value[index]
    if (!item || (item.type !== 'audio' && item.type !== 'video')) return
    currentItems.value = currentItems.value.map((entry, i) => {
      if (i !== index) return entry
      if (!playerId || playerId === 'default') {
        const next = { ...entry }
        delete next.playerId
        return next
      }
      return { ...entry, playerId }
    })
  }

  function saveItemDraft() {
    if (!isDraftValid.value) return false

    if (selectedDay.value === 'custom' && !currentCustom.value) {
      lastActionMessageKey.value = 'liturgy.messages.customRequired'
      return false
    }

    const draft = itemDraft.value
    const item = buildLiturgyItemFromDraft(draft, {
      musicList: musicList.value,
      bibleBooks: bibleBooks.value,
      existingId:
        editingIndex.value != null
          ? currentItems.value[editingIndex.value]?.id
          : undefined,
      done:
        editingIndex.value != null
          ? currentItems.value[editingIndex.value]?.done
          : false,
    })

    const next = [...currentItems.value]
    if (editingIndex.value != null) {
      const previous = next[editingIndex.value]
      const movedToAnotherCategory =
        item.type !== 'category' &&
        Boolean(item.categoryId) &&
        previous?.categoryId !== item.categoryId

      if (movedToAnotherCategory && item.categoryId) {
        const without = next.filter((_, i) => i !== editingIndex.value)
        const insertAt = findCategoryInsertIndex(without, item.categoryId)
        without.splice(insertAt, 0, item)
        currentItems.value = without
      } else {
        next.splice(editingIndex.value, 1, item)
        currentItems.value = next
      }
    } else if (item.type !== 'category' && item.categoryId) {
      const insertAt = findCategoryInsertIndex(next, item.categoryId)
      next.splice(insertAt, 0, item)
      currentItems.value = next
    } else {
      next.push(item)
      currentItems.value = next
    }
    closeItemDialog()
    return true
  }

  function removeItem(index: number) {
    if (deletionLocked.value) return
    const target = currentItems.value[index]
    if (!target) return

    const removeIds = new Set<string>([target.id])
    if (target.type === 'category') {
      for (const item of currentItems.value) {
        if (item.type !== 'category' && item.categoryId === target.id) {
          removeIds.add(item.id)
        }
      }
    }

    const selected = selectedItemIndex.value
    let removedBeforeSelected = 0
    let selectedRemoved = false

    const next = currentItems.value.filter((item, i) => {
      if (!removeIds.has(item.id)) return true
      if (selected != null && i < selected) removedBeforeSelected += 1
      if (selected === i) selectedRemoved = true
      return false
    })

    currentItems.value = next

    if (selectedRemoved) {
      selectedItemIndex.value = null
    } else if (selected != null && removedBeforeSelected > 0) {
      selectedItemIndex.value = selected - removedBeforeSelected
    }
  }

  function clearAllItems() {
    if (deletionLocked.value) return
    currentItems.value = []
    selectedItemIndex.value = null
  }

  function toggleDeletionLock() {
    if (deletionLockKey() == null) return
    deletionLocked.value = !deletionLocked.value
  }

  function syncCategoryDoneFromChildren(items: LiturgyItem[]): LiturgyItem[] {
    return items.map((item) => {
      if (item.type !== 'category') return item
      const children = items.filter(
        (child) => child.type !== 'category' && child.categoryId === item.id,
      )
      if (children.length === 0) return item
      const allDone = children.every((child) => child.done)
      return { ...item, done: allDone }
    })
  }

  function clearSelectionIfMatches(
    predicate: (item: LiturgyItem, index: number) => boolean,
  ) {
    const selected = selectedItemIndex.value
    if (selected == null) return
    const item = currentItems.value[selected]
    if (item && predicate(item, selected)) {
      selectedItemIndex.value = null
    }
  }

  function toggleItemDone(index: number) {
    const target = currentItems.value[index]
    if (!target) return

    const nextDone = !target.done

    if (target.type === 'category') {
      currentItems.value = currentItems.value.map((item) => {
        if (item.id === target.id) return { ...item, done: nextDone }
        if (item.categoryId === target.id) return { ...item, done: nextDone }
        return item
      })
      if (nextDone) {
        clearSelectionIfMatches(
          (item) => item.id === target.id || item.categoryId === target.id,
        )
      }
      return
    }

    const next = currentItems.value.map((item, i) =>
      i === index ? { ...item, done: nextDone } : item,
    )
    currentItems.value = syncCategoryDoneFromChildren(next)

    if (nextDone) {
      clearSelectionIfMatches((_, i) => i === index)
      if (target.categoryId) {
        const categoryId = target.categoryId
        clearSelectionIfMatches((item) => item.id === categoryId && item.done)
      }
    }
  }

  /** Marca item de mídia como concluído ao tocar (não desmarca). */
  function markItemDone(index: number) {
    const target = currentItems.value[index]
    if (!target || target.done || target.type === 'category') return
    if (!isLiturgyMediaPlayType(target.type)) return

    const next = currentItems.value.map((item, i) =>
      i === index ? { ...item, done: true } : item,
    )
    currentItems.value = syncCategoryDoneFromChildren(next)

    clearSelectionIfMatches((_, i) => i === index)
    if (target.categoryId) {
      const categoryId = target.categoryId
      /* v8 ignore next 1 -- selectItem força seleção=index (markItemStarted) e L860 já a limpa; predicate inalcançável */
      clearSelectionIfMatches((item) => item.id === categoryId && item.done)
    }
  }

  function reorderItems(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return

    const previous = currentItems.value
    const selectedId =
      selectedItemIndex.value != null
        ? previous[selectedItemIndex.value]?.id
        : null

    const next = reorderLiturgyItems(previous, fromIndex, toIndex)
    if (next === previous) return
    currentItems.value = next

    if (selectedId) {
      const mapped = next.findIndex((item) => item.id === selectedId)
      /* v8 ignore next 1 -- reorder nunca descarta item; mapped<0 inalcançável */
      selectedItemIndex.value = mapped >= 0 ? mapped : null
    }
  }

  function markItemStarted(index: number) {
    selectedItemIndex.value = index
    const item = currentItems.value[index]
    if (!item) return null

    if (!currentStartTime.value) {
      const now = new Date()
      currentStartTime.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
    }
    if (sessionStartedAt.value == null) {
      sessionStartedAt.value = Date.now()
    }

    return item
  }

  async function selectItem(index: number, router: Router) {
    const item = markItemStarted(index)
    if (!item) return

    const result = await executeLiturgyItem(item, router)
    if (item.type === 'site') {
      siteProjectionItemId.value = null
    } else if (
      item.type === 'online_video' ||
      item.type === 'video' ||
      item.type === 'images' ||
      item.type === 'pdf' ||
      item.type === 'presentation'
    ) {
      videoProjectionItemId.value = null
    }
    lastActionMessageKey.value = result.messageKey ?? null
    if (result.ok) markItemDone(index)
  }

  /** Atualiza a duração de um item (ex.: vídeo local lido do arquivo no web). */
  function setItemDurationMs(itemId: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return
    currentItems.value = currentItems.value.map((item) =>
      item.id === itemId ? { ...item, durationMs } : item,
    )
  }

  /**
   * Controles do álbum/hinário na linha de música:
   * cantado, instrumental ou slides sem áudio (abre /media).
   */
  async function playMusicMode(
    index: number,
    mode: MediaPlaybackMode,
    router: Router,
  ) {
    const item = markItemStarted(index)
    if (!item || item.type !== 'music') {
      lastActionMessageKey.value = 'liturgy.messages.catalogEmpty'
      return false
    }

    const result = await openLiturgyMusicPlayer(item, mode, {
      // Cantado / instrumental / slides: abre o player já projetando
      // (antes só `no_audio` projetava e o operador precisava clicar em Projetar).
      project: true,
    })
    lastActionMessageKey.value = result.messageKey ?? null
    if (!result.ok) return false

    markItemDone(index)
    await router.push({ name: 'media' })
    return true
  }

  /** Play nas telas estendidas (abre controle se preciso e dispara play). */
  async function playItemOnScreens(index: number) {
    selectedItemIndex.value = index
    const item = currentItems.value[index]
    if (!item) return

    if (!currentStartTime.value) {
      const now = new Date()
      currentStartTime.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
    }
    if (sessionStartedAt.value == null) {
      sessionStartedAt.value = Date.now()
    }

    if (item.type === 'site') {
      const projection = getDesktopBridge()?.projection
      // Controle já aberto: só liga/desliga as telas; não reabre o popup.
      const state = await projection?.getNavigationState?.()
      if (state) {
        const toggled = await projection?.toggleSiteScreens?.()
        if (toggled) {
          siteProjectionItemId.value = state.projecting ? null : item.id
          lastActionMessageKey.value = null
          return
        }
      }

      // Controle fechado: abre controle + projeção.
      siteProjectionItemId.value = item.id
    } else if (
      item.type === 'online_video' ||
      item.type === 'video' ||
      item.type === 'images' ||
      item.type === 'pdf' ||
      item.type === 'presentation'
    ) {
      const projection = getDesktopBridge()?.projection
      // Controle já aberto: apenas liga/desliga as telas.
      const state = await projection?.getPlaybackState?.()
      if (state) {
        const toggled = await projection?.toggleVideoScreens?.()
        if (toggled) {
          const turningOn = !state.projecting
          videoProjectionItemId.value = turningOn ? item.id : null
          lastActionMessageKey.value = null
          if (turningOn) markItemDone(index)
          return
        }
      }

      // Controle fechado: abre controle + projeção.
      videoProjectionItemId.value = item.id
    }

    const result = await playLiturgyItemOnScreens(item)
    if (!result.ok && item.type === 'site') {
      siteProjectionItemId.value = null
    } else if (
      !result.ok &&
      (item.type === 'online_video' ||
        item.type === 'video' ||
        item.type === 'images' ||
        item.type === 'pdf' ||
        item.type === 'presentation')
    ) {
      videoProjectionItemId.value = null
    }
    lastActionMessageKey.value = result.messageKey ?? null
    if (result.ok) markItemDone(index)
  }

  /** Encerra projeção web da liturgia (header global / sync). */
  async function clearWebProjection() {
    clearLiturgyWebRuntime()
    const bridge = getDesktopBridge()
    await bridge?.projection?.closeUrl?.()
    closeProjectionModule()
    siteProjectionItemId.value = null
    videoProjectionItemId.value = null
    lastActionMessageKey.value = null
  }

  /**
   * Mantém o botão da liturgia sincronizado com o da janela de controle
   * (ambos refletem state.projecting do processo principal).
   */
  async function syncSiteProjectionState() {
    const projection = getDesktopBridge()?.projection
    if (!projection) return

    const [siteState, videoState] = await Promise.all([
      projection.getNavigationState?.() ?? null,
      projection.getPlaybackState?.() ?? null,
    ])

    if (!siteState) {
      if (siteProjectionItemId.value != null) {
        siteProjectionItemId.value = null
      }
    } else if (siteState.projecting) {
      if (siteProjectionItemId.value == null) {
        const selected =
          selectedItemIndex.value != null
            ? currentItems.value[selectedItemIndex.value]
            : null
        const siteItem =
          selected?.type === 'site'
            ? selected
            : currentItems.value.find((entry) => entry.type === 'site')
        if (siteItem) {
          siteProjectionItemId.value = siteItem.id
        }
      }
    } else if (siteProjectionItemId.value != null) {
      siteProjectionItemId.value = null
    }

    if (!videoState?.projecting) {
      if (videoProjectionItemId.value != null) {
        videoProjectionItemId.value = null
      }
      return
    }

    if (videoProjectionItemId.value != null) return
    const selected =
      selectedItemIndex.value != null
        ? currentItems.value[selectedItemIndex.value]
        : null
    if (
      selected?.type === 'online_video' ||
      selected?.type === 'video' ||
      selected?.type === 'images' ||
      selected?.type === 'pdf' ||
      selected?.type === 'presentation'
    ) {
      videoProjectionItemId.value = selected.id
      return
    }
    const videoItem = currentItems.value.find(
      (entry) =>
        entry.type === 'online_video' ||
        entry.type === 'video' ||
        entry.type === 'images' ||
        entry.type === 'pdf' ||
        entry.type === 'presentation',
    )
    if (videoItem) videoProjectionItemId.value = videoItem.id
  }

  function openCustomDialog() {
    newCustomName.value = ''
    customDialogOpen.value = true
  }

  function closeCustomDialog() {
    customDialogOpen.value = false
    newCustomName.value = ''
  }

  function createCustomLiturgy() {
    const name = newCustomName.value.trim()
    if (!name) return

    customLiturgies.value = [
      ...customLiturgies.value,
      {
        id: createLiturgyItemId(),
        name,
        items: [],
        notes: '',
        startTime: null,
        endTime: null,
      },
    ]
    selectedDay.value = 'custom'
    selectedCustomIndex.value = customLiturgies.value.length - 1
    selectedItemIndex.value = null
    persist()
    closeCustomDialog()
  }

  function removeCustomLiturgy(index: number) {
    const removed = customLiturgies.value[index]
    customLiturgies.value = customLiturgies.value.filter((_, i) => i !== index)
    if (removed) {
      const key = `custom:${removed.id}`
      if (deletionLocks.value[key]) {
        const next = { ...deletionLocks.value }
        delete next[key]
        deletionLocks.value = next
      }
    }
    if (selectedCustomIndex.value >= customLiturgies.value.length) {
      selectedCustomIndex.value = Math.max(0, customLiturgies.value.length - 1)
    }
    selectedItemIndex.value = null
    persist()
  }

  function cloneSourceKeyOf(source: LiturgyCloneSource): string {
    return source.kind === 'weekday'
      ? `weekday:${source.day}`
      : `custom:${source.id}`
  }

  function openCloneDialog() {
    if (!canCloneLiturgy.value) return
    const first = cloneSources.value[0]
    /* v8 ignore next 1 -- canCloneLiturgy true garante sources>0; fallback '' inalcançável */
    cloneSourceKey.value = first ? cloneSourceKeyOf(first) : ''
    cloneDialogOpen.value = true
  }

  function closeCloneDialog() {
    cloneDialogOpen.value = false
    cloneSourceKey.value = ''
  }

  function resolveCloneSourceItems(key: string): LiturgyItem[] | null {
    if (key.startsWith('weekday:')) {
      const day = key.slice('weekday:'.length) as LiturgyWeekday
      if (!(LITURGY_WEEKDAYS as readonly string[]).includes(day)) return null
      /* v8 ignore next 2 -- normalizeWeekdays sempre cria os 7 dias; ?? []/null inalcançáveis */
      const items = weekdays.value[day] ?? []
      return items.length > 0 ? items : null
    }
    if (key.startsWith('custom:')) {
      const id = key.slice('custom:'.length)
      const custom = customLiturgies.value.find((entry) => entry.id === id)
      if (!custom || custom.items.length === 0) return null
      return custom.items
    }
    return null
  }

  function cloneLiturgyFromSelected() {
    if (currentItems.value.length > 0) return
    if (selectedDay.value === 'custom' && !currentCustom.value) return

    const sourceItems = resolveCloneSourceItems(cloneSourceKey.value)
    if (!sourceItems) return

    currentItems.value = cloneLiturgyItems(sourceItems)
    selectedItemIndex.value = null
    closeCloneDialog()
  }

  /**
   * app#331: recarrega SÓ o catálogo de músicas (pós-import .slja) —
   * sem hydrate completo, a música nova aparece na busca do dialog.
   */
  async function refreshMusicCatalog() {
    musicList.value = await loadLiturgyMusicOptions()
  }

  function onMusicPick(musicId: number) {
    const music = musicList.value.find((entry) => entry.id === musicId)
    if (!music) {
      itemDraft.value = {
        ...itemDraft.value,
        musicId,
        durationMs: 0,
      }
      return
    }

    itemDraft.value = {
      ...itemDraft.value,
      musicId,
      durationMs:
        music.durationMs && music.durationMs > 0
          ? clampMomentDurationMs(music.durationMs)
          : 0,
      // Título complementar herda o nome da música SE o campo estiver vazio
      // (feedback Ezequias 02/10: ao editar item de música o título
      // obrigatório ficava vazio e travava o salvar).
      name: itemDraft.value.name.trim() || music.name,
    }
  }

  function clearMusicPick() {
    itemDraft.value = {
      ...itemDraft.value,
      musicId: null,
    }
  }

  function onBookPick(bookId: number) {
    itemDraft.value = {
      ...itemDraft.value,
      verseBookId: bookId,
      verseChapter: 1,
    }
    const book = bibleBooks.value.find((entry) => entry.id === bookId)
    if (book && !itemDraft.value.name.trim()) {
      itemDraft.value = {
        ...itemDraft.value,
        name: book.name,
      }
    }
  }

  function clearActionMessage() {
    lastActionMessageKey.value = null
  }

  function setActionMessage(messageKey: string | null) {
    lastActionMessageKey.value = messageKey
  }

  function setNotes(value: string) {
    currentNotes.value = value
  }

  return {
    weekdays,
    dayNotes,
    daySessionTimes,
    customLiturgies,
    selectedDay,
    selectedCustomIndex,
    siteProjectionItemId,
    videoProjectionItemId,
    selectedItemIndex,
    musicList,
    bibleBooks,
    musicSearchQuery,
    catalogLoading,
    lastActionMessageKey,
    itemDialogOpen,
    editingIndex,
    itemDialogLockedCategory,
    itemDialogHideTypePicker,
    itemDraft,
    customDialogOpen,
    newCustomName,
    cloneDialogOpen,
    cloneSourceKey,
    sessionStartedAt,
    countdownRunning,
    hydrated,
    currentItems,
    currentNotes,
    currentStartTime,
    currentEndTime,
    canStartCountdown,
    cloneSources,
    canCloneLiturgy,
    deletionLocked,
    currentTitleKey,
    currentCustomTitle,
    selectedItem,
    filteredMusic,
    selectedMusic,
    musicCatalogEmpty,
    isDraftValid,
    categoryOptions,
    complementaryTitleSuggestions,
    verseChapterOptions,
    hydrate,
    selectDay,
    importJaDays,
    countJaDuplicates,
    selectCustomLiturgy,
    setSessionStartFromInput,
    clearSessionStart,
    setSessionEndFromInput,
    clearSessionEnd,
    startCountdown,
    stopCountdown,
    openAddDialog,
    openAddSubItemDialog,
    setItemDraft,
    setMusicSearchQuery,
    setItemType,
    openEditDialog,
    closeItemDialog,
    saveItemDraft,
    setItemPlayer,
    removeItem,
    clearAllItems,
    toggleDeletionLock,
    toggleItemDone,
    reorderItems,
    selectItem,
    playMusicMode,
    playItemOnScreens,
    clearWebProjection,
    syncSiteProjectionState,
    openCustomDialog,
    closeCustomDialog,
    createCustomLiturgy,
    removeCustomLiturgy,
    openCloneDialog,
    closeCloneDialog,
    cloneLiturgyFromSelected,
    onMusicPick,
    refreshMusicCatalog,
    clearMusicPick,
    onBookPick,
    clearActionMessage,
    setActionMessage,
    setNotes,
    setItemDurationMs,
  }
})
