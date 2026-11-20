<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  addBibleRecent,
  clearBibleRecents,
  loadBibleRecents,
  suggestBible,
  type BibleSuggestion,
} from '../services/bible-smart-search'
import type { BibleBook } from '../types/bible'

const props = defineProps<{ books: BibleBook[] }>()

const emit = defineEmits<{
  openPassage: [bookId: number, chapter: number, verses: number[]]
  searchText: [query: string]
}>()

const { t } = useI18n()

const EXAMPLES = ['jo 3:16', 'sl 23', '1 co 13:4-7', 'is 53', 'amor']

const query = ref('')
const open = ref(false)
const active = ref(0)
const recents = ref<string[]>(loadBibleRecents())
const inputEl = ref<HTMLInputElement | null>(null)

const suggestions = computed(() => suggestBible(query.value, props.books))
/** Capítulos para clicar: só quando o 1º resultado é um livro. */
const chapterBook = computed(() => {
  const first = suggestions.value[0]
  return first?.kind === 'book' ? first.book! : null
})

watch(query, () => {
  active.value = 0
})

function remember(entry: string) {
  recents.value = addBibleRecent(entry)
}

function openModal() {
  open.value = true
  void nextTick(() => inputEl.value?.focus())
}

function close() {
  open.value = false
  query.value = ''
}

function pick(s: BibleSuggestion) {
  if (s.kind === 'book') {
    // Completa o nome e deixa digitar o capítulo (ou clicar num número).
    query.value = `${s.book!.name} `
    void nextTick(() => inputEl.value?.focus())
    return
  }
  if (s.kind === 'reference') {
    remember(s.label)
    emit('openPassage', s.book!.id, s.chapter!, s.verses)
  } else {
    remember(s.query)
    emit('searchText', s.query)
  }
  close()
}

function pickChapter(book: BibleBook, chapter: number) {
  remember(`${book.name} ${chapter}`)
  emit('openPassage', book.id, chapter, [])
  close()
}

function runEntry(entry: string) {
  const first = suggestBible(entry, props.books)[0]
  if (first) pick(first)
}

function fillExample(example: string) {
  query.value = example
  void nextTick(() => inputEl.value?.focus())
}

function onKeydown(event: KeyboardEvent) {
  const total = suggestions.value.length
  if (event.key === 'ArrowDown' && total > 0) {
    event.preventDefault()
    active.value = (active.value + 1) % total
  } else if (event.key === 'ArrowUp' && total > 0) {
    event.preventDefault()
    active.value = (active.value - 1 + total) % total
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const s = suggestions.value[active.value]
    if (s) pick(s)
  } else if (event.key === 'Escape') {
    close()
  }
}

function subtitle(s: BibleSuggestion): string {
  if (s.kind === 'book') return t('bible.smartSearch.chapterCount', { n: s.book!.chapters })
  if (s.kind === 'reference') {
    return s.verses.length === 0
      ? t('bible.smartSearch.wholeChapter')
      : t('bible.smartSearch.verseCount', { n: s.verses.length })
  }
  return t('bible.smartSearch.textSubtitle')
}
</script>

