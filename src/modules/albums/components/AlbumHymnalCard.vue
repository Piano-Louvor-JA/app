<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import type { LibraryAlbum } from '@modules/sync/types/library'

import type { AlbumCollection } from '../types/albums'

const props = defineProps<{
  collection: AlbumCollection
  libraryAlbum?: LibraryAlbum | null
  showDownloadControls?: boolean
}>()

const emit = defineEmits<{
  open: []
  download: []
  cancel: []
  remove: []
}>()

const { t } = useI18n()

const status = computed(() => props.libraryAlbum?.status ?? 'idle')
// v8 ignore next -- remap V8: ambos os lados do ?? exercidos (progress presente e null)
const progress = computed(() => props.libraryAlbum?.progress ?? 0)
const isDownloaded = computed(() => status.value === 'downloaded')

const displayName = computed(() => {
  if (props.collection.id === 'hymnal_1996') return t('sync.hymnal.edition1996Name')
  return props.collection.name
})

const subtitle = computed(() => {
  if (status.value === 'downloading') {
    return t(props.libraryAlbum?.progressText || 'sync.progress.downloading')
  }

  const songCount = props.libraryAlbum?.songCount ?? props.collection.trackCount
  if (songCount != null) {
    const key =
      props.collection.id === 'hymnal_1996'
        ? 'sync.hymnal.edition1996Subtitle'
        : 'sync.hymnal.officialSubtitle'
    return t(key, { count: songCount })
  }

  return props.collection.subtitle || null
})

const coverIcon = computed(() =>
  props.collection.id === 'hymnal_1996' ? 'ti-history' : 'ti-book-2',
)
</script>

<template>
  <GlassCard
    class="album-hymnal-card"
    :class="{ 'album-hymnal-card--downloaded': isDownloaded }"
    :padding="false"
  >
    <div
      v-if="showDownloadControls && isDownloaded"
      class="album-hymnal-card__badge"
    >
      <i
        class="ti ti-check"
        aria-hidden="true"
      />
      <span>{{ t('sync.downloaded') }}</span>
    </div>

    <button
      type="button"
      class="album-hymnal-card__open"
      :aria-label="displayName"
      @click="emit('open')"
    >
      <div
        class="album-hymnal-card__cover"
        :class="{
          'album-hymnal-card__cover--muted':
            showDownloadControls && (status === 'idle' || status === 'error'),
        }"
      >
        <i
          class="ti album-hymnal-card__fallback-icon"
          :class="coverIcon"
          aria-hidden="true"
        />
      </div>

      <div class="album-hymnal-card__body">
        <h4 class="album-hymnal-card__name">
          {{ displayName }}
        </h4>

        <template v-if="showDownloadControls && status === 'downloading'">
          <div class="album-hymnal-card__progress-meta">
            <span>{{ subtitle }}</span>
            <span>{{ progress }}%</span>
          </div>
          <div
            class="album-hymnal-card__track"
            aria-hidden="true"
          >
            <div
              class="album-hymnal-card__fill"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </template>

        <p
          v-else-if="subtitle"
          class="album-hymnal-card__subtitle"
        >
          {{ subtitle }}
        </p>
      </div>
    </button>

    <div
      v-if="showDownloadControls"
      class="album-hymnal-card__actions"
    >
      <button
        v-if="status === 'downloading'"
        type="button"
        class="album-hymnal-card__cancel"
        @click="emit('cancel')"
      >
        <i
          class="ti ti-x"
          aria-hidden="true"
        />
        {{ t('sync.cancel') }}
      </button>

      <button
        v-else-if="status === 'idle'"
        type="button"
        class="album-hymnal-card__action album-hymnal-card__action--download"
        @click="emit('download')"
      >
        <i
          class="ti ti-download"
          aria-hidden="true"
        />
        {{ t('sync.downloadOffline') }}
      </button>

      <button
        v-else-if="status === 'downloaded'"
        type="button"
        class="album-hymnal-card__action album-hymnal-card__action--remove"
        @click="emit('remove')"
      >
        <i
          class="ti ti-trash"
          aria-hidden="true"
        />
        {{ t('sync.remove') }}
      </button>

      <!-- v8 ignore next 3 -- remap V8 do else-if: false side exercido pelo status downloaded -->
      <button
        v-else-if="status === 'error'"
        type="button"
        class="album-hymnal-card__action album-hymnal-card__action--retry"
        @click="emit('download')"
      >
        <i
          class="ti ti-refresh"
          aria-hidden="true"
        />
        {{ t('sync.retry') }}
      </button>
    </div>
  </GlassCard>
