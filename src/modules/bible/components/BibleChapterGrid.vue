<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  chapters: number[]
  selectedChapter: number
  searchQuery: string
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  selectChapter: [chapter: number]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="bible-chapters">
    <div class="bible-chapters__search">
      <i
        class="ti ti-search bible-chapters__search-icon"
        aria-hidden="true"
      />
      <input
        class="bible-chapters__search-input"
        type="search"
        :value="searchQuery"
        :placeholder="t('bible.searchChapter')"
        :aria-label="t('bible.searchChapter')"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      >
    </div>

    <h2 class="bible-chapters__title">
      {{ t('bible.chapters') }}
    </h2>

    <div class="bible-chapters__grid">
      <button
        v-for="chapter in chapters"
        :id="`bible-chapter-${chapter}`"
        :key="chapter"
        type="button"
        class="bible-chapters__btn"
        :class="{ 'bible-chapters__btn--active': chapter === selectedChapter }"
        @click="emit('selectChapter', chapter)"
      >
        {{ chapter }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bible-chapters {
  display: flex;
  flex-direction: column;
  width: auto;
  min-width: 0;
  flex: 0 0 clamp(7rem, 12vw, 10rem);
  height: 100%;
  min-height: 0;
  overflow: hidden;

}

.bible-chapters__search {
  position: relative;
  margin-bottom: 1rem;
  flex-shrink: 0;
  padding: 2px;

  @media (max-width: 1280px) {
      margin-bottom: 0.55rem;
    }
}

.bible-chapters__search-icon {
  position: absolute;
  left: calc(0.75rem + 2px);
  top: 50%;
  transform: translateY(-50%);
  color: var(--ds-color-on-surface-variant);
  font-size: 1rem;
  pointer-events: none;
}

.bible-chapters__search-input {
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


.bible-chapters__title {
  margin: 0 0 1rem;
  flex-shrink: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ds-color-primary-soft);

  @media (max-width: 1280px) {
      margin-bottom: 0.55rem;
      font-size: 0.8rem;
    }
}

.bible-chapters__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(2rem, 1fr));
  gap: 0.5rem;
  overflow-y: auto;
  padding-right: 0.15rem;
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
      gap: 0.3rem;
    }
}

.bible-chapters__btn {
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--ds-color-outline-strong) 80%, transparent);
  border-radius: var(--ds-radius-lg, 0.75rem 0 0.75rem 0);
  background: var(--ds-color-surface-container-high);
  color: var(--ds-color-on-surface);
  font-size: 1.1rem;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 150ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 45%, var(--ds-color-surface-container-high));
  }

  &--active {
    background: var(--ds-color-primary);
    border-color: transparent;
    color: var(--ds-color-on-primary);
    font-weight: 700;
  }

  @media (max-width: 1280px) {
      font-size: 0.9rem;
      border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
    }
}
</style>

<style lang="scss">
[data-mode='light'] .bible-chapters__search-input {
  background: #f7f8fc;
  border-color: #e8ecf3;
}

[data-mode='light'] .bible-chapters__search-input:focus {
  background: #fff;
}

[data-mode='light'] .bible-chapters__btn {
  background: #f5f6fa;
  border-color: #e8ecf3;
  color: #5b616b;
}

[data-mode='light'] .bible-chapters__btn:hover {
  background: color-mix(in srgb, var(--ds-color-primary) 8%, #f7f8fc);
  color: var(--ds-color-primary-soft);
}

[data-mode='light'] .bible-chapters__btn--active {
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  border-color: transparent;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
}
</style>