<template>
  <div class="smart-search">
    <button
      type="button"
      class="smart-search__field smart-search__trigger"
      :aria-label="t('bible.searchBible')"
      @click="openModal"
    >
      <i
        class="ti ti-search smart-search__icon"
        aria-hidden="true"
      />
      <span class="smart-search__placeholder">{{ t('bible.smartSearch.hint') }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="smart-search__overlay"
        @mousedown.self="close"
      >
        <div
          class="smart-search__dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('bible.searchBible')"
        >
          <div class="smart-search__field smart-search__field--modal">
            <i
              class="ti ti-search smart-search__icon"
              aria-hidden="true"
            />
            <input
              ref="inputEl"
              v-model="query"
              class="smart-search__input"
              type="search"
              :placeholder="t('bible.smartSearch.hint')"
              autocomplete="off"
              @keydown="onKeydown"
            >
            <button
              type="button"
              class="smart-search__close"
              :aria-label="t('bible.smartSearch.close')"
              @click="close"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </div>

          <div
            class="smart-search__panel"
            role="listbox"
          >
      <template v-if="!query.trim()">
        <template v-if="recents.length > 0">
          <div class="smart-search__head">
            <span>{{ t('bible.smartSearch.recent') }}</span>
            <button
              type="button"
              class="smart-search__link"
              @click="clearBibleRecents(); recents = []"
            >
              {{ t('bible.smartSearch.clearRecent') }}
            </button>
          </div>
          <div class="smart-search__chips">
            <button
              v-for="r in recents"
              :key="r"
              type="button"
              class="smart-search__chip"
              @click="runEntry(r)"
            >
              <i
                class="ti ti-history"
                aria-hidden="true"
              />{{ r }}
            </button>
          </div>
        </template>
        <div class="smart-search__head">
          <span>{{ t('bible.smartSearch.examples') }}</span>
        </div>
        <div class="smart-search__chips">
          <button
            v-for="e in EXAMPLES"
            :key="e"
            type="button"
            class="smart-search__chip"
            @click="fillExample(e)"
          >
            {{ e }}
          </button>
        </div>
        <p class="smart-search__tip">
          {{ t('bible.smartSearch.tip') }}
        </p>
      </template>

      <p
        v-else-if="suggestions.length === 0"
        class="smart-search__tip"
      >
        {{ t('bible.smartSearch.noResults') }}
      </p>

      <template v-else>
        <template
          v-for="(s, i) in suggestions"
          :key="`${s.kind}-${s.label}`"
        >
          <button
            type="button"
            role="option"
            class="smart-search__item"
            :class="{ 'smart-search__item--active': i === active }"
            :aria-selected="i === active"
            @mouseenter="active = i"
            @click="pick(s)"
          >
            <span
              v-if="s.book"
              class="smart-search__badge"
            >{{ s.book.abbreviation }}</span>
            <span
              v-else
              class="smart-search__badge smart-search__badge--text"
            ><i
              class="ti ti-text-recognition"
              aria-hidden="true"
            /></span>
            <span class="smart-search__texts">
              <span class="smart-search__title">
                {{ s.kind === 'text' ? t('bible.smartSearch.searchText', { q: s.query }) : s.label }}
              </span>
              <span class="smart-search__sub">{{ subtitle(s) }}</span>
            </span>
            <i
              :class="['ti', s.kind === 'book' ? 'ti-arrow-up-left' : i === active ? 'ti-corner-down-left' : 'ti-chevron-right', 'smart-search__go']"
              aria-hidden="true"
            />
          </button>
          <div
            v-if="i === 0 && chapterBook"
            class="smart-search__chapters"
          >
            <button
              v-for="n in chapterBook.chapters"
              :key="n"
              type="button"
              class="smart-search__chapter"
              @click="pickChapter(chapterBook, n)"
            >
              {{ n }}
            </button>
          </div>
        </template>
      </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.smart-search {
  position: relative;
  width: min(26rem, 32vw);
}

.smart-search__field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.85rem;
  height: 2.6rem;
  border-radius: 999px;
  border: 1px solid var(--ds-color-outline);
  background: var(--ds-color-surface-container);

  &:focus-within {
    border-color: var(--ds-color-primary);
  }
}

.smart-search__icon {
  color: var(--ds-color-on-surface-variant);
}

.smart-search__input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.9rem;
}

.smart-search__trigger {
  width: 100%;
  cursor: text;
  color: var(--ds-color-on-surface-variant);
  font: inherit;
  font-size: 0.9rem;
  text-align: left;

  &:hover {
    border-color: var(--ds-color-primary);
  }
}

.smart-search__placeholder {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.smart-search__overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(2px);
}

.smart-search__dialog {
  display: flex;
  flex-direction: column;
  width: min(44rem, 92vw);
  max-height: 76vh;
  border-radius: 18px;
  border: 1px solid var(--ds-color-outline);
  background: var(--ds-color-surface);
  box-shadow: 0 24px 60px rgb(0 0 0 / 45%);
  overflow: hidden;
}

.smart-search__field--modal {
  height: 3.4rem;
  margin: 0.9rem;
  border-radius: 14px;
  border-color: var(--ds-color-primary);

  .smart-search__input {
    font-size: 1.05rem;
  }
}

.smart-search__close {
  border: 0;
  background: none;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  font-size: 1.1rem;

  &:hover {
    color: var(--ds-color-on-surface);
  }
}

.smart-search__panel {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.9rem 0.9rem;
}

.smart-search__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0.35rem 0.25rem 0.4rem;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-color-primary);
}

.smart-search__link {
  border: 0;
  background: none;
  color: var(--ds-color-primary);
  cursor: pointer;
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
}

.smart-search__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.smart-search__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--ds-color-outline);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-size: 0.85rem;

  i {
    color: var(--ds-color-primary);
  }

  &:hover {
    border-color: var(--ds-color-primary);
  }
}

.smart-search__tip {
  margin: 0.25rem;
  font-size: 0.8rem;
  color: var(--ds-color-on-surface-variant);
}

.smart-search__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  text-align: left;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  }
}

.smart-search__badge {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);

  &--text {
    background: var(--ds-color-surface-container);
    color: var(--ds-color-on-surface-variant);
  }
}

.smart-search__texts {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.smart-search__title {
  font-weight: 600;
}

.smart-search__sub {
  font-size: 0.78rem;
  color: var(--ds-color-on-surface-variant);
}

.smart-search__go {
  color: var(--ds-color-on-surface-variant);
}

.smart-search__chapters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.4rem, 1fr));
  gap: 0.35rem;
  max-height: 9.5rem;
  overflow-y: auto;
  margin: 0.3rem 0.6rem 0.6rem;
}

.smart-search__chapter {
  height: 2.2rem;
  border-radius: 8px;
  border: 1px solid var(--ds-color-outline);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;

  &:hover {
    border-color: var(--ds-color-primary);
    color: var(--ds-color-primary);
  }
}
</style>
