import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, toRef } from 'vue'

import { bibleProjectionSnippet, hasBibleProjection } from '../services/bible-preview'
import { useBibleStore } from '../stores/useBibleStore'

/** Orquestra leitura bíblica (catálogo, navegação e seleção). */
export function useBibleReader() {
  const store = useBibleStore()
  const {
    books,
    versions,
    selectedVersionId,
    selectedBookId,
    selectedChapter,
    selectedVerses,
    testamentFilter,
    showNavPanel,
    bookSearchQuery,
    chapterSearchQuery,
    verseSearchQuery,
    globalSearchQuery,
    isLoadingMeta,
    isLoadingVerses,
    lastErrorKey,
    isProjecting,
    projection,
    selectedBook,
    selectedVersion,
    filteredBooks,
    chapterNumbers,
    locationLabel,
    chapterTitle,
    verseEntries,
    visibleVerseEntries,
  } = storeToRefs(store)

  const hasProjection = computed(() => hasBibleProjection(projection.value))

  const previewSnippet = computed(() => bibleProjectionSnippet(projection.value.text))

  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null
    const tag = target?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
      return
    }

    const isArrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    // Alt+setas é do histórico de navegação; Ctrl/Meta+setas ficam livres.
    if (isArrow && (event.altKey || event.ctrlKey || event.metaKey)) return

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      void store.goToAdjacentVerse(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      void store.goToAdjacentVerse(1)
    } else if (event.key === 'Escape') {
      if (store.inAppPreview) {
        store.clearProjectionWindow()
        return
      }
      store.clearSelection()
    }
  }

  onMounted(() => {
    void store.bootstrap()
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })

  return {
    books,
    versions,
    selectedVersionId,
    selectedBookId,
    selectedChapter,
    selectedVerses,
    testamentFilter,
    showNavPanel,
    bookSearchQuery,
    chapterSearchQuery,
    verseSearchQuery,
    globalSearchQuery,
    isLoadingMeta,
    isLoadingVerses,
    lastErrorKey,
    isProjecting,
    projection,
    selectedBook,
    selectedVersion,
    filteredBooks,
    chapterNumbers,
    locationLabel,
    chapterTitle,
    verseEntries,
    visibleVerseEntries,
    hasProjection,
    previewSnippet,
    clearError: store.clearError,
    selectVersion: store.selectVersion,
    selectBook: store.selectBook,
    selectChapter: store.selectChapter,
    selectVerse: store.selectVerse,
    applyVerseSearch: store.applyVerseSearch,
    applyBookSearchReference: store.applyBookSearchReference,
    clearSelection: store.clearSelection,
    setTestamentFilter: store.setTestamentFilter,
    toggleNavPanel: store.toggleNavPanel,
    goToAdjacentVerse: store.goToAdjacentVerse,
    syncProjection: store.syncProjection,
    toggleProjection: store.toggleProjection,
    projectTvsOnly: store.projectTvsOnly,
    projectingTvsOnly: toRef(store, 'projectingTvsOnly'),
    inAppPreview: toRef(store, 'inAppPreview'),
    clearProjectionWindow: store.clearProjectionWindow,
    refresh: store.bootstrap,
  }
}
