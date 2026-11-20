<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import BibleBookGrid from './BibleBookGrid.vue'
import BibleChapterGrid from './BibleChapterGrid.vue'
import type { BibleBook, BibleTestament } from '../types/bible'

defineProps<{
  books: BibleBook[]
  selectedBookId: number | null
  testament: BibleTestament
  bookSearchQuery: string
  chapters: number[]
  selectedChapter: number
  chapterSearchQuery: string
}>()

const emit = defineEmits<{
  'update:bookSearchQuery': [value: string]
  bookSearchSubmit: []
  'update:chapterSearchQuery': [value: string]
  'update:testament': [value: BibleTestament]
  selectBook: [bookId: number]
  selectChapter: [chapter: number]
}>()

const { t } = useI18n()
</script>

<template>
  <GlassCard
    class="bible-nav-panel"
    :padding="false"
    elevated
  >
    <div class="bible-nav-panel__inner">
      <BibleBookGrid
        :books="books"
        :selected-book-id="selectedBookId"
        :testament="testament"
        :search-query="bookSearchQuery"
        @update:search-query="emit('update:bookSearchQuery', $event)"
        @search-submit="emit('bookSearchSubmit')"
        @update:testament="emit('update:testament', $event)"
        @select-book="emit('selectBook', $event)"
      />

      <div
        class="bible-nav-panel__divider"
        aria-hidden="true"
      />

      <BibleChapterGrid
        :chapters="chapters"
        :selected-chapter="selectedChapter"
        :search-query="chapterSearchQuery"
        @update:search-query="emit('update:chapterSearchQuery', $event)"
        @select-chapter="emit('selectChapter', $event)"
      />
    </div>
    <span class="visually-hidden">{{ t('bible.browseBooksAndChapters') }}</span>
  </GlassCard>
</template>

<style scoped lang="scss">
.bible-nav-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.bible-nav-panel__inner {
  display: flex;
  gap: 1.25rem;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  padding: 1.25rem;
  overflow: hidden;

  @media (max-width: 1280px) {
      gap: 0.75rem;
      padding: 0.75rem;
    }
}

.bible-nav-panel__divider {
  width: 1px;
  align-self: stretch;
  background: var(--ds-color-outline);
  flex-shrink: 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