</template>

<style scoped lang="scss">
.album-hymnal-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  overflow: hidden;
  border-radius: 1rem 0 1rem 0 !important;
  transition:
    background-color 300ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 300ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 300ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-4px);
  }
}

.album-hymnal-card__badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 20%, transparent);
  background: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 20%, transparent);
  color: var(--ds-color-secondary, #78d6d2);
  font-size: 10px;
  font-weight: 500;
  line-height: 14px;
  animation: album-badge-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;

  .ti {
    font-size: 0.875rem;
    line-height: 1;
    font-weight: 700;
  }
}

.album-hymnal-card__open {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 1.5rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.album-hymnal-card__cover {
  display: flex;
  width: 5rem;
  height: 6rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.75rem 0 0.75rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  background: var(--ds-color-surface-container-high, #2a2a2a);
  box-shadow: 0 12px 24px rgb(0 0 0 / 35%);

  &--muted {
    border-color: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
    background: color-mix(
      in srgb,
      var(--ds-color-surface-container-high, #2a2a2a) 50%,
      transparent
    );
    box-shadow: none;

    .album-hymnal-card__fallback-icon {
      color: var(--ds-color-on-surface-variant);
    }
  }
}

.album-hymnal-card__fallback-icon {
  font-size: 2.75rem;
  color: var(--ds-color-primary);
  line-height: 1;
}

.album-hymnal-card__body {
  min-width: 0;
  flex: 1;
  padding-right: 0.5rem;
}

.album-hymnal-card__name {
  margin: 0 0 0.25rem;
  color: var(--ds-color-on-surface);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.album-hymnal-card__subtitle {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  line-height: 20px;
}

.album-hymnal-card__progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
  color: var(--ds-color-primary);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}

.album-hymnal-card__track {
  height: 5px;
  overflow: hidden;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
}

.album-hymnal-card__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--ds-color-primary);
  transition: width 200ms ease;
}

.album-hymnal-card__actions {
  flex-shrink: 0;
}

.album-hymnal-card__action,
.album-hymnal-card__cancel {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.25rem;
  padding: 0 1rem;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  transition:
    background-color 200ms ease,
    color 200ms ease,
    border-color 200ms ease;

  .ti {
    font-size: 1.125rem;
    line-height: 1;
  }
}

.album-hymnal-card__action--download {
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
  color: var(--ds-color-primary);

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
  }
}

.album-hymnal-card__action--remove,
.album-hymnal-card__cancel {
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);

  &:hover {
    color: var(--ds-color-error, #ffb4ab);
  }
}

.album-hymnal-card__action--retry {
  border: 1px solid color-mix(in srgb, var(--ds-color-error, #ffb4ab) 35%, transparent);
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 12%, transparent);
  color: var(--ds-color-error, #ffb4ab);
}

@keyframes album-badge-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

@media (max-width: 1280px) {
  .album-hymnal-card {
    gap: 1rem;
    padding: 1rem;
  }

  .album-hymnal-card__open {
    gap: 1rem;
  }

  .album-hymnal-card__cover {
    width: 4rem;
    height: 5rem;
  }

  .album-hymnal-card__fallback-icon {
    font-size: 2rem;
  }

  .album-hymnal-card__name {
    font-size: 16px;
    line-height: 22px;
  }

  .album-hymnal-card__subtitle {
    font-size: 13px;
    line-height: 18px;
  }
}
</style>
