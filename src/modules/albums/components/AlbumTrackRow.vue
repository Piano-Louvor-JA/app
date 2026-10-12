<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MusicTrackActions from '@shared/components/MusicTrackActions.vue'
import type { AlbumTrack } from '../types/albums'

const props = defineProps<{
  track: AlbumTrack
  collectionName?: string
  artworkUrl?: string | null
  busy?: boolean
}>()

const emit = defineEmits<{
  sung: []
  instrumental: []
  slides: []
  lyric: []
  playlist: []
}>()

const rowHovered = ref(false)
const downloadProgress = ref<number | null>(null)

const isDownloading = computed(() => downloadProgress.value != null)

const { t } = useI18n()

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
    class="album-track-row"
    :class="{ 'album-track-row--downloading': isDownloading }"
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
      class="album-track-row__download-overlay"
      aria-live="polite"
    >
      <div
        class="album-track-row__download-fill"
        :style="{ width: `${downloadProgress}%` }"
        aria-hidden="true"
      />
      <span class="album-track-row__download-percent">
        {{ downloadProgress }}%
      </span>
    </div>

    <span class="album-track-row__leading">
      <span class="album-track-row__number">
        {{ track.track ?? '—' }}
      </span>
      <button
        type="button"
        class="album-track-row__play"
        :disabled="busy || isDownloading"
        :title="t('media.actions.sung')"
        :aria-label="t('media.actions.sung')"
        @click.stop="emit('sung')"
      >
        <i
          class="ti ti-player-play"
          aria-hidden="true"
        />
      </button>
    </span>

    <span class="album-track-row__info">
      <span
        class="album-track-row__artwork"
        aria-hidden="true"
      >
        <img
          v-if="artworkUrl"
          :src="artworkUrl"
          alt=""
        >
        <i
          v-else
          class="ti ti-music"
        />
      </span>
      <span class="album-track-row__text">
        <span class="album-track-row__title">
          {{ track.name }}
        </span>
        <span
          v-if="collectionName"
          class="album-track-row__collection"
        >
          {{ collectionName }}
        </span>
      </span>
    </span>

    <span class="album-track-row__duration">
      {{ track.durationLabel }}
    </span>

    <div class="album-track-row__actions">
      <button
        type="button"
        class="album-track-row__playlist"
        :disabled="busy || isDownloading"
        title="Adicionar à playlist"
        aria-label="Adicionar à playlist"
        @click.stop="emit('playlist')"
      >
        <i class="ti ti-playlist-add" aria-hidden="true" />
      </button>
      <MusicTrackActions
        :music-id="track.musicId"
        :track-name="track.name"
        :has-instrumental="track.hasInstrumental"
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
.album-track-row {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) 7rem auto;
  align-items: center;
  gap: 0.75rem;
  min-height: 5rem;
  margin-bottom: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: color-mix(
    in srgb,
    var(--ds-color-surface-elevated) var(--ds-glass-fill, 72%),
    transparent
  );
  color: var(--ds-color-on-surface);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  transition:
    background-color var(--ds-motion-duration, 280ms) ease,
    border-color var(--ds-motion-duration, 280ms) ease,
    transform 160ms ease;

  &:hover {
    border-color: color-mix(
      in srgb,
      var(--ds-color-on-surface) 15%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--ds-color-surface-container-high) 82%,
      transparent
    );
  }

  &--downloading {
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.album-track-row__download-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
}

.album-track-row__download-fill {
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

.album-track-row__download-percent {
  position: relative;
  z-index: 1;
  color: var(--ds-color-primary);
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 8px rgb(0 0 0 / 45%);
}

.album-track-row__leading {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 1.5rem;
}

.album-track-row__number {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ds-color-on-surface-variant);
  transition: opacity 140ms ease;
}

.album-track-row__play {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-primary);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;

  .ti {
    font-size: 1.35rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    transform: scale(1.08);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
}

.album-track-row:hover .album-track-row__number,
.album-track-row:focus-within .album-track-row__number {
  opacity: 0;
}

.album-track-row:hover .album-track-row__play,
.album-track-row:focus-within .album-track-row__play {
  opacity: 1;
  pointer-events: auto;
}

.album-track-row__info {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.album-track-row__artwork {
  width: 3rem;
  height: 3rem;
  border-radius: 0.65rem 0 0.65rem 0;
  overflow: hidden;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .ti {
    font-size: 1.35rem;
    color: var(--ds-color-primary);
  }
}

.album-track-row__text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.album-track-row__title {
  font-weight: 650;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-track-row__collection {
  font-size: 0.8rem;
  color: var(--ds-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-track-row__duration {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  color: var(--ds-color-on-surface-variant);
  text-align: center;
}

.album-track-row__playlist {
  border: 0;
  border-radius: 999px;
  padding: 0.35rem;
  background: transparent;
  color: var(--ds-color-primary);
  cursor: pointer;
}

.album-track-row__playlist:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.album-track-row__actions {
  position: relative;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  justify-self: end;
}

@media (max-width: 720px) {
  .album-track-row {
    grid-template-columns: 3rem minmax(0, 1fr);
    grid-template-areas:
      'num title'
      'num duration'
      'num actions';
  }

  .album-track-row__leading {
    grid-area: num;
  }

  .album-track-row__info {
    grid-area: title;
  }

  .album-track-row__duration {
    grid-area: duration;
    text-align: left;
  }

  .album-track-row__actions {
    grid-area: actions;
    justify-self: start;
  }
}

@media (max-width: 1280px) {
  .album-track-row {
    min-height: 3.5rem;
    padding: 0.5rem 0.75rem;
    gap: 0.55rem;
  }
}
</style>
