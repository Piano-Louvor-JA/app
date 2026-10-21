<script setup lang="ts">
import AppIcon from '@design-system/components/AppIcon.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import StagePaletteButton from '../../settings/components/StagePaletteButton.vue'

import BibleVersionSelect from './BibleVersionSelect.vue'
import type { BibleVersion } from '../types/bible'

const props = defineProps<{
  versions: BibleVersion[]
  selectedVersionId: number | null
  locationLabel: string
  showNavPanel: boolean
  bibleSearchQuery: string
  versionsDisabled?: boolean
}>()

const emit = defineEmits<{
  selectVersion: [versionId: number]
  toggleNav: []
  openReference: []
  'update:bibleSearchQuery': [value: string]
}>()

const { t } = useI18n()

/** false = versículos; true = livros e capítulos.
 *  O rótulo indica o destino do próximo clique. */
const browseLabel = computed(() =>
  props.showNavPanel
    ? t('bible.browseVerses')
    : t('bible.browseBooksAndChapters'),
)

const browseIcon = computed(() =>
  props.showNavPanel ? 'ti-list-numbers' : 'ti-book-2',
)
</script>

<template>
  <GlassCard
    class="bible-toolbar"
    elevated
  >
    <div class="bible-toolbar__meta">
      <BibleVersionSelect
        :versions="versions"
        :selected-version-id="selectedVersionId"
        :disabled="versionsDisabled"
        @select="emit('selectVersion', $event)"
      />

      <div
        class="bible-toolbar__divider"
        aria-hidden="true"
      />

      <div class="bible-toolbar__field">
        <span class="bible-toolbar__label">{{ t('bible.location') }}</span>
        <span class="bible-toolbar__location">
          {{ locationLabel || t('bible.locationEmpty') }}
        </span>
      </div>
    </div>

    <div class="bible-toolbar__actions">
      <StagePaletteButton scope="bible" />
      <div class="bible-toolbar__search">
        <AppIcon name="search" class="bible-toolbar__search-icon"
          aria-hidden="true" />
        <input
          class="bible-toolbar__search-input"
          type="search"
          :value="bibleSearchQuery"
          :placeholder="t('bible.searchBible')"
          :aria-label="t('bible.searchBible')"
          @input="emit('update:bibleSearchQuery', ($event.target as HTMLInputElement).value)"
          @keydown.enter="emit('openReference')"
        >
      </div>

      <button
        type="button"
        class="bible-toolbar__browse"
        :class="{ 'bible-toolbar__browse--books': showNavPanel }"
        :aria-pressed="showNavPanel"
        :aria-label="browseLabel"
        @click="emit('toggleNav')"
      >
        <i
          :class="['ti', browseIcon]"
          aria-hidden="true"
        />
        <span>{{ browseLabel }}</span>
      </button>
    </div>
  </GlassCard>
</template>

<style scoped lang="scss">
.bible-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem !important;
  overflow: visible;

  @media (max-width: 1280px) {
      gap: 0.65rem;
      padding: 0.65rem 0.85rem !important;
    }
}

.bible-toolbar__meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-width: 0;
}

.bible-toolbar__field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.bible-toolbar__label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ds-color-on-surface-variant);
  opacity: 0.75;
}

.bible-toolbar__location {
  white-space: nowrap;
  font-weight: 500;
  color: var(--ds-color-on-surface);
}

.bible-toolbar__divider {
  width: 1px;
  height: 2rem;
  background: var(--ds-color-outline);
  flex-shrink: 0;
}

.bible-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
  min-width: 0;
}

.bible-toolbar__search {
  position: relative;
  width: 100%;
  max-width: calc((100% - 1.25rem) / 2);
  flex-shrink: 1;
  min-width: 0;

  @media (max-width: 767px) {
    max-width: 100%;
  }
}

.bible-toolbar__search-icon {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ds-color-on-surface-variant);
  pointer-events: none;
}

.bible-toolbar__search-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ds-color-outline-strong) 80%, transparent);
  border-radius: 999px;
  background: var(--ds-color-surface-container);
  color: var(--ds-color-on-surface);
  padding: 0.55rem 1rem 0.55rem 2.5rem;
  font-size: 0.875rem;
  outline: none;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;

  &:focus {
    border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  }
}


.bible-toolbar__browse {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 25%, transparent);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary-soft);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    transform 150ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }

  &:active {
    transform: scale(0.98);
  }

  &--books {
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }
}

@media (min-width: 801px) and (max-width: 1150px) {
  .bible-toolbar { flex-wrap: wrap; }
  .bible-toolbar__meta { flex: 1 1 100%; justify-content: space-between; }
  .bible-toolbar__search { flex: 1; max-width: none; }
}

</style>

<style lang="scss">
[data-mode='light'] .bible-toolbar__search-input {
  background: #f7f8fc;
  border-color: #e8ecf3;
}

[data-mode='light'] .bible-toolbar__search-input:focus {
  background: #fff;
}

[data-mode='light'] .bible-toolbar__browse {
  box-shadow: 0 1px 2px color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
}
</style>
