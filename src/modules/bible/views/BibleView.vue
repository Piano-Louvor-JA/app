<script setup lang="ts">
import { computed, ref } from 'vue'
import BibleComparison from '../components/BibleComparison.vue'
import BundledBibleSearch from '../components/BundledBibleSearch.vue'
import { isBundledBible, type BibleSearchHit } from '../services/bundled-bibles'
import bibleSources from '../data/manifest.json'
import { useI18n } from 'vue-i18n'

import PalcoRouteSelect from '../../settings/components/PalcoRouteSelect.vue'
import BibleNavPanel from '../components/BibleNavPanel.vue'
import BibleToolbar from '../components/BibleToolbar.vue'
import BibleVerseList from '../components/BibleVerseList.vue'
import { useBibleReader } from '../composables/useBibleReader'

const { t } = useI18n()
const comparisonOpen = ref(false)
const activeSource = computed(() => bibleSources.find(source => source.id === selectedVersionId.value))
const showFullSearch = computed(() => Boolean(globalSearchQuery.value.trim()) && isBundledBible(selectedVersionId.value ?? 0))
async function openSearchHit(hit: BibleSearchHit) {
  globalSearchQuery.value = ''
  verseSearchQuery.value = ''
  await selectBook(hit.bookId)
  await selectChapter(hit.chapter)
  selectVerse(hit.verse)
}


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
  openReference,
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
    <p v-if="activeSource" class="bible-source">
      {{ t('catalog.offline') }} · <a :href="activeSource.source" target="_blank" rel="noopener noreferrer">{{ t('catalog.source') }} : {{ activeSource.name }}</a>
      <span>{{ t('catalog.editionNote') }}</span>
    </p>
    <BibleToolbar
      :versions="versions"
      :selected-version-id="selectedVersionId"
      :location-label="locationLabel"
      :show-nav-panel="showNavPanel"
      :bible-search-query="globalSearchQuery"
      :versions-disabled="isLoadingMeta"
      @select-version="selectVersion"
      @open-reference="openReference(globalSearchQuery)"
      @toggle-nav="toggleNavPanel"
      @update:bible-search-query="globalSearchQuery = $event"
    />
    <PalcoRouteSelect module="bible" />
    <div class="bible-study-tools">
      <small>{{ t('bibleStudy.referenceHint') }}</small>
      <button v-if="versions.length > 1" type="button" :aria-pressed="comparisonOpen" @click="comparisonOpen = !comparisonOpen"><i class="ti ti-columns-2" aria-hidden="true" /> {{ t('bibleStudy.compare') }}</button>
    </div>

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

    <BundledBibleSearch v-else-if="showFullSearch && selectedVersionId" :version-id="selectedVersionId" :query="globalSearchQuery" @select="openSearchHit" />
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

    <BibleComparison v-if="comparisonOpen" :versions="versions" :version-id="selectedVersionId" :book-id="selectedBookId" :chapter="selectedChapter ?? 1" :verses="selectedVerses" @close="comparisonOpen = false" />

  </section>
</template>

<style scoped lang="scss">
.bible-source { margin:0; font-size:.75rem; opacity:.85; }
.bible-source a { color:var(--ds-color-primary); }
.bible-source span { display:block; margin-top:.2rem; }
.bible-study-tools { display: flex; align-items: center; justify-content: space-between; gap: .65rem; flex-shrink: 0; color: var(--ds-color-on-surface-variant); }
.bible-study-tools small { font-size: .72rem; }
.bible-study-tools button { padding: .4rem .7rem; font: inherit; font-size: .75rem; white-space: nowrap; color: var(--ds-color-primary); background: transparent; border: 1px solid var(--ds-color-outline); border-radius: .6rem; cursor: pointer; }

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
