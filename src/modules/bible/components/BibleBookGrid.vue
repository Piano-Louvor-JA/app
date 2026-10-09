<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { resolveBookTone } from '../services/bible-catalog'
import type { BibleBook, BibleTestament } from '../types/bible'

defineProps<{
  books: BibleBook[]
  selectedBookId: number | null
  testament: BibleTestament
  searchQuery: string
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:testament': [value: BibleTestament]
  selectBook: [bookId: number]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="bible-books">
    <div class="bible-books__search">
      <i
        class="ti ti-search bible-books__search-icon"
        aria-hidden="true"
      />
      <input
        class="bible-books__search-input"
        type="search"
        :value="searchQuery"
        :placeholder="t('bible.searchBook')"
        :aria-label="t('bible.searchBook')"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      >
    </div>

    <div class="bible-books__header">
      <h2 class="bible-books__title">
        {{ t('bible.books') }}
      </h2>
      <div
        class="bible-books__tabs"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          class="bible-books__tab"
          :class="{ 'bible-books__tab--active': testament === 'ot' }"
          :aria-selected="testament === 'ot'"
          @click="emit('update:testament', 'ot')"
        >
          {{ t('bible.testamentOld') }}
        </button>
        <button
          type="button"
          role="tab"
          class="bible-books__tab"
          :class="{ 'bible-books__tab--active': testament === 'nt' }"
          :aria-selected="testament === 'nt'"
          @click="emit('update:testament', 'nt')"
        >
          {{ t('bible.testamentNew') }}
        </button>
      </div>
    </div>

    <div class="bible-books__grid">
      <button
        v-for="book in books"
        :id="`bible-book-${book.id}`"
        :key="book.id"
        type="button"
        class="bible-books__tile"
        :class="[
          `bible-books__tile--${resolveBookTone(book.bookNumber)}`,
          { 'bible-books__tile--active': book.id === selectedBookId },
        ]"
        @click="emit('selectBook', book.id)"
      >
        <span class="bible-books__abbr">{{ book.abbreviation }}</span>
        <span class="bible-books__name">{{ book.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bible-books {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex: 2;
  height: 100%;
  overflow: hidden;
  container-type: inline-size;
  container-name: bible-books;
}

.bible-books__search {
  position: relative;
  margin-bottom: 1rem;
  flex-shrink: 0;
  padding: 2px;

  @media (max-width: 1280px) {
      margin-bottom: 0.55rem;
    }
}

.bible-books__search-icon {
  position: absolute;
  left: calc(0.75rem + 2px);
  top: 50%;
  transform: translateY(-50%);
  color: var(--ds-color-on-surface-variant);
  font-size: 1rem;
  pointer-events: none;
}

.bible-books__search-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ds-color-outline-strong) 80%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: var(--ds-color-surface-container);
  color: var(--ds-color-on-surface);
  padding: 0.55rem 0.75rem 0.55rem 2.35rem;
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;

  &:focus {
    border-color: color-mix(in srgb, var(--ds-color-primary) 70%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  }

  @media (max-width: 1280px) {
      padding: 0.4rem 0.6rem 0.4rem 2.1rem;
      font-size: 0.8rem;
    }
}


.bible-books__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-shrink: 0;

  @media (max-width: 1280px) {
      margin-bottom: 0.55rem;
      gap: 0.5rem;
    }
}

.bible-books__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ds-color-primary-soft);

  @media (max-width: 1280px) {
      font-size: 0.8rem;
    }
}

.bible-books__tabs {
  display: inline-flex;
  gap: 0.15rem;
  padding: 0.2rem;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: var(--ds-color-surface-container);
}

.bible-books__tab {
  border: 0;
  border-radius: 0.4rem 0 0.4rem 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.35rem 0.85rem;
  cursor: pointer;

  &--active {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ds-color-primary) 25%, transparent);
  }

  @media (max-width: 1280px) {
      font-size: 0.72rem;
      padding: 0.25rem 0.6rem;
    }
}

.bible-books__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  overflow-y: auto;
  padding-right: 0.25rem;
  flex: 1;
  min-height: 0;
  align-content: start;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--ds-color-outline);
    border-radius: 999px;
  }

  @media (max-width: 1280px) {
      gap: 0.35rem;
    }
}

@container bible-books (min-width: 40rem) {
  .bible-books__grid {
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 0.4rem;
  }

  .bible-books__abbr {
    font-size: 0.95rem;
  
    @media (max-width: 1280px) {
        font-size: 0.85rem;
      }
}

  .bible-books__name {
    font-size: 9px;
  
    @media (max-width: 1280px) {
        font-size: 8px;
      }
}
}

