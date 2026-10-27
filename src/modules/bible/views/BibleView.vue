<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PalcoRouteSelect from '../../settings/components/PalcoRouteSelect.vue'
import BibleNavPanel from '../components/BibleNavPanel.vue'
import BibleToolbar from '../components/BibleToolbar.vue'
import BibleVerseList from '../components/BibleVerseList.vue'
import { useBibleReader } from '../composables/useBibleReader'

const { t } = useI18n()

const {
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
  projection,
  filteredBooks,
  chapterNumbers,
  locationLabel,
  chapterTitle,
  verseEntries,
  hasProjection,
  clearError,
  selectVersion,
  selectBook,
  selectChapter,
  selectVerse,
  applyBookSearchReference,
  clearSelection,
  goToAdjacentVerse,
  setTestamentFilter,
  toggleNavPanel,
  refresh,
} = useBibleReader()

function onPreviousVerse() {
  void goToAdjacentVerse(-1)
}

function onNextVerse() {
  void goToAdjacentVerse(1)
}
</script>

<template>
  <section class="bible-view">
    <BibleToolbar
      :versions="versions"
      :selected-version-id="selectedVersionId"
      :location-label="locationLabel"
      :show-nav-panel="showNavPanel"
      :bible-search-query="globalSearchQuery"
      :versions-disabled="isLoadingMeta"
      @select-version="selectVersion"
      @toggle-nav="toggleNavPanel"
      @update:bible-search-query="globalSearchQuery = $event"
    />
    <PalcoRouteSelect module="bible" />

    <div
      v-if="lastErrorKey"
      class="bible-view__alert"
      role="alert"
    >
      <p>{{ t(lastErrorKey) }}</p>
      <div class="bible-view__alert-actions">
        <button
          type="button"
          class="bible-view__alert-btn"
          @click="refresh"
        >
          {{ t('bible.retry') }}
        </button>
        <button
          type="button"
          class="bible-view__alert-btn bible-view__alert-btn--ghost"
          @click="clearError"
        >
          {{ t('bible.dismiss') }}
        </button>
      </div>
    </div>

    <div
      v-else-if="isLoadingMeta"
      class="bible-view__state"
    >
      {{ t('bible.loading') }}
    </div>

    <div
      v-else-if="filteredBooks.length === 0 && versions.length === 0"
      class="bible-view__state"
    >
      {{ t('bible.emptyCatalog') }}
    </div>

    <div
      v-else
      class="bible-view__body"
      :class="{ 'bible-view__body--reader-only': !showNavPanel }"
    >
      <BibleNavPanel
        v-if="showNavPanel"
        class="bible-view__nav"
        :books="filteredBooks"
        :selected-book-id="selectedBookId"
        :testament="testamentFilter"
        :book-search-query="bookSearchQuery"
        :chapters="chapterNumbers"
        :selected-chapter="selectedChapter"
        :chapter-search-query="chapterSearchQuery"
        @update:book-search-query="bookSearchQuery = $event"
        @book-search-submit="applyBookSearchReference"
        @update:chapter-search-query="chapterSearchQuery = $event"
        @update:testament="setTestamentFilter"
        @select-book="selectBook"
        @select-chapter="selectChapter"
      />

      <BibleVerseList
        class="bible-view__reader"
        :chapter-title="chapterTitle"
        :verses="verseEntries"
        :selected-verses="selectedVerses"
        :verse-search-query="verseSearchQuery"
        :is-loading="isLoadingVerses"
        :projection="projection"
        :has-projection="hasProjection"
        @update:verse-search-query="verseSearchQuery = $event"
        @select-verse="selectVerse"
        @previous-verse="onPreviousVerse"
        @next-verse="onNextVerse"
        @clear-projection="clearSelection"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.bible-view {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  /* Ocupa o main sem estourar — scroll só nas listas internas. */
  flex: 1 1 auto;
  min-height: 0;
  max-height: 100%;
  padding: 0.65rem var(--ds-spacing-page, 2rem) 0.35rem;
  overflow: hidden;

  @media (max-width: 1280px) {
    gap: 0.5rem;
    padding-top: 0.45rem;
  }
}

.bible-view__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 1rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  &--reader-only {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 1280px) {
    gap: 0.65rem;
  }

  @media (max-width: 960px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 0.95fr) minmax(0, 1.05fr);
  }
}

.bible-view__nav,
.bible-view__reader {
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;

  :deep(.ds-glass-card) {
    height: 100%;
    min-height: 0;
  }
}

.bible-view :deep(.bible-toolbar) {
  flex-shrink: 0;
}

.bible-view :deep(.palco-route) {
  flex-shrink: 0;
}

.bible-view__state,
.bible-view__alert {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 72%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  padding: 1.5rem;
  color: var(--ds-color-on-surface-variant);
}

.bible-view__alert {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  p {
    margin: 0;
    color: var(--ds-color-on-surface);
  }
}

.bible-view__alert-actions {
  display: flex;
  gap: 0.5rem;
}

.bible-view__alert-btn {
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary-soft);
  padding: 0.4rem 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &--ghost {
    background: transparent;
    border: 1px solid var(--ds-color-outline);
  }
}
</style>

<style lang="scss">
[data-mode='light'] .bible-view .ds-glass-card {
  background: color-mix(in srgb, #ffffff 82%, transparent);
  border-color: #e8ecf3;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.03);
}

[data-mode='light'] .bible-view .ds-glass-card:hover {
  background: color-mix(in srgb, #ffffff 90%, transparent);
}

[data-mode='light'] .bible-view__state,
[data-mode='light'] .bible-view__alert {
  background: color-mix(in srgb, #ffffff 82%, transparent);
  border-color: #e8ecf3;
}
</style>
