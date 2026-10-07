import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAlbumsStore } from '@modules/albums/stores/useAlbumsStore'
import type { MediaPlaybackMode } from '@modules/media/types/media'

import { formatMomentDuration } from '../services/liturgy-item-helpers'
import { decodeJaBytes, parseJaLiturgy } from '../services/liturgy-ja-import'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { useLiturgyStore } from '../stores/useLiturgyStore'
import { useScheduledStore } from '../stores/useScheduledStore'
import { appConfirm } from '@shared/composables/useAppConfirm'
import type { LiturgyDayKey } from '../types/liturgy'
import { useLiturgyClock } from './useLiturgyClock'

/** Orquestra a feature de liturgia na view. */
export function useLiturgy() {
  const store = useLiturgyStore()
  const albumsStore = useAlbumsStore()
  const router = useRouter()
  const { t } = useI18n()

  const {
    selectedDay,
    selectedCustomIndex,
    selectedItemIndex,
    siteProjectionItemId,
    videoProjectionItemId,
    customLiturgies,
    lastActionMessageKey,
    itemDialogOpen,
    editingIndex,
    itemDialogLockedCategory,
    itemDialogHideTypePicker,
    itemDraft,
    customDialogOpen,
    newCustomName,
    countdownRunning,
    canStartCountdown,
    canCloneLiturgy,
    cloneDialogOpen,
    cloneSourceKey,
    cloneSources,
    deletionLocked,
    currentItems,
    currentNotes,
    currentStartTime,
    currentEndTime,
    sessionStartedAt,
    currentTitleKey,
    currentCustomTitle,
    isDraftValid,
    categoryOptions,
    complementaryTitleSuggestions,
    musicSearchQuery,
    filteredMusic,
    selectedMusic,
    musicCatalogEmpty,
    musicList,
  } = storeToRefs(store)

  const { lyricOpen, lyricDoc, isLoadingLyric } = storeToRefs(albumsStore)

  const busyMusicId = ref<number | null>(null)

  const musicInstrumentalById = computed(() => {
    const map: Record<number, boolean> = {}
    for (const entry of musicList.value) {
      map[entry.id] = entry.hasInstrumental
    }
    return map
  })

  const clock = useLiturgyClock(
    () => currentStartTime.value,
    () => currentEndTime.value,
    () => countdownRunning.value,
    () => sessionStartedAt.value,
  )

  let syncTimer: number | null = null

  onMounted(() => {
    void store.hydrate()
    void store.syncSiteProjectionState()
    syncTimer = window.setInterval(() => {
      void store.syncSiteProjectionState()
    }, 400)
  })

  onUnmounted(() => {
    if (syncTimer !== null) window.clearInterval(syncTimer)
    syncTimer = null
  })

  function worshipLabel(): string {
    if (selectedDay.value === 'custom' && currentCustomTitle.value) {
      return currentCustomTitle.value
    }
    const dayLabel =
      selectedDay.value === 'custom'
        ? t('liturgy.days.custom')
        : t(`liturgy.days.${selectedDay.value}`)
    return t('liturgy.worshipOf', { day: dayLabel })
  }

  const startLabels = computed(() => currentItems.value.map(() => '—'))

  const durationLabels = computed(() =>
    currentItems.value.map((item) => formatMomentDuration(item.durationMs)),
  )

  function confirmClearLiturgy() {
    if (currentItems.value.length === 0 || deletionLocked.value) return
    if (!window.confirm(t('liturgy.messages.confirmClear'))) return
    store.clearAllItems()
  }

  function confirmRemoveItem(index: number) {
    if (deletionLocked.value) return
    const item = currentItems.value[index]
    if (!item) return
    const message =
      item.type === 'category'
        ? t('liturgy.messages.confirmDeleteCategory')
        : t('liturgy.messages.confirmDelete')
    if (!window.confirm(message)) return
    store.removeItem(index)
  }

  function confirmRemoveCustom(index: number) {
    const name = customLiturgies.value[index]?.name ?? ''
    if (
      !window.confirm(t('liturgy.messages.confirmDeleteCustom', { name }))
    ) {
      return
    }
    store.removeCustomLiturgy(index)
  }

  function onSelectItem(index: number) {
    void store.selectItem(index, router)
  }

  function onPlayItemOnScreens(index: number) {
    void store.playItemOnScreens(index)
  }

  function onSelectDay(day: LiturgyDayKey) {
    store.selectDay(day)
  }

  /** Importa itens agendados (DATAPACKET XML) do Delphi: 2 arquivos. */
  async function onImportScheduled() {
    const scheduled = useScheduledStore()
    const bridge = getDesktopBridge()
    async function readXmlFile(): Promise<{ name: string; text: string } | null> {
      if (bridge?.dialog?.openFile && bridge.workspace.readBinaryFile) {
        const file = await bridge.dialog.openFile({
          title: t('liturgy.scheduled.import'),
          filters: [{ name: 'XML (Delphi)', extensions: ['xml'] }],
        })
        const path = Array.isArray(file) ? file[0] : file
        if (!path) return null
        try {
          const bytes = await bridge.workspace.readBinaryFile(path)
          if (!bytes) return null
          return { name: path, text: new TextDecoder().decode(bytes) }
        } catch {
          return null
        }
      }
      // Web: input file
      return await new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.xml'
        input.onchange = () => {
          const f = input.files?.[0]
          if (!f) { resolve(null); return }
          const reader = new FileReader()
          reader.onload = () => resolve({ name: f.name, text: String(reader.result) })
          reader.onerror = () => resolve(null)
          reader.readAsText(f)
        }
        input.click()
      })
    }

    const cats = await readXmlFile()
    if (!cats) return
    // Arquivos irmãos do Delphi ainda não portados — reconhece e avisa.
    const notPorted = ['coletaneasusuario', 'favoritos', 'videosonusuario', 'configpt']
    const firstName = cats.name.toLowerCase()
    if (notPorted.some((n) => firstName.includes(n))) {
      await appConfirm({
        title: t('liturgy.scheduled.import'),
        message: t('liturgy.scheduled.notPorted', { name: cats.name }),
        confirmLabel: t('liturgy.ok'),
      })
      return
    }
    const items = await readXmlFile()
    const n = scheduled.importFromDelphi(cats.text, items?.text ?? null)
    lastActionMessageKey.value = null
    await appConfirm({
      title: t('liturgy.scheduled.import'),
      message: t('liturgy.scheduled.imported', { count: n }),
      confirmLabel: t('liturgy.ok'),
    })
  }

  /** Importa liturgia .ja do LouvorJA Delphi (merge por dia). */
  /**
   * Importa liturgia .ja do LouvorJA Delphi (merge por dia).
   * Desktop: file dialog nativo via IPC. Web: <input type="file">.
   */
  async function onImportJa() {
    let bytes: Uint8Array | null = null
    const bridge = getDesktopBridge()
    if (bridge?.dialog?.openFile && bridge.workspace.readBinaryFile) {
      // Desktop (Electron): diálogo nativo + leitura via IPC (decodifica
      // UTF-8/ANSI no main).
      const file = await bridge.dialog.openFile({
        title: t('liturgy.importJa'),
        filters: [{ name: 'LouvorJA (.ja)', extensions: ['ja'] }],
      })
      const path = Array.isArray(file) ? file[0] : file
      if (!path) return
      try {
        bytes = await bridge.workspace.readBinaryFile(path)
      } catch {
        bytes = null
      }
    } else {
      // Web: input file com FileReader (decodifica no renderer).
      bytes = await pickJaFileWeb()
    }
    if (!bytes) {
      await appConfirm({
        title: t('liturgy.importJa'),
        message: t('liturgy.importJaReadError'),
        confirmLabel: t('liturgy.ok'),
      })
      return
    }
    let parsed
    try {
      parsed = parseJaLiturgy(decodeJaBytes(bytes))
    } catch {
      await appConfirm({
        title: t('liturgy.importJa'),
        message: t('liturgy.importJaInvalid'),
        confirmLabel: t('liturgy.ok'),
      })
      return
    }
    // Duplicados detectados? Pergunta sobrescrever dias vs merge (pular dups).
    const duplicates = store.countJaDuplicates(parsed)
    let mode: 'merge' | 'overwrite' = 'merge'
    if (duplicates > 0) {
      mode = await appConfirm({
        title: t('liturgy.importJaOverwriteTitle'),
        message: t('liturgy.importJaOverwriteAsk', { count: duplicates }),
        confirmLabel: t('liturgy.importJaOverwrite'),
        cancelLabel: t('liturgy.importJaKeep'),
        danger: true,
      })
        ? 'overwrite'
        : 'merge'
    }
    const { added, skipped, days } = await store.importJaDays(parsed, mode)
    lastActionMessageKey.value = null
    await appConfirm({
      title: t('liturgy.importJa'),
      message:
        mode === 'overwrite'
          ? t('liturgy.importJaOverwritten', { added, days: days.length })
          : t('liturgy.importJaDone', { added, skipped, days: days.length }),
      confirmLabel: t('liturgy.ok'),
    })
  }

  /** Abre seletor de arquivo .ja no browser e retorna os bytes. */
  function pickJaFileWeb(): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.ja,text/plain'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        file.arrayBuffer().then(
          (buf) => resolve(new Uint8Array(buf)),
          () => resolve(null),
        )
      }
      input.click()
    })
  }

  function onManageTeam() {
    window.alert(t('liturgy.team.comingSoon'))
  }

  async function runMusicAction(
    index: number,
    action: () => Promise<boolean | void>,
  ) {
    const item = currentItems.value[index]
    const musicId =
      item?.type === 'music' && item.musicId != null ? item.musicId : null
    busyMusicId.value = musicId
    try {
      await action()
    } finally {
      busyMusicId.value = null
    }
  }

  function onMusicSung(index: number) {
    albumsStore.closeLyric()
    void runMusicAction(index, () =>
      store.playMusicMode(index, 'audio', router),
    )
  }

  function onMusicInstrumental(index: number) {
    albumsStore.closeLyric()
    void runMusicAction(index, () =>
      store.playMusicMode(index, 'instrumental', router),
    )
  }

  function onMusicSlides(index: number) {
    albumsStore.closeLyric()
    void runMusicAction(index, () =>
      store.playMusicMode(index, 'no_audio' satisfies MediaPlaybackMode, router),
    )
  }

  function onOpenAddDialog() {
    albumsStore.closeLyric()
    store.openAddDialog()
  }

  function onOpenAddSubItemDialog(categoryId: string) {
    albumsStore.closeLyric()
    store.openAddSubItemDialog(categoryId)
  }

  function onOpenEditDialog(index: number) {
    albumsStore.closeLyric()
    store.openEditDialog(index)
  }

  function onMusicLyric(index: number) {
    const item = currentItems.value[index]
    if (item?.type !== 'music' || item.musicId == null) return
    void runMusicAction(index, () => albumsStore.openLyric(item.musicId!))
  }

  return {
    selectedDay,
    selectedCustomIndex,
    selectedItemIndex,
    siteProjectionItemId,
    customLiturgies,
    lastActionMessageKey,
    itemDialogOpen,
    editingIndex,
    itemDialogLockedCategory,
    itemDialogHideTypePicker,
    itemDraft,
    customDialogOpen,
    newCustomName,
    currentItems,
    currentNotes,
    isDraftValid,
    categoryOptions,
    complementaryTitleSuggestions,
    musicSearchQuery,
    filteredMusic,
    selectedMusic,
    musicCatalogEmpty,
    musicInstrumentalById,
    busyMusicId,
    lyricOpen,
    lyricDoc,
    isLoadingLyric,
    startLabels,
    durationLabels,
    worshipLabel,
    headerDateTime: clock.headerDateTime,
    remainingCountdownLabel: clock.remainingCountdownLabel,
    startTimeInput: clock.startTimeInput,
    endTimeInput: clock.endTimeInput,
    countdownExpired: clock.countdownExpired,
    countdownRunning,
    canStartCountdown,
    canCloneLiturgy,
    cloneDialogOpen,
    cloneSourceKey,
    cloneSources,
    deletionLocked,
    videoProjectionItemId,
    selectDay: onSelectDay,
    importJa: onImportJa,
    importScheduled: onImportScheduled,
    selectCustomLiturgy: store.selectCustomLiturgy,
    setSessionStartFromInput: store.setSessionStartFromInput,
    clearSessionStart: store.clearSessionStart,
    setSessionEndFromInput: store.setSessionEndFromInput,
    clearSessionEnd: store.clearSessionEnd,
    startCountdown: store.startCountdown,
    stopCountdown: store.stopCountdown,
    openAddDialog: onOpenAddDialog,
    openAddSubItemDialog: onOpenAddSubItemDialog,
    openEditDialog: onOpenEditDialog,
    closeItemDialog: store.closeItemDialog,
    saveItemDraft: store.saveItemDraft,
    setItemPlayer: store.setItemPlayer,
    setItemDraft: store.setItemDraft,
    setMusicSearchQuery: store.setMusicSearchQuery,
    confirmRemoveItem,
    confirmClearLiturgy,
    reorderItems: store.reorderItems,
    selectItem: onSelectItem,
    playItemOnScreens: onPlayItemOnScreens,
    toggleItemDone: store.toggleItemDone,
    openCustomDialog: store.openCustomDialog,
    closeCustomDialog: store.closeCustomDialog,
    createCustomLiturgy: store.createCustomLiturgy,
    confirmRemoveCustom,
    openCloneDialog: store.openCloneDialog,
    closeCloneDialog: store.closeCloneDialog,
    cloneLiturgyFromSelected: store.cloneLiturgyFromSelected,
    toggleDeletionLock: store.toggleDeletionLock,
    clearActionMessage: store.clearActionMessage,
    setActionMessage: store.setActionMessage,
    setNotes: store.setNotes,
    onManageTeam,
    onMusicPick: store.onMusicPick,
    clearMusicPick: store.clearMusicPick,
    refreshMusicCatalog: store.refreshMusicCatalog,
    onVideoFileSelected(itemId: string, durationSec: number) {
      store.setItemDurationMs(itemId, Math.round(durationSec * 1000))
    },
    onMusicSung,
    onMusicInstrumental,
    onMusicSlides,
    onMusicLyric,
    closeLyric: albumsStore.closeLyric,
  }
}
