<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MusicTrackActions from '@shared/components/MusicTrackActions.vue'
import type { AlbumSearchHit } from '../types/albums'

const props = defineProps<{
  hit: AlbumSearchHit
  busy?: boolean
}>()

const emit = defineEmits<{
  sung: []
  instrumental: []
  slides: []
  lyric: []
}>()

const { t } = useI18n()
const rowHovered = ref(false)
const downloadProgress = ref<number | null>(null)
const isDownloading = computed(() => downloadProgress.value != null)

function onDownloadProgress(progress: number | null) {
  downloadProgress.value = progress
}

function playSungFromRow() {
  if (props.busy || isDownloading.value) return
  emit('sung')
}
</script>

<template>
  <div
    class="album-search-hit"
    :class="{ 'album-search-hit--downloading': isDownloading }"
    role="button"
    tabindex="0"
    :aria-label="t('media.actions.sung')"
    @mouseenter="rowHovered = true"
    @mouseleave="rowHovered = false"
    @click="playSungFromRow"
    @keydown.enter.prevent="playSungFromRow"
    @keydown.space.prevent="playSungFromRow"
  >
    <div
      v-if="isDownloading"
      class="album-search-hit__download-overlay"
      aria-live="polite"
    >
      <div
        class="album-search-hit__download-fill"
        :style="{ width: `${downloadProgress}%` }"
        aria-hidden="true"
      />
      <span class="album-search-hit__download-percent">
        {{ downloadProgress }}%
      </span>
    </div>

    <span class="album-search-hit__info">
      <span class="album-search-hit__title-row">
        <span
          v-if="hit.isHymnal && hit.track != null"
          class="album-search-hit__number"
        >
          {{ hit.track }}
        </span>
        <span class="album-search-hit__title">
          {{ hit.name }}
        </span>
      </span>
      <span class="album-search-hit__subtitle">
        {{ hit.albumNames }}
      </span>
    </span>

    <span class="album-search-hit__duration">
      {{ hit.durationLabel }}
    </span>

    <div class="album-search-hit__actions">
      <MusicTrackActions
        :music-id="hit.musicId"
        :track-name="hit.name"
        :has-instrumental="hit.hasInstrumental"
        :busy="busy"
        :row-hovered="rowHovered"
        variant="contained"
        @sung="emit('sung')"
        @instrumental="emit('instrumental')"
        @slides="emit('slides')"
        @lyric="emit('lyric')"
        @download-progress="onDownloadProgress"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.album-search-hit {
  --album-search-accent: #ff8a3d;

  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4rem auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.95rem;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-outline) 70%, transparent);
  background: transparent;
  color: var(--ds-color-on-surface);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: background-color 140ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  }

  &--downloading {
    background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
  }

  &:last-child {
    border-bottom: none;
  }
}

.album-search-hit__download-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: hidden;
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
}

.album-search-hit__download-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ds-color-primary) 28%, transparent),
    color-mix(in srgb, var(--ds-color-primary) 48%, transparent)
  );
  transition: width 200ms ease;
}

.album-search-hit__download-percent {
  position: relative;
  z-index: 1;
  color: var(--ds-color-primary);
  font-size: 1.2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-shadow: 0 1px 8px rgb(0 0 0 / 45%);
}

.album-search-hit__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.album-search-hit__title-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.album-search-hit__number {
  flex-shrink: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--album-search-accent);
  font-variant-numeric: tabular-nums;
}

.album-search-hit__title {
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-search-hit__subtitle {
  font-size: 0.8rem;
  color: var(--album-search-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-search-hit__duration {
  font-size: 0.85rem;
  color: var(--ds-color-on-surface-variant);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.album-search-hit__actions {
  position: relative;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  justify-self: end;
}

@media (max-width: 720px) {
  .album-search-hit {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'title'
      'duration'
      'actions';
  }

  .album-search-hit__info {
    grid-area: title;
  }

  .album-search-hit__duration {
    grid-area: duration;
    text-align: left;
  }

  .album-search-hit__actions {
    grid-area: actions;
    justify-self: start;
  }
}
</style>