.bible-books__tile {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  padding: 0.35rem;
  text-align: center;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    filter 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgb(0 0 0 / 0.3);
  }

  // ═══════════════════════════════════════════════════
  //  ANTIGO TESTAMENTO
  //  Base: azul (Lei), verde (História), marrom-âmbar (Profetas)
  // ═══════════════════════════════════════════════════

  // Lei — azul
  &--law {
    background: color-mix(in srgb, #3b82f6 18%, transparent);
    color: #93c5fd;
  }

  // História — verde
  &--history {
    background: color-mix(in srgb, #22c55e 12%, transparent);
    color: color-mix(in srgb, #86efac 85%, transparent);
  }

  // Poesia — âmbar-clara
  &--poetry {
    background: color-mix(in srgb, #d97706 14%, transparent);
    color: color-mix(in srgb, #fef3c7 85%, transparent);
  }

  // Profetas Maiores — âmbar
  &--major-prophet {
    background: color-mix(in srgb, #ca8a04 14%, transparent);
    color: color-mix(in srgb, #fde68a 85%, transparent);
  }

  // Profetas Menores — âmbar-escura
  &--minor-prophet {
    background: color-mix(in srgb, #b45309 14%, transparent);
    color: color-mix(in srgb, #fcd34d 85%, transparent);
  }

  // ═══════════════════════════════════════════════════
  //  NOVO TESTAMENTO
  //  Base: roxo (Evangelhos) com variações na família púrpura/violeta
  // ═══════════════════════════════════════════════════

  // Evangelhos — roxo
  &--gospels {
    background: color-mix(in srgb, #a855f7 12%, transparent);
    color: color-mix(in srgb, #d8b4fe 85%, transparent);
  }

  // Atos — roxo-azulada (transição Evangelhos → Cartas)
  &--acts {
    background: color-mix(in srgb, #6366f1 12%, transparent);
    color: color-mix(in srgb, #c7d2fe 85%, transparent);
  }

  // Cartas Paulinas — violeta
  &--pauline {
    background: color-mix(in srgb, #8b5cf6 12%, transparent);
    color: color-mix(in srgb, #ddd6fe 85%, transparent);
  }

  // Cartas Gerais — índigo
  &--general {
    background: color-mix(in srgb, #7c3aed 12%, transparent);
    color: color-mix(in srgb, #d0bcfe 85%, transparent);
  }

  // Apocalipse — púrpura-profundo (escatológico)
  &--apocalyptic {
    background: color-mix(in srgb, #c026d3 12%, transparent);
    color: color-mix(in srgb, #f3e8ff 85%, transparent);
  }

  &--neutral {
    background: color-mix(in srgb, white 5%, transparent);
    color: var(--ds-color-on-surface-variant);
  }

  &--active {
    background: color-mix(in srgb, #ca8a04 40%, transparent);
    border-color: #eab308;
    color: #fef08a;
    font-weight: 700;
  }

  @media (max-width: 1280px) {
      padding: 0.2rem;
      gap: 0.05rem;
    }
}

.bible-books__abbr {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.1;
}

.bible-books__name {
  font-size: 10px;
  opacity: 0.85;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<style lang="scss">
[data-mode='light'] .bible-books__search-input {
  background: #f7f8fc;
  border-color: #e8ecf3;
}

[data-mode='light'] .bible-books__search-input:focus {
  background: #fff;
}

[data-mode='light'] .bible-books__tabs {
  background: #f7f8fc;
}

[data-mode='light'] .bible-books__tile:hover {
  box-shadow: none;
  filter: brightness(0.97);
}

[data-mode='light'] .bible-books__tile--law {
  background: #bfdbfe;
  color: #1e40af;
  border-color: #60a5fa;
}

[data-mode='light'] .bible-books__tile--history {
  background: #bbf7d0;
  color: #166534;
  border-color: #4ade80;
}

[data-mode='light'] .bible-books__tile--prophets,
[data-mode='light'] .bible-books__tile--major-prophet {
  background: #fecaca;
  color: #991b1b;
  border-color: #f87171;
}

[data-mode='light'] .bible-books__tile--poetry {
  background: #fef3c7;
  color: #78350f;
  border-color: #d97706;
}

[data-mode='light'] .bible-books__tile--minor-prophet {
  background: #fed7aa;
  color: #9a3412;
  border-color: #fb923c;
}

[data-mode='light'] .bible-books__tile--gospels {
  background: #e9d5ff;
  color: #6b21a8;
  border-color: #c084fc;
}

[data-mode='light'] .bible-books__tile--acts {
  background: #c7d2fe;
  color: #3730a3;
  border-color: #818cf8;
}

[data-mode='light'] .bible-books__tile--pauline {
  background: #ddd6fe;
  color: #5b21b6;
  border-color: #a78bfa;
}

[data-mode='light'] .bible-books__tile--general {
  background: #e9d5ff;
  color: #6b21a8;
  border-color: #c084fc;
}

[data-mode='light'] .bible-books__tile--apocalyptic {
  background: #f3e8ff;
  color: #86198f;
  border-color: #d946ef;
}

[data-mode='light'] .bible-books__tile--letters,
[data-mode='light'] .bible-books__tile--neutral {
  background: #f1f3f7;
  color: #475569;
  border-color: #e2e8f0;
}

[data-mode='light'] .bible-books__tile--active {
  background: #fdba74;
  border-color: #ea580c;
  color: #7c2d12;
  filter: none;
  box-shadow: 0 2px 8px rgb(234 88 12 / 0.28);
}

[data-mode='light'] .bible-books__name {
  opacity: 1;
}
</style>
